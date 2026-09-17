"""
processing/render_cron_entrypoint.py
FlyWise (APIx) — Processing pipeline orchestrator.

Single script executed by GitHub Actions Workflow 2 (process.yml), ~15 minutes
after the collection workflow finishes each cycle.  Runs three stages in strict
sequence against the Neon Postgres database:

  1. quality_fx_engine  — FX lock, reconciliation check, quality scoring.
  2. imputation         — Gap-filling via 4-tier priority cascade.
  3. index_engine       — Jevons route indices → DAPIx/IAPIx/Overall APIx.

Each stage depends on the previous stage's Postgres writes, so they MUST run
sequentially.  If an individual stage encounters per-row errors it logs them
and continues (per our "log and skip, never fabricate" rule).  The script only
exits non-zero if a stage fails *entirely* (e.g. cannot connect to Postgres).

This script touches Postgres ONLY — no Bright Data, Scrappa, or Playwright
calls, so no external API credentials are needed.
"""

from __future__ import annotations

import logging
import os
import sys
import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------

PROJECT_ROOT = Path(__file__).resolve().parent.parent

# Ensure processing/ is on sys.path so sibling modules import cleanly
PROCESSING_DIR = Path(__file__).resolve().parent
if str(PROCESSING_DIR) not in sys.path:
    sys.path.insert(0, str(PROCESSING_DIR))

# Also add project root for ingestion imports used by quality_fx_engine
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from dotenv import load_dotenv

load_dotenv(dotenv_path=PROJECT_ROOT / "config" / ".env")

logger = logging.getLogger("processing_pipeline")
if not logger.handlers:
    sh = logging.StreamHandler(sys.stdout)
    sh.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s"))
    logger.addHandler(sh)
    logger.setLevel(logging.INFO)


# ---------------------------------------------------------------------------
# Stage runners
# ---------------------------------------------------------------------------

def _run_quality_fx() -> dict[str, Any]:
    """Stage 1: Quality + FX engine.

    Processes all observations where fx_rate_used IS NULL:
      • FX Lock — convert foreign currencies to INR.
      • Reconciliation — flag component-sum mismatches and glitch fares.
      • Quality Score — composite score per observation.
    """
    from quality_fx_engine import run_quality_fx_engine

    logger.info("=" * 80)
    logger.info("STAGE 1/3 — Quality + FX Engine")
    logger.info("=" * 80)

    result = run_quality_fx_engine()

    # Log summary
    processed = result.get("processed", 0)
    fx_converted = result.get("fx_converted", 0)
    recon_fail = result.get("reconciliation_failures", 0)
    glitch = result.get("glitch_fares", 0)
    flags = result.get("flags_inserted", 0)
    avg_qs = result.get("avg_quality_score")

    logger.info("  Observations processed:    %d", processed)
    logger.info("  FX conversions applied:    %d", fx_converted)
    logger.info("  Reconciliation failures:   %d", recon_fail)
    logger.info("  Glitch fares flagged:      %d", glitch)
    logger.info("  Total flags inserted:      %d", flags)
    logger.info("  Avg quality score:         %s", f"{avg_qs:.4f}" if avg_qs else "N/A")

    return result


def _run_imputation() -> dict[str, Any]:
    """Stage 2: Imputation engine.

    Fills gaps for the current cycle using the 4-tier priority cascade:
      1. neighbor_window
      2. time_carry_forward
      3. cross_route
      4. full_carry_forward
    """
    from imputation import run_imputation

    logger.info("=" * 80)
    logger.info("STAGE 2/3 — Imputation Engine")
    logger.info("=" * 80)

    result = run_imputation()

    # Log summary with method breakdown
    expected = result.get("expected_slots", 0)
    existing = result.get("existing_real", 0)
    gaps = result.get("missing_gaps", 0)
    imputed = result.get("imputed", 0)
    failed = result.get("imputation_failed", 0)
    methods = result.get("method_breakdown", {})

    logger.info("  Expected slots today:      %d", expected)
    logger.info("  Existing (real) obs:       %d", existing)
    logger.info("  Gaps identified:           %d", gaps)
    logger.info("  Successfully imputed:      %d", imputed)
    logger.info("  Failed (no history):       %d", failed)
    if methods:
        logger.info("  Method breakdown:")
        for method, count in sorted(methods.items()):
            logger.info("    %-24s %d", method + ":", count)

    # Log coverage scores
    coverage = result.get("coverage_scores", {})
    if coverage:
        low_coverage = {r: s for r, s in coverage.items() if s < 0.80}
        if low_coverage:
            logger.warning(
                "  LOW COVERAGE routes: %s",
                ", ".join(f"{r}={s:.2f}" for r, s in sorted(low_coverage.items())),
            )

    return result


def _run_index_engine() -> dict[str, Any]:
    """Stage 3: Index engine.

    Computes:
      • Route-level Jevons geometric-mean indices.
      • DAPIx (domestic weighted sum).
      • IAPIx (international weighted sum).
      • Overall APIx (combined).
    """
    from index_engine import run_index_engine

    logger.info("=" * 80)
    logger.info("STAGE 3/3 — Index Engine")
    logger.info("=" * 80)

    result = run_index_engine()

    # Log summary
    route_n = result.get("route_indices_computed", 0)
    national_n = result.get("national_indices_upserted", 0)
    dapix = result.get("dapix_range", "N/A")
    iapix = result.get("iapix_range", "N/A")
    overall = result.get("overall_apix_range", "N/A")
    status = result.get("index_status", "N/A")
    coverage = result.get("coverage_score", 0)
    confidence = result.get("confidence_score", 0)

    logger.info("  Route indices computed:    %d", route_n)
    logger.info("  National indices written:  %d", national_n)
    logger.info("  DAPIx range:               %s", dapix)
    logger.info("  IAPIx range:               %s", iapix)
    logger.info("  Overall APIx range:        %s", overall)
    logger.info("  Index status:              %s", status)
    logger.info("  Coverage score:            %.4f", coverage)
    logger.info("  Confidence score:          %.4f", confidence)

    return result


# ---------------------------------------------------------------------------
# Main orchestrator
# ---------------------------------------------------------------------------

def run_processing_pipeline() -> dict[str, Any]:
    """Execute the full 3-stage processing pipeline in strict sequence.

    Returns:
        Combined summary dict from all three stages.

    Raises:
        SystemExit(1) if any stage fails entirely (e.g. DB connection error).
        A stage returning partial results (some rows failed) is NOT a fatal
        error — the imputation hierarchy is designed to handle gaps gracefully.
    """
    pipeline_start = datetime.now(timezone.utc)

    logger.info("#" * 80)
    logger.info("#  FlyWise Processing Pipeline")
    logger.info("#  Started: %s UTC", pipeline_start.isoformat())
    logger.info("#  NEON_DATABASE_URL: %s", "***set***" if os.getenv("NEON_DATABASE_URL") else "NOT SET")
    logger.info("#" * 80)

    combined: dict[str, Any] = {
        "pipeline_start": pipeline_start.isoformat(),
        "stages": {},
    }

    # ── Stage 1: Quality + FX ─────────────────────────────────────
    try:
        qfx_result = _run_quality_fx()
        combined["stages"]["quality_fx"] = qfx_result
    except Exception as e:
        logger.error(
            "STAGE 1 FAILED ENTIRELY: %s\n%s",
            e, traceback.format_exc(),
        )
        combined["stages"]["quality_fx"] = {"status": "FATAL_ERROR", "error": str(e)}
        # Fatal — cannot proceed without FX conversion
        logger.error("Aborting pipeline: quality_fx_engine failed completely.")
        combined["pipeline_status"] = "FAILED"
        _print_final_summary(combined, pipeline_start)
        sys.exit(1)

    # ── Stage 2: Imputation ───────────────────────────────────────
    try:
        imp_result = _run_imputation()
        combined["stages"]["imputation"] = imp_result
    except Exception as e:
        logger.error(
            "STAGE 2 FAILED ENTIRELY: %s\n%s",
            e, traceback.format_exc(),
        )
        combined["stages"]["imputation"] = {"status": "FATAL_ERROR", "error": str(e)}
        # Non-fatal for index engine — it can still compute with whatever
        # observations exist, but log a loud warning.
        logger.warning(
            "Imputation failed — index engine will proceed with available data only.",
        )

    # ── Stage 3: Index Engine ─────────────────────────────────────
    try:
        idx_result = _run_index_engine()
        combined["stages"]["index_engine"] = idx_result
    except Exception as e:
        logger.error(
            "STAGE 3 FAILED ENTIRELY: %s\n%s",
            e, traceback.format_exc(),
        )
        combined["stages"]["index_engine"] = {"status": "FATAL_ERROR", "error": str(e)}
        # Index engine failure is serious but the data is still safely in Postgres.
        # Next cycle will recompute.
        logger.error("Index engine failed — indices will be stale until next cycle.")
        combined["pipeline_status"] = "PARTIAL_FAILURE"
        _print_final_summary(combined, pipeline_start)
        sys.exit(1)

    combined["pipeline_status"] = "SUCCESS"
    _print_final_summary(combined, pipeline_start)
    return combined


def _print_final_summary(combined: dict, pipeline_start: datetime) -> None:
    """Print a final human-readable summary of the entire pipeline run."""
    pipeline_end = datetime.now(timezone.utc)
    duration = (pipeline_end - pipeline_start).total_seconds()

    logger.info("#" * 80)
    logger.info("#  FLYWISE PROCESSING PIPELINE — FINAL SUMMARY")
    logger.info("#" * 80)
    logger.info("  Pipeline status:     %s", combined.get("pipeline_status", "UNKNOWN"))
    logger.info("  Total duration:      %.2fs", duration)

    # Quality + FX summary
    qfx = combined.get("stages", {}).get("quality_fx", {})
    logger.info("  ── Quality + FX ──")
    logger.info("    Processed:         %s", qfx.get("processed", "N/A"))
    logger.info("    Flags inserted:    %s", qfx.get("flags_inserted", "N/A"))

    # Imputation summary
    imp = combined.get("stages", {}).get("imputation", {})
    logger.info("  ── Imputation ──")
    logger.info("    Gaps filled:       %s", imp.get("imputed", "N/A"))
    logger.info("    Methods:           %s", imp.get("method_breakdown", "N/A"))

    # Index summary
    idx = combined.get("stages", {}).get("index_engine", {})
    logger.info("  ── Index Engine ──")
    logger.info("    Route indices:     %s", idx.get("route_indices_computed", "N/A"))
    logger.info("    National indices:  %s", idx.get("national_indices_upserted", "N/A"))
    logger.info("    Overall APIx:      %s", idx.get("overall_apix_range", "N/A"))

    logger.info("#" * 80)


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    run_processing_pipeline()
