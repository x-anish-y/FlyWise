"""
api/db.py
FlyWise (APIx) — Resilient database connection pool and query helper.

Uses psycopg2.pool.ThreadedConnectionPool (minconn=1, maxconn=5) initialized
at application startup.

Features:
- FastAPI dependency `get_db` yielding a `DatabaseSession`
- Automatic retry-once-on-OperationalError around query execution:
  catches psycopg2.OperationalError (e.g. SSL connection closed by Neon),
  discards the stale connection, checks out a fresh connection from the pool,
  and retries the query once before raising an HTTP 503.
- Safe connection cleanup returning connections to the pool via FastAPI's yield.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any, Generator, Optional, Sequence

import psycopg2
from psycopg2.pool import ThreadedConnectionPool
from dotenv import load_dotenv
from fastapi import HTTPException, status

logger = logging.getLogger("api.db")

# Load .env from project root config/
PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(dotenv_path=PROJECT_ROOT / "config" / ".env")

_pool: Optional[ThreadedConnectionPool] = None


def init_pool(minconn: int = 1, maxconn: int = 5) -> ThreadedConnectionPool:
    """Initialize the ThreadedConnectionPool once at application startup."""
    global _pool
    if _pool is not None and not _pool.closed:
        return _pool

    db_url = os.getenv("NEON_DATABASE_URL")
    if not db_url:
        raise ValueError("NEON_DATABASE_URL is not set in environment.")

    logger.info("Initializing database connection pool (min=%d, max=%d)...", minconn, maxconn)
    _pool = ThreadedConnectionPool(minconn=minconn, maxconn=maxconn, dsn=db_url)
    return _pool


def close_pool() -> None:
    """Close all pooled database connections on application shutdown."""
    global _pool
    if _pool is not None and not _pool.closed:
        logger.info("Closing all pooled database connections...")
        _pool.closeall()
        _pool = None


def get_pool() -> ThreadedConnectionPool:
    """Return the active connection pool, initializing lazily if necessary."""
    global _pool
    if _pool is None or _pool.closed:
        _pool = init_pool(minconn=1, maxconn=5)
    return _pool


class DatabaseSession:
    """Wrapper around a checked-out pooled connection with retry-on-stale-connection.

    Catches psycopg2.OperationalError (e.g. Neon SSL closed unexpectedly),
    discards and replaces the stale connection, and retries the query once
    before raising an HTTP 503 error.
    """

    def __init__(self, pool: ThreadedConnectionPool):
        self.pool = pool
        self.conn: Any = None
        self.is_broken: bool = False
        self._acquire_connection()

    def _acquire_connection(self) -> None:
        """Check out a connection from the pool and configure autocommit."""
        self.conn = self.pool.getconn()
        try:
            self.conn.autocommit = True
        except Exception:
            pass

    def _discard_connection(self) -> None:
        """Discard a broken connection so it is not returned to the pool."""
        if self.conn is not None:
            try:
                self.pool.putconn(self.conn, close=True)
            except Exception:
                pass
            self.conn = None

    def execute(
        self,
        query: str,
        params: Optional[Sequence[Any] | dict[str, Any]] = None,
        fetch: str = "all",
    ) -> Any:
        """Execute a query with retry-once-on-OperationalError.

        Supported fetch modes:
          - 'one': cur.fetchone() as tuple, or None
          - 'all': cur.fetchall() as list of tuples
          - 'dict': single row as dict mapping column names to values, or None
          - 'dicts': list of dicts mapping column names to values
          - 'none': execute without fetching results (e.g. INSERT/UPDATE/DELETE)

        If psycopg2.OperationalError or InterfaceError occurs, the connection is
        discarded as stale, a fresh connection is checked out, and the query
        is retried exactly once. If it fails again, raises HTTPException 503.
        """
        for attempt in range(2):
            try:
                with self.conn.cursor() as cur:
                    if params is not None:
                        cur.execute(query, params)
                    else:
                        cur.execute(query)

                    if fetch == "one":
                        return cur.fetchone()
                    elif fetch == "all":
                        return cur.fetchall()
                    elif fetch == "dict":
                        row = cur.fetchone()
                        if row is None:
                            return None
                        cols = [d[0] for d in cur.description] if cur.description else []
                        return dict(zip(cols, row))
                    elif fetch == "dicts":
                        rows = cur.fetchall()
                        cols = [d[0] for d in cur.description] if cur.description else []
                        return [dict(zip(cols, r)) for r in rows]
                    elif fetch == "none":
                        return None
                    else:
                        raise ValueError(f"Unsupported fetch mode: '{fetch}'")

            except (psycopg2.OperationalError, psycopg2.InterfaceError) as e:
                logger.warning(
                    "Database connection error (%s): %s on attempt %d/2. Discarding connection...",
                    type(e).__name__,
                    e,
                    attempt + 1,
                )
                self._discard_connection()

                if attempt == 0:
                    # Retry once with a fresh connection from the pool
                    self._acquire_connection()
                    continue
                else:
                    self.is_broken = True
                    raise HTTPException(
                        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                        detail="Database service temporarily unavailable. Please retry shortly.",
                    ) from e

            except Exception:
                if self.conn and not self.conn.closed:
                    try:
                        self.conn.rollback()
                    except Exception:
                        pass
                raise

    def close(self) -> None:
        """Return the connection to the pool (or discard if broken)."""
        if self.conn is not None:
            if not self.conn.closed and not self.is_broken:
                try:
                    self.pool.putconn(self.conn)
                except Exception:
                    pass
            else:
                self._discard_connection()
            self.conn = None


def get_db() -> Generator[DatabaseSession, None, None]:
    """FastAPI dependency: checks out a DatabaseSession and returns it on completion."""
    pool = get_pool()
    session = DatabaseSession(pool)
    try:
        yield session
    finally:
        session.close()


# Backward-compatible alias
get_db_connection = get_db


def execute_query(
    db_or_session: DatabaseSession,
    query: str,
    params: Optional[Sequence[Any] | dict[str, Any]] = None,
    fetch: str = "all",
) -> Any:
    """Standalone helper function for query execution with retry."""
    return db_or_session.execute(query, params, fetch=fetch)
