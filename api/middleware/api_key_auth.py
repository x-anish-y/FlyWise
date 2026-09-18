"""
api/middleware/api_key_auth.py
FlyWise (APIx) — API key authentication dependency.

Checks the X-API-Key header against a comma-separated allow-list stored in
the API_KEY_ALLOWED_LIST environment variable.

Applied ONLY to the policy_export router — general dashboard-facing endpoints
are unauthenticated.
"""

from __future__ import annotations

import os

from fastapi import Depends, HTTPException, Security, status
from fastapi.security import APIKeyHeader

_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


def _get_allowed_keys() -> set[str]:
    """Parse the comma-separated API_KEY_ALLOWED_LIST env var."""
    raw = os.getenv("API_KEY_ALLOWED_LIST", "")
    if not raw:
        return set()
    return {k.strip() for k in raw.split(",") if k.strip()}


async def require_api_key(
    api_key: str | None = Security(_api_key_header),
) -> str:
    """FastAPI dependency: reject requests without a valid X-API-Key.

    Returns the validated key on success; raises 401/403 on failure.
    """
    if api_key is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing X-API-Key header.",
        )

    allowed = _get_allowed_keys()
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="API key authentication is not configured on this server.",
        )

    if api_key not in allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid API key.",
        )

    return api_key
