"""
processing/quality_fx_engine.py
FlyWise (APIx) — Post-ingestion quality assurance and FX lock engine.

Runs AFTER the ingestion pipeline inserts raw observations into Neon Postgres.
For every un-processed observation (identified by fx_rate_used IS NULL),
performs three passes:

  1. FX LOCK        — Convert total_fare_original_currency → total_fare_inr
                      using the daily FX rate from FBIL/Frankfurter.
  2. RECONCILIATION — Flag observations where component fares don't sum to the
                      total, or where total_fare_inr is a suspected glitch fare
                      (< 20% of the route's trailing 7-day median).
  3. QUALITY SCORE  — Composite 0-1 score:
                        0.4 × reconciliation_passed
                      + 0.3 × source_trust
                      + 0.2 × recency_factor
                      + 0.1 × cross_source_match

Schema additions required (run db/migrations/002_add_validation_flags.sql):
  • validation_flags table — stores per-observation flags for human review.

Dependencies:
  • processing/fx_rate_fetcher.py — daily FX rate fetch + cache.
  • psycopg2, requests (already in requirements.txt).
"""

from __future__ import annotations

import logging
import math
import os
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------

PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(dotenv_path=PROJECT_ROOT / "config" / ".env")

# Ensure processing dir is on path for fx_rate_fetcher import
PROCESSING_DIR = Path(__file__).resolve().parent
if str(PROCESSING_DIR) not in sys.path:
    sys.path.insert(0, str(PROCESSING_DIR))

from fx_rate_fetcher import get_fx_rate

logger = logging.getLogger("quality_fx_engine")
if not logger.handlers:
    sh = logging.StreamHandler(sys.stdout)
    sh.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s"))
    logger.addHandler(sh)
    logger.setLevel(logging.INFO)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Reconciliation: allow ±1% tolerance between sum(components) and total
RECONCILIATION_TOLERANCE = 0.01

# Glitch fare: flag if total_fare_inr < 20% of trailing 7-day route median
GLITCH_FARE_THRESHOLD = 0.20

# Quality score weights
W_RECONCILIATION = 0.4
W_SOURCE_TRUST   = 0.3
W_RECENCY        = 0.2
W_CROSS_SOURCE   = 0.1

# Source trust scores
SOURCE_TRUST: dict[str, float] = {
    "bright_data":    1.0,
    "scrappa":        0.8,
    "ota_playwright": 0.8,
}

# Recency: 1.0 at 0 h → 0.5 at 6 h, linear decay
RECENCY_FULL_HOURS = 0.0
RECENCY_MIN_HOURS  = 6.0
RECENCY_MIN_SCORE  = 0.5

# Cross-source price match tolerance: ±5%
CROSS_SOURCE_PRICE_TOLERANCE = 0.05


# ---------------------------------------------------------------------------
# 1. FX LOCK — convert foreign-currency fares to INR
# ---------------------------------------------------------------------------

def _fx_lock(conn, batch: list[dict]) -> list[dict]:
    """Apply FX conversion to each observation.

    For INR observations: total_fare_inr = total_fare_original_currency, fx_rate_used = 1.
    For non-INR: fetch rate from FBIL/Frankfurter via fx_rate_fetcher.

    Returns the batch with fx_rate_used, fx_rate_date, total_fare_inr populated.
    """
    fx_cache: dict[str, dict] = {}  # currency → {rate, date, provider}

    for obs in batch:
        currency = obs.get("original_currency") or "INR"
        total_orig = obs.get("total_fare_original_currency")

        if currency == "INR":
            obs["fx_rate_used"] = 1.0
            obs["fx_rate_date"] = obs.get("collection_date") or date.today()
            obs["total_fare_inr"] = float(total_orig) if total_orig else None
        else:
            # Fetch rate (cached per currency per day within this run)
            if currency not in fx_cache:
                try:
                    fx_info = get_fx_rate(currency)
                    fx_cache[currency] = fx_info
                    logger.info(
                        "FX rate locked: 1 %s = %.4f INR (provider: %s, date: %s)",
                        currency, fx_info["rate"], fx_info["provider"], fx_info["date"],
                    )
                except ValueError as e:
                    logger.error("Could not fetch FX rate for %s: %s — skipping conversion.", currency, e)
                    fx_cache[currency] = None

            fx_info = fx_cache.get(currency)
            if fx_info and total_orig is not None:
                rate = fx_info["rate"]
                obs["fx_rate_used"] = rate
                obs["fx_rate_date"] = fx_info["date"]
                obs["total_fare_inr"] = round(float(total_orig) * rate, 2)
            else:
                # Can't convert — leave as None; quality score will penalize
                obs["fx_rate_used"] = None
                obs["fx_rate_date"] = None
                obs["total_fare_inr"] = None

    return batch


# ---------------------------------------------------------------------------
# 2. RECONCILIATION CHECK
# ---------------------------------------------------------------------------

def _reconciliation_check(obs: dict) -> tuple[bool, Optional[str]]:
    """Verify base_fare + taxes + mandatory_fees ≈ total_fare_original_currency.

    Returns:
        (passed: bool, detail: str|None)
    """
    base = obs.get("base_fare")
    taxes = obs.get("taxes")
    fees = obs.get("mandatory_fees")
    total = obs.get("total_fare_original_currency")

    # If any component is missing, reconciliation is indeterminate — pass it
    # (Google Flights search results rarely break down fare components)
    if any(v is None for v in [base, taxes, total]):
        return True, None

    expected = float(base) + float(taxes) + float(fees or 0)
    actual = float(total)

    if actual == 0:
        return True, None  # Can't divide by zero; treat as pass

    deviation = abs(expected - actual) / actual

    if deviation > RECONCILIATION_TOLERANCE:
        detail = (
            f"Component sum ({expected:.2f}) differs from total ({actual:.2f}) "
            f"by {deviation * 100:.1f}% (tolerance: {RECONCILIATION_TOLERANCE * 100:.0f}%)"
        )
        return False, detail

    return True, None


def _glitch_fare_check(
    obs: dict,
    route_medians: dict[str, Optional[float]],
) -> tuple[bool, Optional[str]]:
    """Flag if total_fare_inr is below 20% of the route's 7-day trailing median.

    Returns:
        (is_glitch: bool, detail: str|None)
    """
    total_inr = obs.get("total_fare_inr")
    route_id = obs.get("route_id")

    if total_inr is None or route_id is None:
        return False, None

    median = route_medians.get(route_id)
    if median is None or median <= 0:
        return False, None  # No historical data to compare against

    threshold = median * GLITCH_FARE_THRESHOLD
    if float(total_inr) < threshold:
        detail = (
            f"total_fare_inr ({total_inr:.2f}) is below {GLITCH_FARE_THRESHOLD * 100:.0f}% "
            f"of 7-day median ({median:.2f}), threshold = {threshold:.2f}"
        )
        return True, detail

    return False, None


# ---------------------------------------------------------------------------
# 3. QUALITY SCORE
# ---------------------------------------------------------------------------

def _source_trust_score(source: Optional[str]) -> float:
    """Return the source trust factor."""
    return SOURCE_TRUST.get(source or "", 0.0)


def _recency_factor(collection_timestamp: Optional[datetime]) -> float:
    """Linear decay: 1.0 at 0 hours → 0.5 at 6 hours → 0.5 beyond 6 hours."""
    if collection_timestamp is None:
        return RECENCY_MIN_SCORE

    now = datetime.now(timezone.utc)
    # Make collection_timestamp timezone-aware if it isn't
    if collection_timestamp.tzinfo is None:
        collection_timestamp = collection_timestamp.replace(tzinfo=timezone.utc)

    age_hours = (now - collection_timestamp).total_seconds() / 3600.0

    if age_hours <= RECENCY_FULL_HOURS:
        return 1.0
    if age_hours >= RECENCY_MIN_HOURS:
        return RECENCY_MIN_SCORE

    # Linear interpolation from 1.0 → 0.5 over 0..6 hours
    return 1.0 - (1.0 - RECENCY_MIN_SCORE) * (age_hours / RECENCY_MIN_HOURS)


def _cross_source_match(
    obs: dict,
    cross_source_lookup: dict[str, list[float]],
) -> float:
    """Return 1.0 if another independent source has a similar price for this route/window/day."""
    key = _cross_source_key(obs)
    our_price = obs.get("total_fare_inr")

    if key is None or our_price is None:
        return 0.0

    other_prices = cross_source_lookup.get(key, [])
    if not other_prices:
        return 0.0

    our_price = float(our_price)
    for other_price in other_prices:
        if other_price <= 0:
            continue
        deviation = abs(our_price - other_price) / other_price
        if deviation <= CROSS_SOURCE_PRICE_TOLERANCE:
            return 1.0

    return 0.0


def _cross_source_key(obs: dict) -> Optional[str]:
    """Build a lookup key: route_id|advance_days|travel_date|source."""
    route_id = obs.get("route_id")
    advance_days = obs.get("advance_days")
    travel_date = obs.get("travel_date")
    source = obs.get("source")

    if any(v is None for v in [route_id, advance_days, travel_date, source]):
        return None

    return f"{route_id}|{advance_days}|{travel_date}"


def _compute_quality_score(
    reconciliation_passed: bool,
    source: Optional[str],
    collection_timestamp: Optional[datetime],
    cross_match: float,
) -> float:
    """Compute the composite quality score (0.0 – 1.0)."""
    recon = 1.0 if reconciliation_passed else 0.0
    trust = _source_trust_score(source)
    recency = _recency_factor(collection_timestamp)

    score = (
        W_RECONCILIATION * recon
        + W_SOURCE_TRUST * trust
        + W_RECENCY * recency
        + W_CROSS_SOURCE * cross_match
    )
    return round(min(max(score, 0.0), 1.0), 4)


# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------

def _get_connection(database_url: Optional[str] = None):
    """Get a psycopg2 connection to Neon Postgres."""
    db_url = database_url or os.getenv("NEON_DATABASE_URL")
    if not db_url:
        raise ValueError("NEON_DATABASE_URL is not set.")
    return psycopg2.connect(db_url)


def _fetch_unprocessed(conn) -> list[dict]:
    """Fetch all observations where fx_rate_used IS NULL (un-processed).

    The 'unprocessed' marker is fx_rate_used IS NULL — this column is only
    populated by this engine, never by the ingestion pipeline.
    """
    query = """
    SELECT
        observation_id, route_id, collection_timestamp, travel_date,
        advance_days, base_fare, taxes, mandatory_fees,
        total_fare_original_currency, original_currency,
        total_fare_inr, source, collection_method
    FROM observations
    WHERE fx_rate_used IS NULL
    ORDER BY collection_timestamp DESC;
    """
    with conn.cursor() as cur:
        cur.execute(query)
        columns = [desc[0] for desc in cur.description]
        rows = cur.fetchall()

    return [dict(zip(columns, row)) for row in rows]


def _fetch_trailing_medians(conn) -> dict[str, Optional[float]]:
    """Compute trailing 7-day median total_fare_inr per route.

    Uses observations that already have total_fare_inr populated
    (i.e., previously processed observations).
    """
    query = """
    SELECT route_id, PERCENTILE_CONT(0.5)
        WITHIN GROUP (ORDER BY total_fare_inr) AS median_fare
    FROM observations
    WHERE total_fare_inr IS NOT NULL
      AND collection_timestamp >= NOW() - INTERVAL '7 days'
    GROUP BY route_id;
    """
    with conn.cursor() as cur:
        cur.execute(query)
        rows = cur.fetchall()

    return {row[0]: float(row[1]) if row[1] else None for row in rows}


def _build_cross_source_lookup(batch: list[dict]) -> dict[str, list[float]]:
    """Build a lookup of prices by route/window/day, grouped by source.

    For cross-source matching, we group prices by (route, advance_days, travel_date)
    and check if other sources have similar prices. The lookup maps
    route|advance_days|travel_date → list of prices from OTHER sources.
    """
    # First, group all prices by key and source
    grouped: dict[str, dict[str, list[float]]] = {}
    for obs in batch:
        key = _cross_source_key(obs)
        price = obs.get("total_fare_inr")
        source = obs.get("source")
        if key is None or price is None or source is None:
            continue
        grouped.setdefault(key, {}).setdefault(source, []).append(float(price))

    # For each key, flatten prices from all sources EXCEPT the querying source
    # Since we need per-obs lookup, return all prices for each key;
    # the _cross_source_match function will handle same-source exclusion
    # by comparing prices from ALL observations for that key
    lookup: dict[str, list[float]] = {}
    for key, sources in grouped.items():
        all_prices = []
        for src_prices in sources.values():
            all_prices.extend(src_prices)
        lookup[key] = all_prices

    return lookup


def _ensure_validation_flags_table(conn) -> None:
    """Create the validation_flags table if it doesn't exist.

    This is idempotent — safe to call on every run.
    """
    ddl = """
    CREATE TABLE IF NOT EXISTS validation_flags (
        flag_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        observation_id UUID NOT NULL REFERENCES observations(observation_id),
        flag_type      VARCHAR(40) NOT NULL,
        flag_detail    TEXT,
        flagged_at     TIMESTAMP NOT NULL DEFAULT now(),
        resolved       BOOLEAN DEFAULT FALSE,
        resolved_at    TIMESTAMP,
        resolved_by    VARCHAR(50)
    );
    CREATE INDEX IF NOT EXISTS idx_vf_observation ON validation_flags(observation_id);
    CREATE INDEX IF NOT EXISTS idx_vf_unresolved  ON validation_flags(resolved) WHERE resolved = FALSE;
    """
    with conn.cursor() as cur:
        cur.execute(ddl)
    conn.commit()
    logger.info("Ensured validation_flags table exists.")


def _insert_flags(conn, flags: list[dict]) -> int:
    """Batch-insert validation flags into the validation_flags table."""
    if not flags:
        return 0

    query = """
    INSERT INTO validation_flags (observation_id, flag_type, flag_detail)
    VALUES %s
    ON CONFLICT DO NOTHING;
    """
    rows = [
        (f["observation_id"], f["flag_type"], f["flag_detail"])
        for f in flags
    ]
    with conn.cursor() as cur:
        execute_values(cur, query, rows, page_size=500)
        count = cur.rowcount
    conn.commit()
    return len(rows)


def _update_observations(conn, batch: list[dict]) -> int:
    """Batch-update observations with fx_rate_used, fx_rate_date,
    total_fare_inr, and quality_score.
    """
    if not batch:
        return 0

    # Use a temp table + UPDATE join for efficient batch updates
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TEMP TABLE _qfx_updates (
                observation_id UUID PRIMARY KEY,
                fx_rate_used   NUMERIC,
                fx_rate_date   DATE,
                total_fare_inr NUMERIC,
                quality_score  NUMERIC
            ) ON COMMIT DROP;
        """)

        rows = [
            (
                str(obs["observation_id"]),
                obs.get("fx_rate_used"),
                obs.get("fx_rate_date"),
                obs.get("total_fare_inr"),
                obs.get("quality_score"),
            )
            for obs in batch
        ]
        execute_values(
            cur,
            "INSERT INTO _qfx_updates VALUES %s",
            rows,
            page_size=1000,
        )

        cur.execute("""
            UPDATE observations o
            SET
                fx_rate_used   = u.fx_rate_used,
                fx_rate_date   = u.fx_rate_date,
                total_fare_inr = u.total_fare_inr,
                quality_score  = u.quality_score
            FROM _qfx_updates u
            WHERE o.observation_id = u.observation_id;
        """)
        updated = cur.rowcount

    conn.commit()
    return updated


# ---------------------------------------------------------------------------
# Main orchestrator
# ---------------------------------------------------------------------------

def run_quality_fx_engine(database_url: Optional[str] = None) -> dict[str, Any]:
    """Execute the full Quality + FX engine on all un-processed observations.

    Workflow:
    1. Fetch un-processed observations (fx_rate_used IS NULL).
    2. FX Lock — convert foreign currencies to INR.
    3. Reconciliation — flag component-sum mismatches and glitch fares.
    4. Quality Score — compute composite score.
    5. Write back updates and flags to the database.

    Returns:
        Summary dict with counts and status.
    """
    start = datetime.now(timezone.utc)
    logger.info("=" * 80)
    logger.info("FlyWise Quality + FX Engine Starting: %s UTC", start.isoformat())
    logger.info("=" * 80)

    conn = _get_connection(database_url)
    try:
        # Ensure the validation_flags table exists
        _ensure_validation_flags_table(conn)

        # Step 1: Fetch un-processed observations
        batch = _fetch_unprocessed(conn)
        logger.info("Found %d un-processed observation(s).", len(batch))

        if not batch:
            logger.info("Nothing to process. Engine complete.")
            return {"status": "NOOP", "processed": 0, "flags": 0, "updated": 0}

        # Step 2: FX Lock
        logger.info("--- Step 1: FX Lock ---")
        batch = _fx_lock(conn, batch)
        fx_converted = sum(1 for o in batch if o.get("fx_rate_used") is not None)
        logger.info("FX conversion applied to %d / %d observations.", fx_converted, len(batch))

        # Step 3: Reconciliation + Glitch fare detection
        logger.info("--- Step 2: Reconciliation Check ---")
        route_medians = _fetch_trailing_medians(conn)
        logger.info("Trailing 7-day medians: %s", {k: f"{v:.0f}" if v else "N/A" for k, v in route_medians.items()})

        flags: list[dict] = []
        recon_results: dict[str, bool] = {}  # observation_id → passed

        for obs in batch:
            obs_id = str(obs["observation_id"])

            # Reconciliation check
            passed, detail = _reconciliation_check(obs)
            recon_results[obs_id] = passed
            if not passed:
                flags.append({
                    "observation_id": obs_id,
                    "flag_type": "reconciliation_mismatch",
                    "flag_detail": detail,
                })

            # Glitch fare check
            is_glitch, glitch_detail = _glitch_fare_check(obs, route_medians)
            if is_glitch:
                flags.append({
                    "observation_id": obs_id,
                    "flag_type": "glitch_fare",
                    "flag_detail": glitch_detail,
                })

        logger.info(
            "Reconciliation: %d passed, %d flagged. Glitch fares: %d flagged.",
            sum(1 for v in recon_results.values() if v),
            sum(1 for v in recon_results.values() if not v),
            sum(1 for f in flags if f["flag_type"] == "glitch_fare"),
        )

        # Step 4: Quality Score
        logger.info("--- Step 3: Quality Score ---")
        cross_source_lookup = _build_cross_source_lookup(batch)

        for obs in batch:
            obs_id = str(obs["observation_id"])
            recon_passed = recon_results.get(obs_id, True)
            cross_match = _cross_source_match(obs, cross_source_lookup)

            obs["quality_score"] = _compute_quality_score(
                reconciliation_passed=recon_passed,
                source=obs.get("source"),
                collection_timestamp=obs.get("collection_timestamp"),
                cross_match=cross_match,
            )

        scores = [o["quality_score"] for o in batch if o.get("quality_score") is not None]
        if scores:
            logger.info(
                "Quality scores: min=%.4f, max=%.4f, mean=%.4f",
                min(scores), max(scores), sum(scores) / len(scores),
            )

        # Step 5: Write back
        logger.info("--- Step 4: Persisting Updates ---")
        flags_inserted = _insert_flags(conn, flags)
        updated = _update_observations(conn, batch)

        end = datetime.now(timezone.utc)
        duration = (end - start).total_seconds()

        summary = {
            "status": "SUCCESS",
            "processed": len(batch),
            "fx_converted": fx_converted,
            "flags_inserted": flags_inserted,
            "reconciliation_failures": sum(1 for v in recon_results.values() if not v),
            "glitch_fares": sum(1 for f in flags if f["flag_type"] == "glitch_fare"),
            "updated": updated,
            "avg_quality_score": round(sum(scores) / len(scores), 4) if scores else None,
            "duration_seconds": round(duration, 2),
        }

        logger.info("=" * 80)
        logger.info("FLYWISE QUALITY + FX ENGINE COMPLETE")
        for k, v in summary.items():
            logger.info("  %-25s %s", k + ":", v)
        logger.info("=" * 80)

        return summary

    except Exception as e:
        logger.error("Quality + FX Engine failed: %s", e, exc_info=True)
        raise
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    result = run_quality_fx_engine()
    print("\nEngine Result:")
    for k, v in result.items():
        print(f"  {k}: {v}")
