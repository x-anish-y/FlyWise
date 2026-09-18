"""
api/models/schemas.py
FlyWise (APIx) — Pydantic models for API request/response validation.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------

class RouteOut(BaseModel):
    route_id: str
    origin_airport: str
    destination_airport: str
    domestic_international: str
    route_weight: Optional[float] = None
    currency: str = "INR"
    is_seasonal: bool = False
    season_window: Optional[str] = None


# ---------------------------------------------------------------------------
# National Index (APIx)
# ---------------------------------------------------------------------------

class NationalIndexOut(BaseModel):
    date: date
    window_category: str
    domestic_apix: Optional[float] = None
    international_apix: Optional[float] = None
    overall_apix: Optional[float] = None
    status: Optional[str] = None
    coverage_score: Optional[float] = None
    confidence_score: Optional[float] = None


class DailyApixResponse(BaseModel):
    """Response for GET /apix/daily."""
    date: date
    window_category: str
    domestic_apix: Optional[float] = None
    international_apix: Optional[float] = None
    overall_apix: Optional[float] = None
    status: Optional[str] = None


class WeeklyApixResponse(BaseModel):
    """Response for GET /apix/weekly — aggregated over a 7-day window."""
    week_start: date
    week_end: date
    window_category: str
    avg_domestic_apix: Optional[float] = None
    avg_international_apix: Optional[float] = None
    avg_overall_apix: Optional[float] = None
    n_days: int = 0


class MonthlyApixResponse(BaseModel):
    """Response for GET /apix/monthly — aggregated over a calendar month."""
    month: str  # YYYY-MM
    window_category: str
    avg_domestic_apix: Optional[float] = None
    avg_international_apix: Optional[float] = None
    avg_overall_apix: Optional[float] = None
    n_days: int = 0
    status: Optional[str] = None


# ---------------------------------------------------------------------------
# Route Index
# ---------------------------------------------------------------------------

class RouteIndexOut(BaseModel):
    route_id: str
    window_category: str
    advance_days: int
    date: date
    price_relative: Optional[float] = None
    n_observations: int = 0


class RouteHistoryResponse(BaseModel):
    """Response for GET /routes/{route_id}/history."""
    route_id: str
    window_category: Optional[str] = None
    from_date: Optional[date] = None
    to_date: Optional[date] = None
    total_records: int = 0
    data: list[RouteIndexOut] = []


# ---------------------------------------------------------------------------
# Coverage / Confidence
# ---------------------------------------------------------------------------

class CoverageResponse(BaseModel):
    date: date
    entries: list[CoverageEntry] = []


class CoverageEntry(BaseModel):
    window_category: str
    coverage_score: Optional[float] = None
    confidence_score: Optional[float] = None
    status: Optional[str] = None


# Fix forward reference
CoverageResponse.model_rebuild()


# ---------------------------------------------------------------------------
# Policy Export
# ---------------------------------------------------------------------------

class PolicyApixRow(BaseModel):
    """A single row in the policy export time series."""
    date: date
    window_category: str
    domestic_apix: Optional[float] = None
    international_apix: Optional[float] = None
    overall_apix: Optional[float] = None
    status: Optional[str] = None
    coverage_score: Optional[float] = None
    confidence_score: Optional[float] = None


class PolicyRouteRow(BaseModel):
    """A single row in the policy route-level export."""
    route_id: str
    window_category: str
    advance_days: int
    date: date
    price_relative: Optional[float] = None
    n_observations: int = 0
