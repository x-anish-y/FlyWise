"""
api/db.py
FlyWise (APIx) — Database connection helper for the FastAPI application.

Provides a connection pool via psycopg2 and a FastAPI dependency
that yields a connection per request.
"""

from __future__ import annotations

import os
from contextlib import contextmanager
from pathlib import Path
from typing import Generator

import psycopg2
from psycopg2.pool import ThreadedConnectionPool
from dotenv import load_dotenv

# Load .env from project root config/
PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(dotenv_path=PROJECT_ROOT / "config" / ".env")

_pool: ThreadedConnectionPool | None = None


def _get_pool() -> ThreadedConnectionPool:
    """Lazily initialize and return the connection pool."""
    global _pool
    if _pool is None or _pool.closed:
        db_url = os.getenv("NEON_DATABASE_URL")
        if not db_url:
            raise ValueError("NEON_DATABASE_URL is not set.")
        _pool = ThreadedConnectionPool(minconn=1, maxconn=10, dsn=db_url)
    return _pool


def get_db_connection() -> Generator:
    """FastAPI dependency: yield a psycopg2 connection, return it to pool after."""
    pool = _get_pool()
    conn = pool.getconn()
    try:
        yield conn
    finally:
        pool.putconn(conn)


@contextmanager
def get_connection():
    """Context manager for non-FastAPI usage."""
    pool = _get_pool()
    conn = pool.getconn()
    try:
        yield conn
    finally:
        pool.putconn(conn)
