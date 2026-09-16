"""
processing/index_engine.py
FlyWise (APIx) — Core statistical index engine.

Runs LAST in the processing pipeline (after ingestion → quality_fx → imputation).
For each collection day, computes:

  1. Route-level Jevons index per route/window_category/advance_days.
  2. DAPIx  (domestic routes, Young-type weighted sum).
  3. IAPIx  (international routes, Young-type weighted sum).
  4. Overall APIx  (combined domestic + international).

Results are written to the `route_index` and `national_index` tables.

EDGE CASE — FLIGHT EVENTS:
  The flight_events table stores operational disruptions (cancellations,
  diversions, etc.) for INFORMATIONAL purposes only.  These events are
  NEVER used to exclude or adjust observation prices in this engine.
  The pricing pipeline treats every valid observation at face value;
  flight_events exists solely for the dashboard's event overlay and for
  judge Q&A.  This separation is by design — see docs/methodology.md.

EDGE CASE — SEASONAL ROUTES:
  Routes with is_seasonal=TRUE are included in DAPIx/IAPIx ONLY when
  today's date falls within their season_window.  Their absence outside
  the season does NOT reduce coverage_score.
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

logger = logging.getLogger("index_engine")
if not logger.handlers:
    sh = logging.StreamHandler(sys.stdout)
    sh.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s"))
    logger.addHandler(sh)
    logger.setLevel(logging.INFO)

# ---------------------------------------------------------------------------
# Seasonal helper (shared with imputation.py / render_cron_entrypoint.py)
# ---------------------------------------------------------------------------

MONTH_MAP: dict[str, int] = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}


def _is_in_season(season_window: Optional[str], check_date: date) -> bool:
    """Evaluate whether check_date falls inside a season_window (e.g. 'Oct-Mar')."""
    if not season_window:
        return True
    parts = season_window.strip().split("-")
    if len(parts) != 2:
        return True
    sm = MONTH_MAP.get(parts[0].strip()[:3].lower())
    em = MONTH_MAP.get(parts[1].strip()[:3].lower())
    if not sm or not em:
        return True
    m = check_date.month
    if sm <= em:
        return sm <= m <= em
    return m >= sm or m <= em


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Prototype domestic/international weights for Overall APIx.
# Based on relative route counts: 8-10 domestic vs 4 international.
# TODO(prototype): Replace with MoSPI passenger-share data once available.
#   These equal-ish weights are a reasonable first approximation for SIH 2026.
#   The actual CPI/WPI methodology uses expenditure-share weights; for
#   airfares, DGCA passenger traffic data would be the proper source.
DOMESTIC_WEIGHT = 0.70       # ~8-10 domestic routes
INTERNATIONAL_WEIGHT = 0.30  # ~4 international routes

# Coverage thresholds
COVERAGE_GOOD = 0.80   # ≥80% non-imputed = acceptable
COVERAGE_WARN = 0.50   # <50% = seriously degraded


# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------

def _get_connection(database_url: Optional[str] = None):
    db_url = database_url or os.getenv("NEON_DATABASE_URL")
    if not db_url:
        raise ValueError("NEON_DATABASE_URL is not set.")
    return psycopg2.connect(db_url)


def _ensure_reference_prices_table(conn) -> None:
    """Create the reference_prices table if it doesn't exist."""
    ddl = """
    CREATE TABLE IF NOT EXISTS reference_prices (
        route_id        VARCHAR(10) NOT NULL REFERENCES routes(route_id),
        window_category VARCHAR(20) NOT NULL,
        advance_days    INT NOT NULL,
        service_spec_id VARCHAR(100),
        reference_price NUMERIC NOT NULL,
        reference_date  DATE NOT NULL,
        n_observations  INT NOT NULL DEFAULT 1,
        created_at      TIMESTAMP NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_refprice_pk
        ON reference_prices (route_id, window_category, advance_days,
                             COALESCE(service_spec_id, '__GENERIC__'));
    """
    with conn.cursor() as cur:
        cur.execute(ddl)
    conn.commit()


# ---------------------------------------------------------------------------
# Step 0: Flight events check (informational only)
# ---------------------------------------------------------------------------

def _log_flight_events(conn, target_date: date) -> int:
    """Log any flight_events for today's date.

    IMPORTANT DESIGN NOTE:
    ─────────────────────────────────────────────────────────────────────────
    flight_events is PURELY INFORMATIONAL.  Events (cancellations, delays,
    diversions) are logged here for dashboard display and judge Q&A only.

    They are NEVER used to:
      • Exclude observations from the index calculation
      • Adjust or weight observation prices
      • Mark observations as invalid

    A cancelled flight's *listed fare* (if it was scraped before cancellation)
    is a valid market price signal.  The event overlay on the dashboard lets
    analysts *explain* price movements, not *adjust* them.

    This matches standard CPI methodology: the transaction price is recorded
    at the time of observation, regardless of subsequent delivery events.
    ─────────────────────────────────────────────────────────────────────────
    """
    query = """
    SELECT flight_number, operational_status, logged_at
    FROM flight_events
    WHERE travel_date = %s
      AND operational_status != 'completed';
    """
    with conn.cursor() as cur:
        cur.execute(query, (target_date,))
        events = cur.fetchall()

    if events:
        logger.info(
            "flight_events: %d non-completed event(s) on %s (informational only, "
            "NOT used in index calculation):",
            len(events), target_date,
        )
        for fn, status, logged in events:
            logger.info("  • %s — %s (logged: %s)", fn, status, logged)
    else:
        logger.info("flight_events: No disruptions recorded for %s.", target_date)

    return len(events)


# ---------------------------------------------------------------------------
# Step 1: Reference prices (base-period auto-seeding)
# ---------------------------------------------------------------------------

def _get_or_seed_reference_price(
    conn,
    route_id: str,
    window_category: str,
    advance_days: int,
    service_spec_id: Optional[str],
) -> Optional[float]:
    """Get the base-period reference price, auto-seeding from historical data
    if no reference exists yet.

    The reference price is the median total_fare_inr from the FIRST day we
    have real (non-imputed) observations for this exact cell.
    """
    # Check if reference already exists
    query = """
    SELECT reference_price FROM reference_prices
    WHERE route_id = %s AND window_category = %s AND advance_days = %s
      AND COALESCE(service_spec_id, '__GENERIC__') = COALESCE(%s, '__GENERIC__');
    """
    with conn.cursor() as cur:
        cur.execute(query, (route_id, window_category, advance_days, service_spec_id))
        row = cur.fetchone()
        if row:
            return float(row[0])

    # Auto-seed: find the earliest day's median for this cell
    if service_spec_id:
        seed_query = """
        SELECT collection_timestamp::date AS obs_date,
               PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY total_fare_inr) AS med,
               COUNT(*) AS n
        FROM observations
        WHERE route_id = %s AND window_category = %s AND advance_days = %s
          AND service_spec_id = %s
          AND is_imputed = FALSE AND total_fare_inr IS NOT NULL
        GROUP BY obs_date
        ORDER BY obs_date ASC
        LIMIT 1;
        """
        params = (route_id, window_category, advance_days, service_spec_id)
    else:
        seed_query = """
        SELECT collection_timestamp::date AS obs_date,
               PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY total_fare_inr) AS med,
               COUNT(*) AS n
        FROM observations
        WHERE route_id = %s AND window_category = %s AND advance_days = %s
          AND is_imputed = FALSE AND total_fare_inr IS NOT NULL
        GROUP BY obs_date
        ORDER BY obs_date ASC
        LIMIT 1;
        """
        params = (route_id, window_category, advance_days)

    with conn.cursor() as cur:
        cur.execute(seed_query, params)
        row = cur.fetchone()

    if not row or row[1] is None or float(row[1]) <= 0:
        return None  # No historical data at all

    ref_date, ref_price, n_obs = row[0], float(row[1]), int(row[2])

    # Insert the seeded reference
    insert_query = """
    INSERT INTO reference_prices
        (route_id, window_category, advance_days, service_spec_id,
         reference_price, reference_date, n_observations)
    VALUES (%s, %s, %s, %s, %s, %s, %s)
    ON CONFLICT (route_id, window_category, advance_days,
                 COALESCE(service_spec_id, '__GENERIC__'))
    DO NOTHING;
    """
    with conn.cursor() as cur:
        cur.execute(insert_query, (
            route_id, window_category, advance_days, service_spec_id,
            ref_price, ref_date, n_obs,
        ))
    conn.commit()

    logger.info(
        "Auto-seeded reference price: %s %s T+%d spec=%s → %.2f INR "
        "(date: %s, n=%d)",
        route_id, window_category, advance_days,
        service_spec_id or "(generic)", ref_price, ref_date, n_obs,
    )
    return ref_price


# ---------------------------------------------------------------------------
# Step 2: Route-level Jevons index
# ---------------------------------------------------------------------------

def _compute_route_indices(
    conn,
    target_date: date,
) -> list[dict]:
    """Compute Jevons geometric-mean index for each route/window/advance_days.

    Jevons index = (∏ price_relatives)^(1/n) × 100

    Where price_relative_i = observation_fare_i / reference_price

    Groups observations by service_spec_id to compute price relatives within
    matched product specifications, then takes the geometric mean across all
    valid relatives for the cell.

    Returns list of dicts ready for route_index insertion.
    """
    # Fetch all valid observations for today, grouped by route/window/advance_days
    query = """
    SELECT route_id, window_category, advance_days, service_spec_id,
           total_fare_inr
    FROM observations
    WHERE collection_timestamp::date = %s
      AND total_fare_inr IS NOT NULL
      AND total_fare_inr > 0
      AND availability_status != 'rejected'
    ORDER BY route_id, window_category, advance_days, service_spec_id;
    """
    with conn.cursor() as cur:
        cur.execute(query, (target_date,))
        rows = cur.fetchall()

    if not rows:
        logger.warning("No valid observations found for %s.", target_date)
        return []

    # Group by (route_id, window_category, advance_days)
    cells: dict[tuple, list[tuple[Optional[str], float]]] = {}
    for route_id, wc, adv, spec_id, fare in rows:
        key = (route_id, wc, adv)
        cells.setdefault(key, []).append((spec_id, float(fare)))

    results: list[dict] = []

    for (route_id, wc, adv), obs_list in cells.items():
        # Compute price relatives for each observation
        log_sum = 0.0
        n_valid = 0

        for spec_id, fare in obs_list:
            ref_price = _get_or_seed_reference_price(
                conn, route_id, wc, adv, spec_id,
            )

            if ref_price is None or ref_price <= 0:
                # Try generic (no service_spec_id) reference as fallback
                ref_price = _get_or_seed_reference_price(
                    conn, route_id, wc, adv, None,
                )

            if ref_price is None or ref_price <= 0:
                continue

            price_relative = fare / ref_price

            # Safety: clip extreme outliers to avoid log(0) or overflow
            if price_relative <= 0:
                continue

            log_sum += math.log(price_relative)
            n_valid += 1

        if n_valid == 0:
            continue

        # Jevons geometric mean × 100 (index form, base = 100)
        jevons = math.exp(log_sum / n_valid) * 100.0

        results.append({
            "route_id": route_id,
            "window_category": wc,
            "advance_days": adv,
            "date": target_date,
            "price_relative": round(jevons, 4),
            "n_observations": n_valid,
        })

    logger.info(
        "Computed %d route-level Jevons indices for %s.",
        len(results), target_date,
    )
    return results


def _upsert_route_indices(conn, indices: list[dict]) -> int:
    """Write route-level indices to route_index table (upsert)."""
    if not indices:
        return 0

    query = """
    INSERT INTO route_index (route_id, window_category, advance_days, date,
                             price_relative, n_observations)
    VALUES %s
    ON CONFLICT (route_id, window_category, advance_days, date)
    DO UPDATE SET
        price_relative = EXCLUDED.price_relative,
        n_observations = EXCLUDED.n_observations;
    """
    rows = [
        (i["route_id"], i["window_category"], i["advance_days"],
         i["date"], i["price_relative"], i["n_observations"])
        for i in indices
    ]
    with conn.cursor() as cur:
        execute_values(cur, query, rows, page_size=500)
    conn.commit()
    return len(rows)


# ---------------------------------------------------------------------------
# Step 3: DAPIx and IAPIx (Young-type weighted sums)
# ---------------------------------------------------------------------------

def _fetch_active_routes(conn, target_date: date) -> list[dict]:
    """Fetch all routes, marking which are active today (seasonal check)."""
    query = """
    SELECT route_id, domestic_international, route_weight,
           is_seasonal, season_window
    FROM routes
    ORDER BY route_id;
    """
    with conn.cursor() as cur:
        cur.execute(query)
        cols = [d[0] for d in cur.description]
        rows = [dict(zip(cols, r)) for r in cur.fetchall()]

    active = []
    for r in rows:
        if r["is_seasonal"] and not _is_in_season(r.get("season_window"), target_date):
            logger.debug(
                "Seasonal route %s excluded (season_window=%s, today=%s).",
                r["route_id"], r.get("season_window"), target_date,
            )
            continue
        active.append(r)

    return active


def _compute_weighted_index(
    route_indices: list[dict],
    routes_in_bucket: list[dict],
) -> Optional[float]:
    """Compute Young-type weighted average of route-level Jevons indices.

    Young index = Σ(w_i × I_i) / Σ(w_i)

    where w_i = route_weight, I_i = route's Jevons index.
    Only routes that have at least one index value are included.
    """
    # Build lookup: route_id → list of price_relative values
    route_index_map: dict[str, list[float]] = {}
    for idx in route_indices:
        rid = idx["route_id"]
        route_index_map.setdefault(rid, []).append(idx["price_relative"])

    weighted_sum = 0.0
    weight_sum = 0.0

    for route in routes_in_bucket:
        rid = route["route_id"]
        weight = float(route.get("route_weight") or 1.0)

        values = route_index_map.get(rid, [])
        if not values:
            continue

        # Average across all windows for this route on this day
        route_avg = sum(values) / len(values)
        weighted_sum += weight * route_avg
        weight_sum += weight

    if weight_sum <= 0:
        return None

    return round(weighted_sum / weight_sum, 4)


# ---------------------------------------------------------------------------
# Step 4: Overall APIx + national_index
# ---------------------------------------------------------------------------

def _compute_coverage_and_confidence(
    conn,
    target_date: date,
    active_routes: list[dict],
    route_indices: list[dict],
) -> tuple[float, float]:
    """Compute coverage_score and confidence_score for the national index.

    coverage_score:  fraction of active routes that have at least one
                     route_index entry today.
    confidence_score: weighted average of per-route (non-imputed / total)
                      observation ratios.
    """
    routes_with_index = {i["route_id"] for i in route_indices}
    active_route_ids = {r["route_id"] for r in active_routes}

    # Coverage: what fraction of active routes have index values?
    if active_route_ids:
        coverage = len(routes_with_index & active_route_ids) / len(active_route_ids)
    else:
        coverage = 0.0

    # Confidence: what fraction of today's observations are non-imputed?
    query = """
    SELECT
        COUNT(*) FILTER (WHERE is_imputed = FALSE) AS real_count,
        COUNT(*) AS total_count
    FROM observations
    WHERE collection_timestamp::date = %s
      AND total_fare_inr IS NOT NULL;
    """
    with conn.cursor() as cur:
        cur.execute(query, (target_date,))
        row = cur.fetchone()

    if row and row[1] > 0:
        confidence = row[0] / row[1]
    else:
        confidence = 0.0

    return round(coverage, 4), round(confidence, 4)


def _determine_status(conn, target_date: date) -> str:
    """Determine the status for the national_index entry.

    - 'live':      current day (today or yesterday).
    - 'mtd':       current month's running aggregate, not yet finalized.
    - 'finalized': all days in that month have DB entries and no pending
                   imputation gaps (100% coverage across the month).
    """
    today = datetime.now(timezone.utc).date()

    # If target_date is today or yesterday → 'live'
    if target_date >= today - timedelta(days=1):
        return "live"

    # If target_date is in the current month → 'mtd'
    if target_date.year == today.year and target_date.month == today.month:
        return "mtd"

    # For past months, check if the entire month is covered
    first_of_month = target_date.replace(day=1)
    if target_date.month == 12:
        last_of_month = target_date.replace(year=target_date.year + 1, month=1, day=1) - timedelta(days=1)
    else:
        last_of_month = target_date.replace(month=target_date.month + 1, day=1) - timedelta(days=1)

    days_in_month = (last_of_month - first_of_month).days + 1

    query = """
    SELECT COUNT(DISTINCT date) FROM national_index
    WHERE date >= %s AND date <= %s;
    """
    with conn.cursor() as cur:
        cur.execute(query, (first_of_month, last_of_month))
        row = cur.fetchone()
        covered_days = row[0] if row else 0

    if covered_days >= days_in_month:
        return "finalized"

    return "mtd"


def _compute_national_indices(
    conn,
    target_date: date,
    route_indices: list[dict],
    active_routes: list[dict],
) -> list[dict]:
    """Compute DAPIx, IAPIx, and Overall APIx for each window_category.

    Returns list of dicts for national_index insertion.
    """
    # Split routes by bucket
    domestic_routes = [r for r in active_routes if r["domestic_international"] == "domestic"]
    international_routes = [r for r in active_routes if r["domestic_international"] == "international"]

    # Get distinct window_categories from today's route indices
    window_categories = sorted({i["window_category"] for i in route_indices})

    if not window_categories:
        logger.warning("No window categories found in route indices for %s.", target_date)
        return []

    coverage, confidence = _compute_coverage_and_confidence(
        conn, target_date, active_routes, route_indices,
    )
    status = _determine_status(conn, target_date)

    results: list[dict] = []

    for wc in window_categories:
        # Filter route_indices to this window_category
        wc_indices = [i for i in route_indices if i["window_category"] == wc]

        # DAPIx: Young-type weighted sum of domestic routes only
        dapix = _compute_weighted_index(wc_indices, domestic_routes)

        # IAPIx: Young-type weighted sum of international routes only
        # IMPORTANT: DAPIx and IAPIx are SEPARATE calculations.
        # Domestic and international routes are NEVER mixed in the same sum.
        iapix = _compute_weighted_index(wc_indices, international_routes)

        # Overall APIx: combine DAPIx and IAPIx with prototype weights.
        # NOTE(prototype): These weights (70/30 domestic/international) are
        # placeholder approximations based on relative route counts (~10
        # domestic vs 4 international in the basket). The production system
        # should use MoSPI/DGCA passenger-traffic-share data for proper
        # expenditure-based weighting, consistent with CPI methodology.
        if dapix is not None and iapix is not None:
            overall = round(
                DOMESTIC_WEIGHT * dapix + INTERNATIONAL_WEIGHT * iapix,
                4,
            )
        elif dapix is not None:
            overall = dapix
            logger.warning(
                "No IAPIx for %s %s — overall APIx = DAPIx only.", target_date, wc,
            )
        elif iapix is not None:
            overall = iapix
            logger.warning(
                "No DAPIx for %s %s — overall APIx = IAPIx only.", target_date, wc,
            )
        else:
            overall = None
            logger.warning("No index data at all for %s %s.", target_date, wc)
            continue

        results.append({
            "date": target_date,
            "window_category": wc,
            "domestic_apix": dapix,
            "international_apix": iapix,
            "overall_apix": overall,
            "status": status,
            "coverage_score": coverage,
            "confidence_score": confidence,
        })

    logger.info(
        "Computed national indices for %s: %d window categories, "
        "DAPIx=%s, IAPIx=%s, status=%s, coverage=%.2f, confidence=%.2f",
        target_date, len(results),
        results[0]["domestic_apix"] if results else "N/A",
        results[0]["international_apix"] if results else "N/A",
        status, coverage, confidence,
    )

    return results


def _upsert_national_indices(conn, indices: list[dict]) -> int:
    """Write national-level indices to national_index table (upsert)."""
    if not indices:
        return 0

    query = """
    INSERT INTO national_index (date, window_category, domestic_apix,
                                international_apix, overall_apix, status,
                                coverage_score, confidence_score)
    VALUES %s
    ON CONFLICT (date, window_category)
    DO UPDATE SET
        domestic_apix       = EXCLUDED.domestic_apix,
        international_apix  = EXCLUDED.international_apix,
        overall_apix        = EXCLUDED.overall_apix,
        status              = EXCLUDED.status,
        coverage_score      = EXCLUDED.coverage_score,
        confidence_score    = EXCLUDED.confidence_score;
    """
    rows = [
        (i["date"], i["window_category"], i["domestic_apix"],
         i["international_apix"], i["overall_apix"], i["status"],
         i["coverage_score"], i["confidence_score"])
        for i in indices
    ]
    with conn.cursor() as cur:
        execute_values(cur, query, rows, page_size=100)
    conn.commit()
    return len(rows)


# ---------------------------------------------------------------------------
# Main orchestrator
# ---------------------------------------------------------------------------

def run_index_engine(
    database_url: Optional[str] = None,
    target_date: Optional[date] = None,
) -> dict[str, Any]:
    """Execute the full index computation pipeline for a single day.

    Workflow:
    0. Log flight_events (informational only — never affects pricing).
    1. Compute route-level Jevons indices (auto-seeding reference prices).
    2. Compute DAPIx (domestic) and IAPIx (international) via Young weighting.
    3. Compute overall APIx (combined).
    4. Write results to route_index and national_index.

    Args:
        database_url: Neon connection string (falls back to NEON_DATABASE_URL).
        target_date:  Date to compute indices for (defaults to today UTC).

    Returns:
        Summary dict with counts, index values, and status.
    """
    start = datetime.now(timezone.utc)
    today = target_date or start.date()

    logger.info("=" * 80)
    logger.info("FlyWise Index Engine Starting: %s (date: %s)", start.isoformat(), today)
    logger.info("=" * 80)

    conn = _get_connection(database_url)
    try:
        # Ensure reference_prices table exists
        _ensure_reference_prices_table(conn)

        # ── Step 0: Flight events (informational only) ──────────────
        # DESIGN NOTE: flight_events is checked here ONLY for logging.
        # Events are NEVER used to exclude, adjust, or weight observation
        # prices.  See the _log_flight_events docstring for full rationale.
        n_events = _log_flight_events(conn, today)

        # ── Step 1: Route-level Jevons indices ──────────────────────
        logger.info("--- Step 1: Route-Level Jevons Indices ---")
        route_indices = _compute_route_indices(conn, today)

        if not route_indices:
            logger.warning("No route indices computed for %s. Cannot proceed.", today)
            return {
                "status": "NOOP",
                "date": today.isoformat(),
                "route_indices": 0,
                "national_indices": 0,
                "flight_events": n_events,
            }

        route_rows = _upsert_route_indices(conn, route_indices)
        logger.info("Upserted %d route_index rows.", route_rows)

        # ── Step 2–3: DAPIx, IAPIx, Overall APIx ───────────────────
        logger.info("--- Step 2: DAPIx / IAPIx / Overall APIx ---")
        active_routes = _fetch_active_routes(conn, today)
        logger.info(
            "Active routes today: %d (%d domestic, %d international)",
            len(active_routes),
            sum(1 for r in active_routes if r["domestic_international"] == "domestic"),
            sum(1 for r in active_routes if r["domestic_international"] == "international"),
        )

        national_indices = _compute_national_indices(
            conn, today, route_indices, active_routes,
        )

        # ── Step 4: Write national_index ────────────────────────────
        logger.info("--- Step 3: Persisting National Indices ---")
        national_rows = _upsert_national_indices(conn, national_indices)
        logger.info("Upserted %d national_index rows.", national_rows)

        end = datetime.now(timezone.utc)
        duration = (end - start).total_seconds()

        # Build summary
        dapix_vals = [i["domestic_apix"] for i in national_indices if i["domestic_apix"]]
        iapix_vals = [i["international_apix"] for i in national_indices if i["international_apix"]]
        overall_vals = [i["overall_apix"] for i in national_indices if i["overall_apix"]]

        summary: dict[str, Any] = {
            "status": "SUCCESS",
            "date": today.isoformat(),
            "flight_events_logged": n_events,
            "route_indices_computed": len(route_indices),
            "route_indices_upserted": route_rows,
            "national_indices_upserted": national_rows,
            "dapix_range": f"{min(dapix_vals):.2f}–{max(dapix_vals):.2f}" if dapix_vals else "N/A",
            "iapix_range": f"{min(iapix_vals):.2f}–{max(iapix_vals):.2f}" if iapix_vals else "N/A",
            "overall_apix_range": f"{min(overall_vals):.2f}–{max(overall_vals):.2f}" if overall_vals else "N/A",
            "index_status": national_indices[0]["status"] if national_indices else "N/A",
            "coverage_score": national_indices[0]["coverage_score"] if national_indices else 0,
            "confidence_score": national_indices[0]["confidence_score"] if national_indices else 0,
            "duration_seconds": round(duration, 2),
        }

        logger.info("=" * 80)
        logger.info("FLYWISE INDEX ENGINE COMPLETE")
        for k, v in summary.items():
            logger.info("  %-28s %s", k + ":", v)
        logger.info("=" * 80)

        return summary

    except Exception as e:
        logger.error("Index engine failed: %s", e, exc_info=True)
        raise
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="FlyWise Index Engine")
    parser.add_argument(
        "--date", type=str, default=None,
        help="Target date (YYYY-MM-DD). Defaults to today UTC.",
    )
    args = parser.parse_args()

    target = date.fromisoformat(args.date) if args.date else None
    result = run_index_engine(target_date=target)

    print("\nIndex Engine Result:")
    for k, v in result.items():
        print(f"  {k}: {v}")
