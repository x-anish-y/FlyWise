"""
api/routers/policy_export.py
FlyWise (APIx) — NSO/RBI-facing policy export endpoints.

All endpoints in this router are protected by X-API-Key authentication
(see api/middleware/api_key_auth.py).

  GET /policy/apix.csv   — full APIx time series as CSV
  GET /policy/apix.json  — full APIx time series as JSON
  GET /policy/routes.csv  — full route-level breakdown as CSV
  GET /policy/routes.json — full route-level breakdown as JSON
"""

from __future__ import annotations

import csv
import io
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse

from api.db import DatabaseSession, get_db
from api.middleware.api_key_auth import require_api_key
from api.models.schemas import PolicyApixRow, PolicyRouteRow

router = APIRouter(
    prefix="/policy",
    tags=["Policy Export (API-key protected)"],
    dependencies=[Depends(require_api_key)],
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _build_csv_stream(rows: list[dict], fieldnames: list[str]) -> io.StringIO:
    """Build a CSV string from a list of dicts."""
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(rows)
    output.seek(0)
    return output


def _fetch_apix_data(
    db: DatabaseSession,
    window: Optional[str],
    from_date: Optional[date],
    to_date: Optional[date],
) -> list[dict]:
    """Query national_index with optional filters."""
    conditions = []
    params: list = []

    if window:
        conditions.append("window_category = %s")
        params.append(window)
    if from_date:
        conditions.append("date >= %s")
        params.append(from_date)
    if to_date:
        conditions.append("date <= %s")
        params.append(to_date)

    where = "WHERE " + " AND ".join(conditions) if conditions else ""

    query = f"""
    SELECT date, window_category, domestic_apix, international_apix,
           overall_apix, status, coverage_score, confidence_score
    FROM national_index
    {where}
    ORDER BY date ASC, window_category ASC;
    """
    return db.execute(query, params if params else None, fetch="dicts")


def _fetch_routes_data(
    db: DatabaseSession,
    window: Optional[str],
    from_date: Optional[date],
    to_date: Optional[date],
) -> list[dict]:
    """Query route_index with optional filters."""
    conditions = []
    params: list = []

    if window:
        conditions.append("window_category = %s")
        params.append(window)
    if from_date:
        conditions.append("date >= %s")
        params.append(from_date)
    if to_date:
        conditions.append("date <= %s")
        params.append(to_date)

    where = "WHERE " + " AND ".join(conditions) if conditions else ""

    query = f"""
    SELECT route_id, window_category, advance_days, date,
           price_relative, n_observations
    FROM route_index
    {where}
    ORDER BY date ASC, route_id ASC, advance_days ASC;
    """
    return db.execute(query, params if params else None, fetch="dicts")


# ---------------------------------------------------------------------------
# APIx endpoints
# ---------------------------------------------------------------------------

APIX_FIELDS = [
    "date", "window_category", "domestic_apix", "international_apix",
    "overall_apix", "status", "coverage_score", "confidence_score",
]


@router.get("/apix.csv")
def export_apix_csv(
    window: Optional[str] = Query(None, pattern="^(cpi_compatible|analytical)$"),
    from_date: Optional[date] = Query(None, alias="from"),
    to_date: Optional[date] = Query(None, alias="to"),
    db: DatabaseSession = Depends(get_db),
):
    """Export the full APIx time series as a CSV file (streamed)."""
    rows = _fetch_apix_data(db, window, from_date, to_date)
    # Ensure date is serialized as string
    for r in rows:
        r["date"] = str(r["date"])
    stream = _build_csv_stream(rows, APIX_FIELDS)
    return StreamingResponse(
        stream,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=flywise_apix.csv"},
    )


@router.get("/apix.json", response_model=list[PolicyApixRow])
def export_apix_json(
    window: Optional[str] = Query(None, pattern="^(cpi_compatible|analytical)$"),
    from_date: Optional[date] = Query(None, alias="from"),
    to_date: Optional[date] = Query(None, alias="to"),
    db: DatabaseSession = Depends(get_db),
):
    """Export the full APIx time series as JSON."""
    return _fetch_apix_data(db, window, from_date, to_date)


# ---------------------------------------------------------------------------
# Routes endpoints
# ---------------------------------------------------------------------------

ROUTES_FIELDS = [
    "route_id", "window_category", "advance_days", "date",
    "price_relative", "n_observations",
]


@router.get("/routes.csv")
def export_routes_csv(
    window: Optional[str] = Query(None),
    from_date: Optional[date] = Query(None, alias="from"),
    to_date: Optional[date] = Query(None, alias="to"),
    db: DatabaseSession = Depends(get_db),
):
    """Export the full route-level index breakdown as CSV (streamed)."""
    rows = _fetch_routes_data(db, window, from_date, to_date)
    for r in rows:
        r["date"] = str(r["date"])
    stream = _build_csv_stream(rows, ROUTES_FIELDS)
    return StreamingResponse(
        stream,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=flywise_routes.csv"},
    )


@router.get("/routes.json", response_model=list[PolicyRouteRow])
def export_routes_json(
    window: Optional[str] = Query(None),
    from_date: Optional[date] = Query(None, alias="from"),
    to_date: Optional[date] = Query(None, alias="to"),
    db: DatabaseSession = Depends(get_db),
):
    """Export the full route-level index breakdown as JSON."""
    return _fetch_routes_data(db, window, from_date, to_date)
