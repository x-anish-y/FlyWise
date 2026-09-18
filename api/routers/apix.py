"""
api/routers/apix.py
FlyWise (APIx) — National index (APIx) endpoints.

  GET /apix/daily   — single-day national index
  GET /apix/weekly  — 7-day rolling average
  GET /apix/monthly — calendar-month average
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from api.db import DatabaseSession, get_db
from api.models.schemas import (
    DailyApixResponse,
    WeeklyApixResponse,
    MonthlyApixResponse,
)

router = APIRouter(prefix="/apix", tags=["APIx — National Index"])


# ---------------------------------------------------------------------------
# GET /apix/daily
# ---------------------------------------------------------------------------

@router.get("/daily", response_model=DailyApixResponse)
def get_daily_apix(
    window: str = Query(
        "cpi_compatible",
        description="Window category: 'cpi_compatible' or 'analytical'.",
        pattern="^(cpi_compatible|analytical)$",
    ),
    date_param: date = Query(
        None,
        alias="date",
        description="Date (YYYY-MM-DD). Defaults to the latest available.",
    ),
    db: DatabaseSession = Depends(get_db),
):
    """Return the national APIx index for a single day."""
    if date_param:
        query = """
        SELECT date, window_category, domestic_apix, international_apix,
               overall_apix, status
        FROM national_index
        WHERE window_category = %s AND date = %s;
        """
        params = (window, date_param)
    else:
        query = """
        SELECT date, window_category, domestic_apix, international_apix,
               overall_apix, status
        FROM national_index
        WHERE window_category = %s
        ORDER BY date DESC
        LIMIT 1;
        """
        params = (window,)

    row = db.execute(query, params, fetch="one")

    if not row:
        raise HTTPException(status_code=404, detail="No index data found for the given parameters.")

    return DailyApixResponse(
        date=row[0],
        window_category=row[1],
        domestic_apix=row[2],
        international_apix=row[3],
        overall_apix=row[4],
        status=row[5],
    )


# ---------------------------------------------------------------------------
# GET /apix/weekly
# ---------------------------------------------------------------------------

@router.get("/weekly", response_model=WeeklyApixResponse)
def get_weekly_apix(
    window: str = Query(
        "cpi_compatible",
        pattern="^(cpi_compatible|analytical)$",
    ),
    date_param: date = Query(
        None,
        alias="date",
        description="End date of the 7-day window. Defaults to today.",
    ),
    db: DatabaseSession = Depends(get_db),
):
    """Return the 7-day rolling average of the national APIx index."""
    end = date_param or date.today()
    start = end - timedelta(days=6)

    query = """
    SELECT
        MIN(date) AS week_start,
        MAX(date) AS week_end,
        AVG(domestic_apix)       AS avg_dapix,
        AVG(international_apix)  AS avg_iapix,
        AVG(overall_apix)        AS avg_overall,
        COUNT(*)                 AS n_days
    FROM national_index
    WHERE window_category = %s
      AND date BETWEEN %s AND %s;
    """
    row = db.execute(query, (window, start, end), fetch="one")

    if not row or row[5] == 0:
        raise HTTPException(status_code=404, detail="No index data found for the given week.")

    return WeeklyApixResponse(
        week_start=row[0] or start,
        week_end=row[1] or end,
        window_category=window,
        avg_domestic_apix=round(float(row[2]), 4) if row[2] else None,
        avg_international_apix=round(float(row[3]), 4) if row[3] else None,
        avg_overall_apix=round(float(row[4]), 4) if row[4] else None,
        n_days=row[5],
    )


# ---------------------------------------------------------------------------
# GET /apix/monthly
# ---------------------------------------------------------------------------

@router.get("/monthly", response_model=MonthlyApixResponse)
def get_monthly_apix(
    window: str = Query(
        "cpi_compatible",
        pattern="^(cpi_compatible|analytical)$",
    ),
    month: str = Query(
        ...,
        description="Month in YYYY-MM format.",
        pattern=r"^\d{4}-\d{2}$",
    ),
    db: DatabaseSession = Depends(get_db),
):
    """Return the calendar-month average of the national APIx index."""
    query = """
    SELECT
        AVG(domestic_apix)       AS avg_dapix,
        AVG(international_apix)  AS avg_iapix,
        AVG(overall_apix)        AS avg_overall,
        COUNT(*)                 AS n_days,
        MAX(status)              AS status
    FROM national_index
    WHERE window_category = %s
      AND TO_CHAR(date, 'YYYY-MM') = %s;
    """
    row = db.execute(query, (window, month), fetch="one")

    if not row or row[3] == 0:
        raise HTTPException(status_code=404, detail=f"No index data found for {month}.")

    return MonthlyApixResponse(
        month=month,
        window_category=window,
        avg_domestic_apix=round(float(row[0]), 4) if row[0] else None,
        avg_international_apix=round(float(row[1]), 4) if row[1] else None,
        avg_overall_apix=round(float(row[2]), 4) if row[2] else None,
        n_days=row[3],
        status=row[4],
    )
