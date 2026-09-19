"""
api/main.py
FlyWise (APIx) — FastAPI application entry point.

Includes all routers and enables automatic OpenAPI documentation
at /docs (Swagger UI) and /redoc (ReDoc).

Run with:
    uvicorn api.main:app --reload --port 8000
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.db import init_pool, close_pool
from api.routers import apix, routes, coverage, policy_export


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize resources on startup and clean up on shutdown."""
    init_pool()
    yield
    close_pool()


app = FastAPI(
    title="FlyWise APIx",
    description=(
        "Real-time Airfare Price Index API for India.\n\n"
        "SIH 2026 · PS26056 · MoSPI/DIID\n\n"
        "Provides daily, weekly, and monthly airfare price indices "
        "(DAPIx, IAPIx, Overall APIx) computed via Jevons geometric mean "
        "with Young-type route weighting.\n\n"
        "### Endpoint groups\n"
        "- **APIx** — National-level index (daily / weekly / monthly)\n"
        "- **Routes** — Per-route price-relative history\n"
        "- **Coverage** — Data quality and coverage scores\n"
        "- **Policy Export** — NSO/RBI-facing CSV/JSON exports (API-key required)"
    ),
    version="1.0.0",
    docs_url="/docs",    # Swagger UI (default)
    redoc_url="/redoc",  # ReDoc (default)
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# CORS — allow dashboard front-end origins
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(apix.router)
app.include_router(routes.router)
app.include_router(coverage.router)
app.include_router(policy_export.router)


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
@app.get("/health", tags=["System"])
def health_check():
    """Simple liveness probe."""
    return {"status": "ok", "service": "flywise-apix"}


@app.get("/", tags=["System"])
def root():
    """API root — redirect to docs."""
    return {
        "message": "FlyWise APIx — Real-time Airfare Price Index for India",
        "docs": "/docs",
        "redoc": "/redoc",
        "version": "1.0.0",
    }
