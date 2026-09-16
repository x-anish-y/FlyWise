"""
processing/imputation.py
FlyWise (APIx) — Gap-filling imputation engine.

Runs AFTER quality_fx_engine.py, BEFORE index_engine.py.

For each route + window combination that routes_config.json says should have
been collected in the current cycle but is missing from the observations table,
imputes a value using this strict priority cascade (first success wins):

  1. neighbor_window    — average price-relative movement from other windows
                          of the same route on the same day.
  2. time_carry_forward — most recent real observation for this exact
                          route + window.
  3. cross_route        — average price-relative movement of peer routes in
                          the same domestic/international bucket that day.
  4. full_carry_forward — last known absolute total_fare_inr for this exact
                          route + window, unchanged.

Imputed rows are inserted with is_imputed=TRUE and imputation_method set to
the method name.  No data is ever fabricated from scratch — every imputation
is grounded in at least one real observation.

Also computes per-route per-day **coverage_score**: fraction of expected
observations that are NOT imputed.  A coverage_score < 0.80 signals
degraded confidence on the dashboard.
"""

from __future__ import annotations

import json
import logging
import os
import sys
import uuid
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

logger = logging.getLogger("imputation")
if not logger.handlers:
    sh = logging.StreamHandler(sys.stdout)
    sh.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s"))
    logger.addHandler(sh)
    logger.setLevel(logging.INFO)

# Reuse season logic from render_cron_entrypoint
MONTH_MAP: dict[str, int] = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}


# ---------------------------------------------------------------------------
# Config helpers
# ---------------------------------------------------------------------------

def _load_routes_config() -> dict:
    """Load routes_config.json from known candidate paths."""
    candidates = [
        PROJECT_ROOT / "config" / "routes_config.json",
        PROJECT_ROOT / "collectors" / "routes_config.json",
    ]
    for p in candidates:
        if p.is_file():
            with open(p, "r", encoding="utf-8") as f:
                return json.load(f)
    raise FileNotFoundError(f"routes_config.json not found in {[str(p) for p in candidates]}")


def _is_in_season(season_window: Optional[str], check_date: date) -> bool:
    """Evaluate whether check_date falls inside a season_window (e.g. 'Oct-Mar')."""
    if not season_window:
        return True
    parts = season_window.strip().split("-")
    if len(parts) != 2:
        return True
    start_m = MONTH_MAP.get(parts[0].strip()[:3].lower())
    end_m = MONTH_MAP.get(parts[1].strip()[:3].lower())
    if not start_m or not end_m:
        return True
    m = check_date.month
    if start_m <= end_m:
        return start_m <= m <= end_m
    return m >= start_m or m <= end_m


def _build_expected_slots(config: dict, today: date) -> list[dict]:
    """Compute all (route_id, advance_days, travel_date, bucket) slots
    that should have observations today.

    Returns list of dicts with keys:
        route_id, advance_days, travel_date, bucket ('domestic'|'international')
    """
    slots: list[dict] = []

    for route in config.get("domestic", []):
        for w in route.get("windows", []):
            slots.append({
                "route_id": route["route_id"],
                "advance_days": w,
                "travel_date": today + timedelta(days=w),
                "bucket": "domestic",
            })

    for route in config.get("international", []):
        for w in route.get("windows", []):
            slots.append({
                "route_id": route["route_id"],
                "advance_days": w,
                "travel_date": today + timedelta(days=w),
                "bucket": "international",
            })

    for route in config.get("seasonal", []):
        if _is_in_season(route.get("season_window"), today):
            for w in route.get("windows", []):
                slots.append({
                    "route_id": route["route_id"],
                    "advance_days": w,
                    "travel_date": today + timedelta(days=w),
                    "bucket": "domestic",  # Seasonal routes are domestic
                })

    return slots


# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------

def _get_connection(database_url: Optional[str] = None):
    db_url = database_url or os.getenv("NEON_DATABASE_URL")
    if not db_url:
        raise ValueError("NEON_DATABASE_URL is not set.")
    return psycopg2.connect(db_url)


def _fetch_todays_observations(conn, today: date) -> set[tuple[str, int]]:
    """Return set of (route_id, advance_days) pairs collected today (non-imputed)."""
    query = """
    SELECT DISTINCT route_id, advance_days
    FROM observations
    WHERE collection_timestamp::date = %s
      AND is_imputed = FALSE
      AND total_fare_inr IS NOT NULL;
    """
    with conn.cursor() as cur:
        cur.execute(query, (today,))
        return {(row[0], row[1]) for row in cur.fetchall()}


def _fetch_route_window_history(
    conn,
    route_id: str,
    advance_days: int,
    lookback_days: int = 7,
) -> Optional[dict]:
    """Fetch the most recent non-imputed observation for a route+window.

    Returns the observation dict or None.
    """
    query = """
    SELECT observation_id, route_id, advance_days, travel_date,
           total_fare_inr, total_fare_original_currency, original_currency,
           fx_rate_used, fx_rate_date, airline, flight_number,
           operating_carrier, cabin, source, collection_timestamp
    FROM observations
    WHERE route_id = %s
      AND advance_days = %s
      AND is_imputed = FALSE
      AND total_fare_inr IS NOT NULL
    ORDER BY collection_timestamp DESC
    LIMIT 1;
    """
    with conn.cursor() as cur:
        cur.execute(query, (route_id, advance_days))
        row = cur.fetchone()
        if not row:
            return None
        cols = [d[0] for d in cur.description]
        return dict(zip(cols, row))


def _fetch_route_today_prices(
    conn,
    route_id: str,
    today: date,
) -> dict[int, float]:
    """Fetch median total_fare_inr per window for a route collected today.

    Returns: {advance_days: median_fare_inr}
    """
    query = """
    SELECT advance_days,
           PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY total_fare_inr) AS median_fare
    FROM observations
    WHERE route_id = %s
      AND collection_timestamp::date = %s
      AND is_imputed = FALSE
      AND total_fare_inr IS NOT NULL
    GROUP BY advance_days;
    """
    with conn.cursor() as cur:
        cur.execute(query, (route_id, today))
        return {row[0]: float(row[1]) for row in cur.fetchall()}


def _fetch_route_yesterday_prices(
    conn,
    route_id: str,
    today: date,
) -> dict[int, float]:
    """Fetch median total_fare_inr per window for a route from yesterday."""
    yesterday = today - timedelta(days=1)
    query = """
    SELECT advance_days,
           PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY total_fare_inr) AS median_fare
    FROM observations
    WHERE route_id = %s
      AND collection_timestamp::date = %s
      AND is_imputed = FALSE
      AND total_fare_inr IS NOT NULL
    GROUP BY advance_days;
    """
    with conn.cursor() as cur:
        cur.execute(query, (route_id, yesterday))
        return {row[0]: float(row[1]) for row in cur.fetchall()}


def _fetch_bucket_today_movements(
    conn,
    bucket: str,
    today: date,
    exclude_route: str,
) -> Optional[float]:
    """Compute the average price-relative movement of peer routes in the
    same bucket (domestic/international) from yesterday→today.

    price_relative = today_median / yesterday_median for each route+window
    that has both.  Returns the average across all such pairs, or None.
    """
    yesterday = today - timedelta(days=1)
    query = """
    WITH today_prices AS (
        SELECT route_id, advance_days,
               PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY total_fare_inr) AS med
        FROM observations o
        JOIN routes r USING (route_id)
        WHERE collection_timestamp::date = %s
          AND is_imputed = FALSE
          AND total_fare_inr IS NOT NULL
          AND r.domestic_international = %s
          AND route_id != %s
        GROUP BY route_id, advance_days
    ),
    yest_prices AS (
        SELECT route_id, advance_days,
               PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY total_fare_inr) AS med
        FROM observations o
        JOIN routes r USING (route_id)
        WHERE collection_timestamp::date = %s
          AND is_imputed = FALSE
          AND total_fare_inr IS NOT NULL
          AND r.domestic_international = %s
          AND route_id != %s
        GROUP BY route_id, advance_days
    )
    SELECT AVG(t.med / y.med) AS avg_movement
    FROM today_prices t
    JOIN yest_prices y
      ON t.route_id = y.route_id AND t.advance_days = y.advance_days
    WHERE y.med > 0;
    """
    with conn.cursor() as cur:
        cur.execute(query, (today, bucket, exclude_route,
                            yesterday, bucket, exclude_route))
        row = cur.fetchone()
        if row and row[0]:
            return float(row[0])
    return None


def _fetch_last_known_fare(conn, route_id: str, advance_days: int) -> Optional[float]:
    """Get the last known absolute total_fare_inr for route+window (any date)."""
    query = """
    SELECT total_fare_inr
    FROM observations
    WHERE route_id = %s AND advance_days = %s
      AND total_fare_inr IS NOT NULL
    ORDER BY collection_timestamp DESC
    LIMIT 1;
    """
    with conn.cursor() as cur:
        cur.execute(query, (route_id, advance_days))
        row = cur.fetchone()
        return float(row[0]) if row else None


# ---------------------------------------------------------------------------
# Imputation cascade
# ---------------------------------------------------------------------------

def _try_neighbor_window(
    conn,
    route_id: str,
    advance_days: int,
    today: date,
) -> Optional[tuple[float, str]]:
    """Method 1: neighbor_window.

    Use the average price-relative movement across this route's OTHER windows
    (today vs. yesterday) to estimate the missing window's value.

    Returns (imputed_fare_inr, detail) or None.
    """
    today_prices = _fetch_route_today_prices(conn, route_id, today)
    yesterday_prices = _fetch_route_yesterday_prices(conn, route_id, today)

    # Need the base value for the missing window from yesterday
    base_value = yesterday_prices.get(advance_days)
    if base_value is None or base_value <= 0:
        return None

    # Compute price relatives for other windows that have both today and yesterday
    relatives: list[float] = []
    for w, today_med in today_prices.items():
        if w == advance_days:
            continue  # Skip the window we're trying to impute
        yest_med = yesterday_prices.get(w)
        if yest_med and yest_med > 0:
            relatives.append(today_med / yest_med)

    if not relatives:
        return None

    avg_movement = sum(relatives) / len(relatives)
    imputed_fare = round(base_value * avg_movement, 2)

    detail = (
        f"neighbor_window: base={base_value:.2f} (T+{advance_days} yesterday), "
        f"avg_movement={avg_movement:.4f} from {len(relatives)} peer window(s), "
        f"imputed={imputed_fare:.2f}"
    )
    logger.info("  [neighbor_window] %s T+%d: %s", route_id, advance_days, detail)
    return imputed_fare, detail


def _try_time_carry_forward(
    conn,
    route_id: str,
    advance_days: int,
) -> Optional[tuple[float, str]]:
    """Method 2: time_carry_forward.

    Reuse the most recent successful observation's fare for this route+window.

    Returns (imputed_fare_inr, detail) or None.
    """
    hist = _fetch_route_window_history(conn, route_id, advance_days)
    if not hist or hist.get("total_fare_inr") is None:
        return None

    fare = float(hist["total_fare_inr"])
    ts = hist.get("collection_timestamp")
    detail = (
        f"time_carry_forward: reused {route_id} T+{advance_days} "
        f"fare={fare:.2f} from {ts}"
    )
    logger.info("  [time_carry_forward] %s T+%d: %s", route_id, advance_days, detail)
    return fare, detail


def _try_cross_route(
    conn,
    route_id: str,
    advance_days: int,
    bucket: str,
    today: date,
) -> Optional[tuple[float, str]]:
    """Method 3: cross_route.

    Use average price-relative movement of peer routes in the same
    domestic/international bucket, applied to this route+window's
    yesterday value.

    Returns (imputed_fare_inr, detail) or None.
    """
    yesterday_prices = _fetch_route_yesterday_prices(conn, route_id, today)
    base_value = yesterday_prices.get(advance_days)
    if base_value is None or base_value <= 0:
        return None

    avg_movement = _fetch_bucket_today_movements(conn, bucket, today, route_id)
    if avg_movement is None:
        return None

    imputed_fare = round(base_value * avg_movement, 2)

    detail = (
        f"cross_route: base={base_value:.2f} (yesterday), "
        f"bucket_avg_movement={avg_movement:.4f} ({bucket}), "
        f"imputed={imputed_fare:.2f}"
    )
    logger.info("  [cross_route] %s T+%d: %s", route_id, advance_days, detail)
    return imputed_fare, detail


def _try_full_carry_forward(
    conn,
    route_id: str,
    advance_days: int,
) -> Optional[tuple[float, str]]:
    """Method 4: full_carry_forward.

    Last resort — reuse the last known absolute total_fare_inr, unchanged.

    Returns (imputed_fare_inr, detail) or None.
    """
    fare = _fetch_last_known_fare(conn, route_id, advance_days)
    if fare is None:
        return None

    detail = f"full_carry_forward: reused last known fare={fare:.2f}"
    logger.info("  [full_carry_forward] %s T+%d: %s", route_id, advance_days, detail)
    return fare, detail


def _impute_slot(
    conn,
    slot: dict,
    today: date,
) -> Optional[dict]:
    """Run the 4-step imputation cascade for a missing slot.

    Returns an observation dict ready for DB insertion, or None if all
    methods fail (no historical data at all for this route+window).
    """
    route_id = slot["route_id"]
    advance_days = slot["advance_days"]
    travel_date = slot["travel_date"]
    bucket = slot["bucket"]

    logger.info("Imputing %s T+%d (travel: %s)...", route_id, advance_days, travel_date)

    # Try each method in priority order
    result = _try_neighbor_window(conn, route_id, advance_days, today)
    method = "neighbor_window"

    if result is None:
        result = _try_time_carry_forward(conn, route_id, advance_days)
        method = "time_carry_forward"

    if result is None:
        result = _try_cross_route(conn, route_id, advance_days, bucket, today)
        method = "cross_route"

    if result is None:
        result = _try_full_carry_forward(conn, route_id, advance_days)
        method = "full_carry_forward"

    if result is None:
        logger.warning(
            "  ALL METHODS FAILED for %s T+%d — no historical data exists. Skipping.",
            route_id, advance_days,
        )
        return None

    imputed_fare, detail = result
    now_utc = datetime.now(timezone.utc)

    return {
        "observation_id": str(uuid.uuid4()),
        "route_id": route_id,
        "service_type": "one-way",
        "collection_timestamp": now_utc,
        "travel_date": travel_date,
        "advance_days": advance_days,
        "window_category": f"T+{advance_days}",
        "airline": None,
        "flight_number": None,
        "operating_carrier": None,
        "cabin": "economy",
        "fare_family_raw": None,
        "fare_family_tier": "imputed",
        "baggage_bucket": "imputed",
        "service_spec_id": None,
        "base_fare": None,
        "taxes": None,
        "mandatory_fees": None,
        "total_fare_original_currency": imputed_fare,
        "original_currency": "INR",
        "fx_rate_used": 1.0,
        "fx_rate_date": today,
        "total_fare_inr": imputed_fare,
        "availability_status": "source_error",
        "is_imputed": True,
        "imputation_method": method,
        "quality_score": 0.0,  # Imputed rows get quality_score = 0
        "source": "imputation",
        "collection_method": method,
        "run_id": f"impute_{route_id}_{now_utc.strftime('%Y%m%d_%H%M%S')}",
        "raw_reference": detail,
        "methodology_version": "v1.0",
    }


# ---------------------------------------------------------------------------
# Coverage score
# ---------------------------------------------------------------------------

def _compute_coverage_scores(
    expected_slots: list[dict],
    existing_keys: set[tuple[str, int]],
    imputed_keys: set[tuple[str, int]],
    today: date,
) -> dict[str, float]:
    """Compute coverage_score per route: fraction of expected observations
    that are NOT imputed.

    Returns: {route_id: coverage_score}
    """
    # Group expected slots by route
    route_expected: dict[str, int] = {}
    route_imputed: dict[str, int] = {}

    for slot in expected_slots:
        rid = slot["route_id"]
        adv = slot["advance_days"]
        key = (rid, adv)

        route_expected[rid] = route_expected.get(rid, 0) + 1

        if key not in existing_keys and key in imputed_keys:
            route_imputed[rid] = route_imputed.get(rid, 0) + 1

    scores: dict[str, float] = {}
    for rid, expected in route_expected.items():
        imputed_count = route_imputed.get(rid, 0)
        real_count = expected - imputed_count
        scores[rid] = round(real_count / expected, 4) if expected > 0 else 1.0

    return scores


# ---------------------------------------------------------------------------
# DB insertion
# ---------------------------------------------------------------------------

def _insert_imputed_observations(conn, observations: list[dict]) -> int:
    """Batch-insert imputed observation rows."""
    if not observations:
        return 0

    insert_query = """
    INSERT INTO observations (
        observation_id, route_id, service_type, collection_timestamp, travel_date,
        advance_days, window_category, airline, flight_number, operating_carrier,
        cabin, fare_family_raw, fare_family_tier, baggage_bucket, service_spec_id,
        base_fare, taxes, mandatory_fees, total_fare_original_currency, original_currency,
        fx_rate_used, fx_rate_date, total_fare_inr, availability_status, is_imputed,
        imputation_method, quality_score, source, collection_method, run_id,
        raw_reference, methodology_version
    ) VALUES %s
    ON CONFLICT (observation_id) DO NOTHING;
    """

    rows = []
    for obs in observations:
        coll_ts = obs.get("collection_timestamp")
        if isinstance(coll_ts, datetime) and coll_ts.tzinfo:
            coll_ts = coll_ts.replace(tzinfo=None)

        travel_dt = obs.get("travel_date")
        if isinstance(travel_dt, datetime):
            travel_dt = travel_dt.date()

        rows.append((
            obs.get("observation_id"),
            obs.get("route_id"),
            obs.get("service_type", "one-way"),
            coll_ts,
            travel_dt,
            obs.get("advance_days"),
            obs.get("window_category"),
            obs.get("airline"),
            obs.get("flight_number"),
            obs.get("operating_carrier"),
            obs.get("cabin", "economy"),
            obs.get("fare_family_raw"),
            obs.get("fare_family_tier"),
            obs.get("baggage_bucket"),
            obs.get("service_spec_id"),
            obs.get("base_fare"),
            obs.get("taxes"),
            obs.get("mandatory_fees"),
            obs.get("total_fare_original_currency"),
            obs.get("original_currency", "INR"),
            obs.get("fx_rate_used"),
            obs.get("fx_rate_date"),
            obs.get("total_fare_inr"),
            obs.get("availability_status", "source_error"),
            obs.get("is_imputed", True),
            obs.get("imputation_method"),
            obs.get("quality_score", 0.0),
            obs.get("source", "imputation"),
            obs.get("collection_method"),
            obs.get("run_id"),
            obs.get("raw_reference"),
            obs.get("methodology_version", "v1.0"),
        ))

    with conn.cursor() as cur:
        execute_values(cur, insert_query, rows, page_size=500)
    conn.commit()
    return len(rows)


# ---------------------------------------------------------------------------
# Main orchestrator
# ---------------------------------------------------------------------------

def run_imputation(
    database_url: Optional[str] = None,
    target_date: Optional[date] = None,
) -> dict[str, Any]:
    """Execute the imputation engine for today's (or target_date's) collection cycle.

    Workflow:
    1. Load routes_config.json → compute expected slots for today.
    2. Query DB for which slots were actually collected today (non-imputed).
    3. For each missing slot, run the 4-method imputation cascade.
    4. Insert imputed rows.
    5. Compute and return per-route coverage_scores.

    Returns:
        Summary dict with counts, methods used, and coverage scores.
    """
    start = datetime.now(timezone.utc)
    today = target_date or start.date()

    logger.info("=" * 80)
    logger.info("FlyWise Imputation Engine Starting: %s (date: %s)", start.isoformat(), today)
    logger.info("=" * 80)

    # Step 1: Load config and build expected slots
    config = _load_routes_config()
    expected_slots = _build_expected_slots(config, today)
    logger.info("Expected slots for %s: %d", today, len(expected_slots))

    # Step 2: Check what we already have
    conn = _get_connection(database_url)
    try:
        existing_keys = _fetch_todays_observations(conn, today)
        logger.info("Existing (non-imputed) observations today: %d", len(existing_keys))

        # Step 3: Identify gaps and impute
        missing_slots = [
            s for s in expected_slots
            if (s["route_id"], s["advance_days"]) not in existing_keys
        ]
        logger.info("Missing slots to impute: %d", len(missing_slots))

        imputed_observations: list[dict] = []
        method_counts: dict[str, int] = {}
        failed_count = 0

        for slot in missing_slots:
            obs = _impute_slot(conn, slot, today)
            if obs:
                imputed_observations.append(obs)
                m = obs["imputation_method"]
                method_counts[m] = method_counts.get(m, 0) + 1
            else:
                failed_count += 1

        # Step 4: Insert imputed rows
        logger.info("--- Inserting %d imputed observation(s) ---", len(imputed_observations))
        inserted = _insert_imputed_observations(conn, imputed_observations)

        # Step 5: Coverage scores
        imputed_keys = {
            (o["route_id"], o["advance_days"]) for o in imputed_observations
        }
        coverage_scores = _compute_coverage_scores(
            expected_slots, existing_keys, imputed_keys, today,
        )

        # Log coverage warnings
        for rid, score in sorted(coverage_scores.items()):
            if score < 0.80:
                logger.warning(
                    "LOW COVERAGE: %s — coverage_score=%.2f (<80%% real data)",
                    rid, score,
                )
            else:
                logger.info("Coverage: %s — %.2f", rid, score)

        end = datetime.now(timezone.utc)
        duration = (end - start).total_seconds()

        summary: dict[str, Any] = {
            "status": "SUCCESS",
            "date": today.isoformat(),
            "expected_slots": len(expected_slots),
            "existing_real": len(existing_keys),
            "missing_gaps": len(missing_slots),
            "imputed": len(imputed_observations),
            "imputation_failed": failed_count,
            "inserted": inserted,
            "method_breakdown": method_counts,
            "coverage_scores": coverage_scores,
            "duration_seconds": round(duration, 2),
        }

        logger.info("=" * 80)
        logger.info("FLYWISE IMPUTATION ENGINE COMPLETE")
        logger.info("  Expected slots:     %d", summary["expected_slots"])
        logger.info("  Existing (real):    %d", summary["existing_real"])
        logger.info("  Missing gaps:       %d", summary["missing_gaps"])
        logger.info("  Imputed:            %d", summary["imputed"])
        logger.info("  Failed (no data):   %d", summary["imputation_failed"])
        logger.info("  Inserted to DB:     %d", summary["inserted"])
        logger.info("  Methods used:       %s", method_counts)
        logger.info("  Duration:           %.2fs", duration)
        logger.info("=" * 80)

        return summary

    except Exception as e:
        logger.error("Imputation engine failed: %s", e, exc_info=True)
        raise
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    result = run_imputation()
    print("\nImputation Result:")
    for k, v in result.items():
        print(f"  {k}: {v}")
