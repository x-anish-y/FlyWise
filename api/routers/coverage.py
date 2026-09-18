"""
api/routers/coverage.py
FlyWise (APIx) — Coverage and confidence score endpoints.

  GET /coverage?date=...    — coverage_score from national_index
  GET /confidence?date=...  — confidence_score from national_index
"""

from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from api.db import get_db_connection

router = APIRouter(tags=["Coverage & Confidence"])


@router.get("/coverage")
def get_coverage(
    date_param: Optional[date] = Query(
        None,
        alias="date",
        description="Date (YYYY-MM-DD). Defaults to the latest available.",
    ),
    conn=Depends(get_db_connection),
):
    """Return coverage_score per window_category for a given date."""
    if date_param:
        query = """
        SELECT date, window_category, coverage_score, status
        FROM national_index
        WHERE date = %s
        ORDER BY window_category;
        """
        params = (date_param,)
    else:
        # Latest date available
        query = """
        SELECT date, window_category, coverage_score, status
        FROM national_index
        WHERE date = (SELECT MAX(date) FROM national_index)
        ORDER BY window_category;
        """
        params = ()

    with conn.cursor() as cur:
        cur.execute(query, params)
        rows = cur.fetchall()

    if not rows:
        raise HTTPException(status_code=404, detail="No coverage data found.")

    return {
        "date": str(rows[0][0]),
        "entries": [
            {
                "window_category": r[1],
                "coverage_score": float(r[2]) if r[2] is not None else None,
                "status": r[3],
            }
            for r in rows
        ],
    }


@router.get("/confidence")
def get_confidence(
    date_param: Optional[date] = Query(
        None,
        alias="date",
        description="Date (YYYY-MM-DD). Defaults to the latest available.",
    ),
    conn=Depends(get_db_connection),
):
    """Return confidence_score per window_category for a given date."""
    if date_param:
        query = """
        SELECT date, window_category, confidence_score, status
        FROM national_index
        WHERE date = %s
        ORDER BY window_category;
        """
        params = (date_param,)
    else:
        query = """
        SELECT date, window_category, confidence_score, status
        FROM national_index
        WHERE date = (SELECT MAX(date) FROM national_index)
        ORDER BY window_category;
        """
        params = ()

    with conn.cursor() as cur:
        cur.execute(query, params)
        rows = cur.fetchall()

    if not rows:
        raise HTTPException(status_code=404, detail="No confidence data found.")

    return {
        "date": str(rows[0][0]),
        "entries": [
            {
                "window_category": r[1],
                "confidence_score": float(r[2]) if r[2] is not None else None,
                "status": r[3],
            }
            for r in rows
        ],
    }
