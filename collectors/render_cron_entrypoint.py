"""
collectors/render_cron_entrypoint.py
FlyWise (APIx) — Render Cron Job Entrypoint.

This is the central execution script that Render executes on a recurring cron
schedule (every 4 hours).

Execution Workflow:
1. Self-whitelists this machine's public IP on Bright Data's zone management API.
2. Loads route configurations from config/routes_config.json:
   - Domestic (8 routes, windows: [1, 7, 15, 21, 30, 45])
   - International (4 routes, windows: [1, 30, 60], currencies: AED/SGD)
   - Seasonal (2 routes, conditional on current date matching season_window)
3. For each route and lead-time window:
   - Calculates target travel_date = today + advance_days.
   - Calls bright_data_adapter.fetch_fares() as the PRIMARY collector.
   - If Bright Data returns errors or 0 observations, FALLS BACK to
     scrappa_adapter.fetch_fares().
   - If both fail, logs the failure without fabricating any data.
   - Writes raw outputs to collectors/raw_output/{domestic|international}/.
4. Executes ota_scraper.py for configured OTA routes (e.g. DEL-BOM, DEL-BLR).
5. Emits a comprehensive execution summary report with per-route success/failure
   metrics, optimized for the Render Log Viewer.
6. NOTE: This script does NOT write to PostgreSQL directly — database ingestion
   is handled by the downstream ingestion pipeline.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any, Optional

# Ensure collectors/ directory is on sys.path for local module imports
COLLECTORS_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = COLLECTORS_DIR.parent
if str(COLLECTORS_DIR) not in sys.path:
    sys.path.insert(0, str(COLLECTORS_DIR))

# Import adapters
from bright_data_adapter import (
    fetch_fares as bd_fetch_fares,
    save_raw_output as bd_save_raw_output,
    whitelist_current_ip,
)
from scrappa_adapter import (
    fetch_fares as sc_fetch_fares,
    save_raw_output as sc_save_raw_output,
)
from ota_scraper import (
    fetch_fares as ota_fetch_fares,
    save_raw_output as ota_save_raw_output,
)

# Import Ingestion Pipeline
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))
from ingestion.pipeline import run_ingestion_pipeline

# ---------------------------------------------------------------------------
# Logging Setup
# ---------------------------------------------------------------------------

ERRORS_LOG = COLLECTORS_DIR / "errors.log"

logger = logging.getLogger("render_cron")
logger.setLevel(logging.INFO)
logger.propagate = False

if not logger.handlers:
    # Console handler (for Render Log Viewer)
    stream_handler = logging.StreamHandler(sys.stdout)
    stream_handler.setFormatter(
        logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")
    )
    logger.addHandler(stream_handler)

    # File handler (for persistent error logging)
    file_handler = logging.FileHandler(ERRORS_LOG, mode="a", encoding="utf-8")
    file_handler.setLevel(logging.ERROR)
    file_handler.setFormatter(
        logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")
    )
    logger.addHandler(file_handler)


# ---------------------------------------------------------------------------
# Month parsing for Seasonal Route Evaluation
# ---------------------------------------------------------------------------

MONTH_MAP: dict[str, int] = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4,
    "may": 5, "jun": 6, "jul": 7, "aug": 8,
    "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}


def is_in_season_window(season_window: Optional[str], check_date: date) -> bool:
    """Evaluate whether check_date falls inside a season_window string.

    Supports formats like 'Oct-Mar', 'Apr-Oct', 'Nov-Feb'.

    Args:
        season_window: Window string, e.g. 'Oct-Mar', or None.
        check_date: Date to evaluate against.

    Returns:
        True if check_date is inside the window or if season_window is None/empty.
    """
    if not season_window:
        return True

    parts = season_window.strip().split("-")
    if len(parts) != 2:
        logger.warning("Unrecognized season_window format '%s' — defaulting to True", season_window)
        return True

    start_str = parts[0].strip()[:3].lower()
    end_str = parts[1].strip()[:3].lower()

    start_m = MONTH_MAP.get(start_str)
    end_m = MONTH_MAP.get(end_str)

    if not start_m or not end_m:
        logger.warning("Could not parse month in '%s' — defaulting to True", season_window)
        return True

    curr_m = check_date.month

    if start_m <= end_m:
        # Range within the same calendar year, e.g. Apr-Oct (4 to 10)
        return start_m <= curr_m <= end_m
    else:
        # Range wraps around new year, e.g. Oct-Mar (10 to 12 or 1 to 3)
        return curr_m >= start_m or curr_m <= end_m


# ---------------------------------------------------------------------------
# Route Config Loader
# ---------------------------------------------------------------------------

def load_routes_config() -> dict[str, Any]:
    """Load routes_config.json from candidate locations.

    Candidate paths:
    1. config/routes_config.json
    2. collectors/routes_config.json
    3. ./routes_config.json
    """
    candidate_paths = [
        PROJECT_ROOT / "config" / "routes_config.json",
        COLLECTORS_DIR / "routes_config.json",
        Path("routes_config.json"),
    ]

    for p in candidate_paths:
        if p.is_file():
            try:
                with open(p, "r", encoding="utf-8") as f:
                    config = json.load(f)
                logger.info("Loaded routes configuration from %s", p)
                return config
            except Exception as e:
                logger.error("Failed to parse config file %s: %s", p, e)

    raise FileNotFoundError(
        "Could not find routes_config.json in any expected location: "
        f"{[str(p) for p in candidate_paths]}"
    )


# ---------------------------------------------------------------------------
# Route Processing Core
# ---------------------------------------------------------------------------

def process_route_window(
    origin: str,
    destination: str,
    travel_date: str,
    advance_days: int,
    route_type: str,
) -> dict[str, Any]:
    """Execute primary (Bright Data) -> fallback (Scrappa) collection for a route/window.

    Returns:
        Summary dict containing status, observations_count, source_used, and errors.
    """
    route_id = f"{origin}-{destination}"
    res_summary: dict[str, Any] = {
        "route_id": route_id,
        "route_type": route_type,
        "advance_days": advance_days,
        "travel_date": travel_date,
        "status": "FAILED",
        "observations_count": 0,
        "source_used": "none",
        "errors": [],
    }

    logger.info(
        "[%s | T+%d] Querying primary collector (Bright Data) for date %s",
        route_id, advance_days, travel_date,
    )

    # ------------------------------------------------------------------
    # 1. Primary Attempt: Bright Data
    # ------------------------------------------------------------------
    bd_result: Optional[dict[str, Any]] = None
    bd_success = False
    try:
        bd_result = bd_fetch_fares(
            origin=origin,
            destination=destination,
            travel_date=travel_date,
            advance_days=advance_days,
        )
        bd_obs = bd_result.get("observations", [])
        bd_errors = bd_result.get("errors", [])

        if bd_obs and len(bd_obs) > 0 and not bd_errors:
            bd_success = True
            saved_path = bd_save_raw_output(bd_result)
            logger.info(
                "[%s | T+%d] Bright Data SUCCESS: %d observations collected -> %s",
                route_id, advance_days, len(bd_obs), saved_path,
            )
            res_summary["status"] = "SUCCESS"
            res_summary["observations_count"] = len(bd_obs)
            res_summary["source_used"] = "bright_data"
            return res_summary
        else:
            err_details = "; ".join(bd_errors) if bd_errors else "0 observations extracted"
            logger.warning(
                "[%s | T+%d] Bright Data produced no valid observations: %s",
                route_id, advance_days, err_details,
            )
            res_summary["errors"].append(f"Bright Data: {err_details}")

    except Exception as e:
        logger.warning(
            "[%s | T+%d] Bright Data exception: %s: %s",
            route_id, advance_days, type(e).__name__, e,
        )
        res_summary["errors"].append(f"Bright Data Exception: {type(e).__name__}: {e}")

    # ------------------------------------------------------------------
    # 2. Fallback Attempt: Scrappa Google Flights API
    # ------------------------------------------------------------------
    logger.info(
        "[%s | T+%d] Falling back to secondary collector (Scrappa Google Flights API)",
        route_id, advance_days,
    )

    try:
        sc_result = sc_fetch_fares(
            origin=origin,
            destination=destination,
            travel_date=travel_date,
            advance_days=advance_days,
        )
        sc_obs = sc_result.get("observations", [])
        sc_errors = sc_result.get("errors", [])

        if sc_obs and len(sc_obs) > 0 and not sc_errors:
            saved_path = sc_save_raw_output(sc_result)
            logger.info(
                "[%s | T+%d] Scrappa FALLBACK SUCCESS: %d observations collected -> %s",
                route_id, advance_days, len(sc_obs), saved_path,
            )
            res_summary["status"] = "SUCCESS"
            res_summary["observations_count"] = len(sc_obs)
            res_summary["source_used"] = "scrappa"
            return res_summary
        else:
            err_details = "; ".join(sc_errors) if sc_errors else "0 observations returned"
            logger.error(
                "[%s | T+%d] Scrappa fallback FAILED: %s",
                route_id, advance_days, err_details,
            )
            res_summary["errors"].append(f"Scrappa: {err_details}")

    except Exception as e:
        logger.error(
            "[%s | T+%d] Scrappa fallback exception: %s: %s",
            route_id, advance_days, type(e).__name__, e,
        )
        res_summary["errors"].append(f"Scrappa Exception: {type(e).__name__}: {e}")

    # ------------------------------------------------------------------
    # 3. Both Failed: Log and skip (Zero data fabrication)
    # ------------------------------------------------------------------
    logger.error(
        "[%s | T+%d] All collectors failed for %s. Skipping without data fabrication.",
        route_id, advance_days, travel_date,
    )
    res_summary["status"] = "FAILED"
    res_summary["source_used"] = "none"
    return res_summary


def process_ota_scrape(
    origin: str,
    destination: str,
    travel_date: str,
    advance_days: int,
) -> dict[str, Any]:
    """Execute OTA scraper (Playwright) once per cycle for designated route."""
    route_id = f"{origin}-{destination}"
    res_summary: dict[str, Any] = {
        "route_id": route_id,
        "route_type": "OTA Scrape",
        "advance_days": advance_days,
        "travel_date": travel_date,
        "status": "FAILED",
        "observations_count": 0,
        "source_used": "ota_playwright",
        "errors": [],
    }

    logger.info(
        "[OTA Scraper | %s | T+%d] Running Playwright OTA direct scrape for %s",
        route_id, advance_days, travel_date,
    )

    try:
        ota_result = ota_fetch_fares(
            origin=origin,
            destination=destination,
            travel_date=travel_date,
            advance_days=advance_days,
        )
        obs = ota_result.get("observations", [])
        errs = ota_result.get("errors", [])

        if obs and len(obs) > 0:
            saved_path = ota_save_raw_output(ota_result)
            logger.info(
                "[OTA Scraper | %s | T+%d] SUCCESS: %d observations collected -> %s",
                route_id, advance_days, len(obs), saved_path,
            )
            res_summary["status"] = "SUCCESS"
            res_summary["observations_count"] = len(obs)
            res_summary["errors"] = errs
        else:
            err_details = "; ".join(errs) if errs else "0 observations found"
            logger.warning(
                "[OTA Scraper | %s | T+%d] Failed to collect observations: %s",
                route_id, advance_days, err_details,
            )
            res_summary["errors"].append(err_details)

    except Exception as e:
        logger.error(
            "[OTA Scraper | %s | T+%d] Unexpected exception: %s: %s",
            route_id, advance_days, type(e).__name__, e,
        )
        res_summary["errors"].append(f"{type(e).__name__}: {e}")

    return res_summary


# ---------------------------------------------------------------------------
# Main Cron Job Loop
# ---------------------------------------------------------------------------

def run_collection_cycle(
    filter_route: Optional[str] = None,
    limit_windows: Optional[int] = None,
    skip_ota: bool = False,
    skip_ingest: bool = False,
) -> dict[str, Any]:
    """Execute one complete 4-hour collection cycle across all configured routes.

    Args:
        filter_route: Optional route_id (e.g. 'DEL-BOM') to test only a single route.
        limit_windows: Optional int to test only the first N windows per route.
        skip_ota: If True, bypasses the OTA Playwright scraper step.
        skip_ingest: If True, bypasses the PostgreSQL ingestion pipeline step.

    Returns:
        Aggregated summary dictionary.
    """
    cycle_start = datetime.now(UTC)
    today = cycle_start.date()
    logger.info("=" * 80)
    logger.info("FlyWise (APIx) Collection Cycle Started: %s UTC", cycle_start.isoformat())
    logger.info("=" * 80)

    # Step 0: Self-whitelist current outbound IP on Bright Data zone
    logger.info("--- Step 0: Bright Data Zone IP Whitelisting ---")
    try:
        whitelist_current_ip()
    except Exception as e:
        logger.warning("IP whitelisting step failed: %s — proceeding with cycle.", e)

    # Step 1: Load routes configuration
    logger.info("--- Step 1: Loading Route Configuration ---")
    config = load_routes_config()

    domestic_routes = config.get("domestic", [])
    international_routes = config.get("international", [])
    seasonal_routes = config.get("seasonal", [])
    ota_routes = config.get("ota_routes", [])

    results_log: list[dict[str, Any]] = []

    # Helper to process a route definition
    def run_route(route_def: dict[str, Any], r_type: str) -> None:
        rid = route_def.get("route_id", "")
        if filter_route and rid != filter_route:
            return

        origin = route_def.get("origin") or rid.split("-")[0]
        destination = route_def.get("destination") or rid.split("-")[1]
        windows = route_def.get("windows", [1, 7, 15, 21, 30, 45])
        if limit_windows:
            windows = windows[:limit_windows]

        # Seasonal evaluation
        if r_type == "seasonal":
            s_win = route_def.get("season_window")
            if not is_in_season_window(s_win, today):
                logger.info(
                    "Skipping seasonal route %s: current date %s is outside window '%s'",
                    rid, today, s_win,
                )
                return
            logger.info("Seasonal route %s is IN SEASON for %s (window: %s)", rid, today, s_win)

        logger.info(
            "Processing %s route: %s (%s -> %s) across windows %s",
            r_type.upper(), rid, origin, destination, windows,
        )

        for win in windows:
            t_date = (today + timedelta(days=win)).strftime("%Y-%m-%d")
            res = process_route_window(
                origin=origin,
                destination=destination,
                travel_date=t_date,
                advance_days=win,
                route_type=r_type,
            )
            results_log.append(res)

    # Execute Domestic Routes
    logger.info("--- Step 2: Processing Domestic Routes (%d configured) ---", len(domestic_routes))
    for r in domestic_routes:
        run_route(r, "domestic")

    # Execute International Routes
    logger.info("--- Step 3: Processing International Routes (%d configured) ---", len(international_routes))
    for r in international_routes:
        run_route(r, "international")

    # Execute Seasonal Routes (conditional on season_window)
    logger.info("--- Step 4: Processing Seasonal Routes (%d configured) ---", len(seasonal_routes))
    for r in seasonal_routes:
        run_route(r, "seasonal")

    # Execute OTA Scrapes (1-2 routes per cycle)
    if not skip_ota:
        logger.info("--- Step 5: Processing OTA Direct Scrapes (%d configured) ---", len(ota_routes))
        for o_def in ota_routes:
            rid = o_def.get("route_id", "")
            if filter_route and rid != filter_route:
                continue
            origin = o_def.get("origin") or rid.split("-")[0]
            destination = o_def.get("destination") or rid.split("-")[1]
            win = o_def.get("window", 21)
            t_date = (today + timedelta(days=win)).strftime("%Y-%m-%d")

            res_ota = process_ota_scrape(
                origin=origin,
                destination=destination,
                travel_date=t_date,
                advance_days=win,
            )
            results_log.append(res_ota)

    # -----------------------------------------------------------------------
    # Step 6: Ingestion Pipeline (PostgreSQL insertion & raw archival)
    # -----------------------------------------------------------------------
    ingest_result = None
    if not skip_ingest:
        logger.info("--- Step 6: Running Ingestion Pipeline into Neon PostgreSQL ---")
        try:
            ingest_result = run_ingestion_pipeline()
        except Exception as e:
            logger.error("Ingestion pipeline failed during cron execution: %s", e)
            ingest_result = {"status": "ERROR", "error": str(e)}

    # -----------------------------------------------------------------------
    # Step 7: End-of-Run Summary Report
    # -----------------------------------------------------------------------
    cycle_end = datetime.now(UTC)
    duration_secs = (cycle_end - cycle_start).total_seconds()

    total_queries = len(results_log)
    success_queries = sum(1 for r in results_log if r["status"] == "SUCCESS")
    failed_queries = total_queries - success_queries
    total_observations = sum(r["observations_count"] for r in results_log)

    # Group metrics by route
    by_route: dict[str, dict[str, Any]] = {}
    for r in results_log:
        rid = r["route_id"]
        if rid not in by_route:
            by_route[rid] = {
                "route_type": r["route_type"],
                "attempts": 0,
                "successes": 0,
                "failures": 0,
                "observations": 0,
                "sources": set(),
            }
        by_route[rid]["attempts"] += 1
        if r["status"] == "SUCCESS":
            by_route[rid]["successes"] += 1
            by_route[rid]["sources"].add(r["source_used"])
        else:
            by_route[rid]["failures"] += 1
        by_route[rid]["observations"] += r["observations_count"]

    logger.info("")
    logger.info("=" * 80)
    logger.info("FLYWISE COLLECTION & INGESTION CYCLE SUMMARY REPORT")
    logger.info("=" * 80)
    logger.info("Start Time: %s UTC | End Time: %s UTC (Duration: %.1fs)",
                cycle_start.strftime("%Y-%m-%d %H:%M:%S"),
                cycle_end.strftime("%Y-%m-%d %H:%M:%S"),
                duration_secs)
    logger.info("Total Queries Attempted: %d | Succeeded: %d | Failed: %d",
                total_queries, success_queries, failed_queries)
    logger.info("Total Flight Observations Collected: %d", total_observations)

    if ingest_result:
        logger.info("-" * 80)
        logger.info("INGESTION PIPELINE RESULTS:")
        logger.info("  Status:               %s", ingest_result.get("status"))
        logger.info("  Files Processed:      %d", ingest_result.get("files_processed", 0))
        logger.info("  Raw Observations:     %d", ingest_result.get("raw_observations", 0))
        logger.info("  Deduped Observations: %d", ingest_result.get("deduped_observations", 0))
        logger.info("  Duplicates Dropped:   %d", ingest_result.get("dropped_duplicates", 0))
        logger.info("  Inserted into Neon:   %d", ingest_result.get("inserted_count", 0))
        if "duration_seconds" in ingest_result:
            logger.info("  Ingest Duration:      %.2fs", ingest_result["duration_seconds"])

    logger.info("-" * 80)
    logger.info("%-10s | %-12s | %-8s | %-8s | %-12s | %s",
                "Route", "Type", "Success", "Failed", "Observations", "Sources")
    logger.info("-" * 80)

    for rid, stats in sorted(by_route.items()):
        srcs = ", ".join(sorted(stats["sources"])) if stats["sources"] else "None"
        logger.info("%-10s | %-12s | %-8d | %-8d | %-12d | %s",
                    rid, stats["route_type"], stats["successes"], stats["failures"],
                    stats["observations"], srcs)

    logger.info("=" * 80)

    # If any failures occurred, log brief error summary
    if failed_queries > 0:
        logger.warning("Failures encountered during cycle:")
        for r in results_log:
            if r["status"] == "FAILED":
                logger.warning("  [-] %s (T+%d): %s", r["route_id"], r["advance_days"], "; ".join(r["errors"]))

    return {
        "cycle_start": cycle_start.isoformat(),
        "cycle_end": cycle_end.isoformat(),
        "duration_seconds": duration_secs,
        "total_queries": total_queries,
        "success_queries": success_queries,
        "failed_queries": failed_queries,
        "total_observations": total_observations,
        "by_route": {k: {**v, "sources": list(v["sources"])} for k, v in by_route.items()},
        "ingestion": ingest_result,
    }


# ---------------------------------------------------------------------------
# CLI Parser
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="FlyWise (APIx) — Render Cron Job Entrypoint (Collection & Ingestion Cycle)"
    )
    parser.add_argument(
        "--route",
        type=str,
        default=None,
        help="Test a specific route only, e.g. DEL-BOM or DEL-DXB",
    )
    parser.add_argument(
        "--windows",
        type=int,
        default=None,
        help="Limit number of advance windows per route (useful for fast verification)",
    )
    parser.add_argument(
        "--skip-ota",
        action="store_true",
        help="Skip the OTA direct scraper step",
    )
    parser.add_argument(
        "--skip-ingest",
        action="store_true",
        help="Skip the PostgreSQL ingestion pipeline step",
    )
    args = parser.parse_args()

    run_collection_cycle(
        filter_route=args.route,
        limit_windows=args.windows,
        skip_ota=args.skip_ota,
        skip_ingest=args.skip_ingest,
    )


if __name__ == "__main__":
    main()
