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
import time
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


def init_pool(
    minconn: Optional[int] = None,
    maxconn: Optional[int] = None,
) -> ThreadedConnectionPool:
    """Initialize the ThreadedConnectionPool once at application startup.

    Default pool configuration: minconn=2, maxconn=20.
    Comfortably covers concurrent dashboard loads (15-20 concurrent requests)
    while remaining well below Neon's connection limit (100 direct, 10,000 on pooler).
    """
    global _pool
    if _pool is not None and not _pool.closed:
        return _pool

    if minconn is None:
        minconn = int(os.getenv("DB_POOL_MINCONN", "2"))
    if maxconn is None:
        maxconn = int(os.getenv("DB_POOL_MAXCONN", "20"))

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
        _pool = init_pool()
    return _pool


class DatabaseSession:
    """Wrapper around a checked-out pooled connection with retry-on-stale-connection.

    Catches psycopg2.OperationalError (e.g. Neon SSL closed unexpectedly),
    discards and replaces the stale connection, and retries the query once
    before raising an HTTP 503 error.

    Guarantees that every checked-out connection is returned or closed on every exit path.
    """

    def __init__(self, pool: ThreadedConnectionPool):
        self.pool = pool
        self.conn: Any = None
        self.is_broken: bool = False
        try:
            self._acquire_connection()
        except Exception:
            self.close()
            raise

    def _acquire_connection(self, max_retries: int = 5, retry_delay: float = 0.05) -> None:
        """Check out a connection from the pool and configure autocommit.

        If the pool is momentarily saturated by a concurrent burst, briefly retries
        with backoff before failing, allowing short-lived in-flight queries to
        complete and return their connections to the pool.
        """
        for attempt in range(max_retries):
            try:
                self.conn = self.pool.getconn()
                try:
                    self.conn.autocommit = True
                except Exception:
                    pass
                return
            except psycopg2.pool.PoolError as pe:
                if attempt < max_retries - 1:
                    time.sleep(retry_delay * (attempt + 1))
                    continue
                logger.error(
                    "Database connection pool exhausted (%d max connections) after %d checkout attempts: %s",
                    getattr(self.pool, "maxconn", 20),
                    max_retries,
                    pe,
                )
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Database connection pool exhausted under concurrent load. Please retry shortly.",
                ) from pe

    def _discard_connection(self) -> None:
        """Discard a broken or stale connection, ensuring it is removed from the pool's tracking."""
        conn = self.conn
        self.conn = None
        if conn is not None:
            try:
                self.pool.putconn(conn, close=True)
            except Exception as exc:
                logger.warning("Error putting closed connection back to pool: %s", exc)

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
                if self.conn and not getattr(self.conn, "closed", True):
                    try:
                        self.conn.rollback()
                    except Exception:
                        pass
                raise

    def close(self) -> None:
        """Return the connection to the pool (or discard if broken).

        Guaranteed to release the connection slot from the pool's internal
        tracking (_used / _rused) under ALL conditions:
        1. If connection is healthy and not broken: try putconn(conn, close=False).
        2. If putconn fails (e.g. rollback failure on stale socket) or connection
           is broken/closed: fallback immediately to putconn(conn, close=True),
           which skips rollback and guarantees key removal from _used.
        3. Sets self.conn = None immediately to prevent double-return.
        """
        conn = self.conn
        self.conn = None
        if conn is None:
            return

        if not self.is_broken and not getattr(conn, "closed", True):
            try:
                self.pool.putconn(conn, close=False)
                return
            except Exception as exc:
                logger.warning(
                    "Error returning healthy connection to pool (%s: %s). Discarding with close=True...",
                    type(exc).__name__,
                    exc,
                )

        # Fallback / broken path: close=True guarantees removal from pool._used
        try:
            self.pool.putconn(conn, close=True)
        except Exception as exc:
            logger.error(
                "Failed to discard connection with close=True (%s: %s).",
                type(exc).__name__,
                exc,
            )

    def __enter__(self) -> DatabaseSession:
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        self.close()


def get_db() -> Generator[DatabaseSession, None, None]:
    """FastAPI dependency: checks out a DatabaseSession and guarantees return on completion."""
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
