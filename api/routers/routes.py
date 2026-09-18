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
from api.models.schemas import RouteHistoryResponse, RouteIndexOut, RouteOut

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


@router.get("/{route_id}/history", response_model=RouteHistoryResponse)
def get_route_history(
    route_id: str = Path(..., description="Route ID, e.g. 'DEL-BOM'."),
    window: Optional[str] = Query(
        None,
        description="Filter by window_category (from route_index).",
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

    # Build dynamic query
    conditions = ["route_id = %s"]
    params: list = [route_id]

    if window:
        conditions.append("window_category = %s")
        params.append(window)
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
            price_relative=float(r[4]) if r[4] else None,
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
