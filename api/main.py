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

from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_swagger_ui_html, get_redoc_html

from api.db import init_pool, close_pool
from api.routers import apix, routes, coverage, policy_export

FLYWISE_LOGO_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
  <defs>
    <linearGradient id="flywiseSky" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0284c7"/>
      <stop offset="50%" stop-color="#0ea5e9"/>
      <stop offset="100%" stop-color="#38bdf8"/>
    </linearGradient>
    <linearGradient id="flywiseGold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f0b429"/>
      <stop offset="100%" stop-color="#ffd481"/>
    </linearGradient>
    <filter id="softShadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="#000000" flood-opacity="0.25"/>
    </filter>
  </defs>
  <rect width="512" height="512" rx="116" fill="url(#flywiseSky)"/>
  <rect x="12" y="12" width="488" height="488" rx="104" fill="none" stroke="#ffffff" stroke-opacity="0.3" stroke-width="6"/>
  <circle cx="256" cy="272" r="185" fill="none" stroke="#ffffff" stroke-opacity="0.16" stroke-width="5" stroke-dasharray="12 16"/>
  <circle cx="256" cy="272" r="125" fill="none" stroke="#ffffff" stroke-opacity="0.24" stroke-width="4" stroke-dasharray="8 12"/>
  <circle cx="396" cy="116" r="20" fill="url(#flywiseGold)" filter="url(#softShadow)"/>
  <circle cx="396" cy="116" r="28" fill="none" stroke="#ffd481" stroke-opacity="0.5" stroke-width="4"/>
  <g transform="translate(256, 276) rotate(-45) scale(14.5) translate(-12, -12)" filter="url(#softShadow)">
    <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" fill="#ffffff"/>
  </g>
</svg>"""


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
    docs_url=None,    # Handled by custom /docs route with FlyWise favicon
    redoc_url=None,   # Handled by custom /redoc route with FlyWise favicon
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
# Favicon & Custom Documentation
# ---------------------------------------------------------------------------
@app.get("/favicon.ico", include_in_schema=False)
@app.get("/favicon.svg", include_in_schema=False)
def favicon():
    """Return the FlyWise vector logo favicon."""
    return Response(content=FLYWISE_LOGO_SVG, media_type="image/svg+xml")


@app.get("/docs", include_in_schema=False)
async def custom_swagger_ui_html():
    """Custom Swagger UI with FlyWise favicon and branded navigation bar."""
    response = get_swagger_ui_html(
        openapi_url=app.openapi_url or "/openapi.json",
        title=f"{app.title} — API Documentation",
        oauth2_redirect_url=app.swagger_ui_oauth2_redirect_url,
        swagger_js_url="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js",
        swagger_css_url="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css",
        swagger_favicon_url="/favicon.svg",
    )
    custom_head = """
    <style>
      .swagger-ui .topbar { background-color: #0b1329 !important; border-bottom: 1px solid #1e293b; padding: 10px 0; }
      .swagger-ui .topbar a { display: flex; align-items: center; gap: 10px; }
      .swagger-ui .topbar img { content: url('/favicon.svg'); width: 36px; height: 36px; border-radius: 8px; }
      .swagger-ui .topbar .download-url-wrapper { display: none; }
      .swagger-ui .info .title { color: #0284c7; }
    </style>
    </head>
    """
    body = response.body.decode("utf-8").replace("</head>", custom_head)
    return Response(content=body, media_type="text/html")


@app.get("/redoc", include_in_schema=False)
async def redoc_html():
    """Custom ReDoc documentation with FlyWise favicon."""
    return get_redoc_html(
        openapi_url=app.openapi_url or "/openapi.json",
        title=f"{app.title} — ReDoc",
        redoc_js_url="https://cdn.jsdelivr.net/npm/redoc@next/bundles/redoc.standalone.js",
        redoc_favicon_url="/favicon.svg",
    )


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

