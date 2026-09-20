"""
api/routers/routes.py
FlyWise (APIx) — Route-level index history endpoint.

  GET /routes/{route_id}/history — price relative time series from route_index.
"""

from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Path, Query

from api.db import DatabaseSession, get_db
from api.models.schemas import (
    RouteHistoryResponse,
    RouteIndexOut,
    RouteOut,
    RouteSummaryResponse,
)

router = APIRouter(prefix="/routes", tags=["Routes"])


@router.get("", response_model=list[RouteOut])
def list_routes(db: DatabaseSession = Depends(get_db)):
    """Return list of all configured routes with metadata."""
    query = """
    SELECT route_id, origin_airport, destination_airport, domestic_international,
           route_weight, currency, is_seasonal, season_window
    FROM routes
    ORDER BY route_id ASC;
    """
    rows = db.execute(query, fetch="all")
    return [
        RouteOut(
            route_id=r[0],
            origin_airport=r[1],
            destination_airport=r[2],
            domestic_international=r[3],
            route_weight=float(r[4]) if r[4] is not None else None,
            currency=r[5] or "INR",
            is_seasonal=bool(r[6]),
            season_window=r[7],
        )
        for r in rows
    ]


def _resolve_window_filter(
    db: DatabaseSession,
    route_id: str,
    window: Optional[str],
) -> tuple[str, list]:
    """Map window query param to SQL clause and params for route_index.

    In CPI methodology:
      - 'cpi_compatible': T+21 (advance_days = 21) for domestic routes,
                          T+60 (advance_days = 60) for international routes.
      - 'analytical':     all other advance windows (advance_days != 21/60).
      - 'T+1', 'T+7', ... explicit advance category.
      - None / 'all':     no window filter.
    """
    if not window or window == "all":
        return "", []

    route_row = db.execute(
        "SELECT domestic_international FROM routes WHERE route_id = %s;",
        (route_id,),
        fetch="one",
    )
    is_domestic = bool(route_row and route_row[0] == "domestic")
    cpi_adv = 21 if is_domestic else 60

    if window == "cpi_compatible":
        return "AND advance_days = %s", [cpi_adv]
    elif window == "analytical":
        return "AND advance_days != %s", [cpi_adv]
    else:
        return "AND window_category = %s", [window]


@router.get("/{route_id}/history", response_model=RouteHistoryResponse)
def get_route_history(
    route_id: str = Path(..., description="Route ID, e.g. 'DEL-BOM'."),
    window: Optional[str] = Query(
        None,
        description="Filter by window ('cpi_compatible', 'analytical', or 'T+21').",
    ),
    from_date: Optional[date] = Query(
        None,
        alias="from",
        description="Start date (inclusive).",
    ),
    to_date: Optional[date] = Query(
        None,
        alias="to",
        description="End date (inclusive).",
    ),
    db: DatabaseSession = Depends(get_db),
):
    """Return the price-relative history for a specific route."""
    # Validate route exists
    exists = db.execute("SELECT 1 FROM routes WHERE route_id = %s;", (route_id,), fetch="one")
    if not exists:
        raise HTTPException(status_code=404, detail=f"Route '{route_id}' not found.")

    win_clause, win_params = _resolve_window_filter(db, route_id, window)

    conditions = ["route_id = %s"]
    params: list = [route_id]

    if win_clause:
        conditions.append(win_clause.lstrip("AND "))
        params.extend(win_params)
    if from_date:
        conditions.append("date >= %s")
        params.append(from_date)
    if to_date:
        conditions.append("date <= %s")
        params.append(to_date)

    where_clause = " AND ".join(conditions)

    query = f"""
    SELECT route_id, window_category, advance_days, date,
           price_relative, n_observations
    FROM route_index
    WHERE {where_clause}
    ORDER BY date ASC, advance_days ASC;
    """

    rows = db.execute(query, params, fetch="all")

    data = [
        RouteIndexOut(
            route_id=r[0],
            window_category=r[1],
            advance_days=r[2],
            date=r[3],
            price_relative=float(r[4]) if r[4] is not None else None,
            n_observations=r[5],
        )
        for r in rows
    ]

    return RouteHistoryResponse(
        route_id=route_id,
        window_category=window,
        from_date=from_date,
        to_date=to_date,
        total_records=len(data),
        data=data,
    )


@router.get("/{route_id}/summary", response_model=RouteSummaryResponse)
def get_route_summary(
    route_id: str = Path(..., description="Route ID, e.g. 'DEL-BOM'."),
    window: str = Query(
        "cpi_compatible",
        description="Window category: 'cpi_compatible' or 'analytical'.",
    ),
    db: DatabaseSession = Depends(get_db),
):
    """Return a stock-index-style snapshot for one route.

    - today_open: earliest cycle/advance today (or previous recorded close if single observation today)
    - today_close: most recent cycle/observation today
    - today_high / today_low: max/min price_relative across today's cycles
    - today_change_value / today_change_pct: today_close - today_open, and percentage
    - alltime_high / alltime_low with their dates across the route's full history
    - tracking_since: earliest date recorded in route_index
    - last_updated: collection_timestamp of the most recent cycle
    """
    # 1. Validate route exists and retrieve seasonality
    route_meta = db.execute(
        "SELECT is_seasonal, season_window FROM routes WHERE route_id = %s;", (route_id,), fetch="one"
    )
    if not route_meta:
        raise HTTPException(status_code=404, detail=f"Route '{route_id}' not found.")

    is_seasonal = bool(route_meta[0])
    season_window = route_meta[1]
    is_in_season = True
    if is_seasonal and season_window:
        today_m = date.today().month
        parts = season_window.strip().split("-")
        if len(parts) == 2:
            m_map = {
                "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
                "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
            }
            sm = m_map.get(parts[0].strip()[:3].lower(), 1)
            em = m_map.get(parts[1].strip()[:3].lower(), 12)
            if sm <= em:
                is_in_season = sm <= today_m <= em
            else:
                is_in_season = today_m >= sm or today_m <= em

    win_clause, win_params = _resolve_window_filter(db, route_id, window)

    # 2. Today's intraday stats
    today_query = f"""
    SELECT price_relative, advance_days
    FROM route_index
    WHERE route_id = %s {win_clause} AND date = CURRENT_DATE
    ORDER BY advance_days ASC;
    """
    today_rows = db.execute(today_query, [route_id] + win_params, fetch="all")

    today_open = None
    today_close = None
    today_high = None
    today_low = None
    today_change_value = None
    today_change_pct = None

    if today_rows:
        valid_vals = [float(r[0]) for r in today_rows if r[0] is not None]
        if valid_vals:
            today_high = max(valid_vals)
            today_low = min(valid_vals)
            today_close = float(today_rows[-1][0])

            if len(today_rows) > 1:
                today_open = float(today_rows[0][0])
            else:
                # Single observation today — check previous session close
                prev_row = db.execute(
                    f"""
                    SELECT price_relative
                    FROM route_index
                    WHERE route_id = %s {win_clause} AND date < CURRENT_DATE
                    ORDER BY date DESC, advance_days DESC
                    LIMIT 1;
                    """,
                    [route_id] + win_params,
                    fetch="one",
                )
                today_open = float(prev_row[0]) if prev_row and prev_row[0] is not None else today_close

            today_change_value = round(today_close - today_open, 4)
            today_change_pct = round((today_change_value / today_open) * 100, 2) if today_open else 0.0

    # 3. All-time extremes & tracking since
    at_query = f"""
    SELECT
        MAX(price_relative) AS ath,
        MIN(price_relative) AS atl,
        MIN(date)           AS tracking_since
    FROM route_index
    WHERE route_id = %s {win_clause};
    """
    at_row = db.execute(at_query, [route_id] + win_params, fetch="one")

    alltime_high = float(at_row[0]) if at_row and at_row[0] is not None else None
    alltime_low = float(at_row[1]) if at_row and at_row[1] is not None else None
    tracking_since = at_row[2] if at_row else None

    alltime_high_date = None
    if alltime_high is not None:
        ath_d = db.execute(
            f"""
            SELECT date FROM route_index
            WHERE route_id = %s {win_clause} AND price_relative = %s
            ORDER BY date ASC LIMIT 1;
            """,
            [route_id] + win_params + [alltime_high],
            fetch="one",
        )
        if ath_d:
            alltime_high_date = ath_d[0]

    alltime_low_date = None
    if alltime_low is not None:
        atl_d = db.execute(
            f"""
            SELECT date FROM route_index
            WHERE route_id = %s {win_clause} AND price_relative = %s
            ORDER BY date ASC LIMIT 1;
            """,
            [route_id] + win_params + [alltime_low],
            fetch="one",
        )
        if atl_d:
            alltime_low_date = atl_d[0]

    # 4. Most recent cycle timestamp from observations
    ts_row = db.execute(
        "SELECT MAX(collection_timestamp) FROM observations WHERE route_id = %s;",
        (route_id,),
        fetch="one",
    )
    last_updated = ts_row[0] if ts_row and ts_row[0] is not None else None

    return RouteSummaryResponse(
        route_id=route_id,
        window_category=window,
        today_open=today_open,
        today_close=today_close,
        today_high=today_high,
        today_low=today_low,
        today_change_value=today_change_value,
        today_change_pct=today_change_pct,
        alltime_high=alltime_high,
        alltime_high_date=alltime_high_date,
        alltime_low=alltime_low,
        alltime_low_date=alltime_low_date,
        tracking_since=tracking_since,
        last_updated=last_updated,
        is_seasonal=is_seasonal,
        season_window=season_window,
        is_in_season=is_in_season,
    )

