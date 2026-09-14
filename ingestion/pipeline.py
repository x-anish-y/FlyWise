"""
ingestion/pipeline.py
FlyWise (APIx) — Ingestion Pipeline Orchestrator.

Orchestrates the four-step ingestion pipeline in strict sequence:
1. ingest_raw_json — Reads raw JSON files from collectors/raw_output/{domestic,international}/,
   parses observations, and moves files to collectors/raw_output/processed/ for auditability.
2. normalize_airports — Standardizes airport IATA codes and route IDs via lookup table.
3. normalize_fare_family — Maps fare families to standard tiers/buckets and computes service_spec_id.
4. dedup_observations — Discards codeshare duplicate observations keyed by operating_carrier.
5. Database Insertion — Inserts the cleaned batch into the Neon PostgreSQL `observations` table
   using psycopg2, with raw_reference pointing to the archived JSON file for full evidence trail.
"""

from __future__ import annotations

import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parent.parent

# Load environment configuration
load_dotenv(dotenv_path=PROJECT_ROOT / "config" / ".env")

# Ensure ingestion directory is on sys.path
INGESTION_DIR = Path(__file__).resolve().parent
if str(INGESTION_DIR) not in sys.path:
    sys.path.insert(0, str(INGESTION_DIR))

from ingest_raw_json import ingest_raw_json
from normalize_airports import normalize_airports
from normalize_fare_family import normalize_fare_family
from dedup_observations import dedup_observations

logger = logging.getLogger("ingestion_pipeline")
if not logger.handlers:
    sh = logging.StreamHandler(sys.stdout)
    sh.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s"))
    logger.addHandler(sh)
    logger.setLevel(logging.INFO)


def parse_timestamp_for_pg(ts: Any) -> Optional[datetime]:
    """Ensure timestamp is a valid UTC naive datetime for Postgres timestamp column."""
    if not ts:
        return None
    if isinstance(ts, datetime):
        if ts.tzinfo is not None:
            return ts.astimezone(timezone.utc).replace(tzinfo=None)
        return ts

    ts_str = str(ts).replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(ts_str)
        if dt.tzinfo is not None:
            return dt.astimezone(timezone.utc).replace(tzinfo=None)
        return dt
    except ValueError:
        try:
            return datetime.strptime(ts_str[:19], "%Y-%m-%dT%H:%M:%S")
        except ValueError:
            return None


def insert_observations_into_postgres(
    observations: list[dict[str, Any]],
    database_url: Optional[str] = None,
) -> int:
    """Insert cleaned observation records into PostgreSQL observations table.

    Args:
        observations: List of validated observation dictionaries.
        database_url: Neon connection string (falls back to NEON_DATABASE_URL env).

    Returns:
        Number of observations inserted.
    """
    db_url = database_url or os.getenv("NEON_DATABASE_URL")
    if not db_url:
        raise ValueError("NEON_DATABASE_URL is not set. Cannot persist observations to PostgreSQL.")

    if not observations:
        logger.info("No observations to insert into database.")
        return 0

    insert_query = """
    INSERT INTO observations (
        observation_id, route_id, service_type, collection_timestamp, travel_date,
        advance_days, window_category, airline, flight_number, operating_carrier,
        cabin, fare_family_raw, fare_family_tier, baggage_bucket, service_spec_id,
        base_fare, taxes, mandatory_fees, total_fare_original_currency, original_currency,
        fx_rate_used, fx_rate_date, total_fare_inr, availability_status, is_imputed,
        imputation_method, quality_score, source, collection_method, run_id,
        raw_reference, methodology_version
    ) VALUES %s
    ON CONFLICT (observation_id) DO NOTHING;
    """

    rows_to_insert = []
    for obs in observations:
        coll_ts = parse_timestamp_for_pg(obs.get("collection_timestamp"))
        travel_dt = obs.get("travel_date")
        if isinstance(travel_dt, datetime):
            travel_dt = travel_dt.date()

        row = (
            obs.get("observation_id"),
            obs.get("route_id"),
            obs.get("service_type") or "one-way",
            coll_ts,
            travel_dt,
            int(obs.get("advance_days", 0)),
            obs.get("window_category") or f"T+{obs.get('advance_days', 0)}",
            obs.get("airline"),
            obs.get("flight_number"),
            obs.get("operating_carrier") or obs.get("airline"),
            obs.get("cabin") or "economy",
            obs.get("fare_family_raw"),
            obs.get("fare_family_tier") or "unmapped",
            obs.get("baggage_bucket") or "unmapped",
            obs.get("service_spec_id"),
            obs.get("base_fare"),
            obs.get("taxes"),
            obs.get("mandatory_fees"),
            obs.get("total_fare_original_currency"),
            obs.get("original_currency") or "INR",
            obs.get("fx_rate_used"),
            obs.get("fx_rate_date"),
            obs.get("total_fare_inr"),
            obs.get("availability_status") or "available",
            bool(obs.get("is_imputed", False)),
            obs.get("imputation_method"),
            obs.get("quality_score"),
            obs.get("source"),
            obs.get("collection_method"),
            obs.get("run_id"),
            obs.get("raw_reference"),
            obs.get("methodology_version") or "v1.0",
        )
        rows_to_insert.append(row)

    logger.info("Connecting to Neon PostgreSQL to insert %d rows...", len(rows_to_insert))

    conn = psycopg2.connect(db_url)
    try:
        with conn.cursor() as cur:
            execute_values(cur, insert_query, rows_to_insert, page_size=1000)
            inserted_count = cur.rowcount
        conn.commit()
        logger.info(
            "Successfully persisted %d row(s) into 'observations' table.",
            len(rows_to_insert),
        )
        return len(rows_to_insert)
    except Exception as e:
        conn.rollback()
        logger.error("Failed to insert observations into PostgreSQL: %s", e)
        raise
    finally:
        conn.close()


def run_ingestion_pipeline(
    raw_output_dir: Optional[Path] = None,
    processed_dir: Optional[Path] = None,
    database_url: Optional[str] = None,
) -> dict[str, Any]:
    """Execute the complete 4-step ingestion pipeline and insert into PostgreSQL.

    Workflow:
    1. Ingest raw JSON files & archive to processed/
    2. Normalize airport codes & route IDs
    3. Normalize fare families & construct service_spec_id
    4. Deduplicate codeshare flights by operating carrier
    5. Batch insert into Neon PostgreSQL observations table

    Returns:
        Pipeline execution metrics summary dictionary.
    """
    start_time = datetime.now(timezone.utc)
    logger.info("=" * 80)
    logger.info("FlyWise Ingestion Pipeline Starting: %s UTC", start_time.isoformat())
    logger.info("=" * 80)

    # Step 1: Ingest raw JSON files & archive
    logger.info("--- Step 1: Ingesting Raw JSON Files ---")
    raw_observations, archived_files = ingest_raw_json(raw_output_dir, processed_dir)

    if not raw_observations:
        logger.info("No raw JSON observations found to ingest. Pipeline complete.")
        return {
            "status": "NOOP",
            "files_processed": 0,
            "raw_observations": 0,
            "deduped_observations": 0,
            "dropped_duplicates": 0,
            "inserted_count": 0,
        }

    # Step 2: Normalize Airports
    logger.info("--- Step 2: Normalizing Airport Codes ---")
    airports_normalized = normalize_airports(raw_observations)

    # Step 3: Normalize Fare Families & Build service_spec_id
    logger.info("--- Step 3: Normalizing Fare Families & Computing service_spec_id ---")
    fare_families_normalized = normalize_fare_family(airports_normalized)

    # Step 4: Deduplicate Codeshare Observations
    logger.info("--- Step 4: Deduplicating Codeshare Observations ---")
    deduped_batch, dropped_duplicates = dedup_observations(fare_families_normalized)

    # Step 5: Database Insertion
    logger.info("--- Step 5: Inserting Cleaned Batch into Neon Postgres ---")
    inserted_count = insert_observations_into_postgres(deduped_batch, database_url)

    end_time = datetime.now(timezone.utc)
    duration_s = (end_time - start_time).total_seconds()

    summary = {
        "status": "SUCCESS",
        "files_processed": len(archived_files),
        "raw_observations": len(raw_observations),
        "deduped_observations": len(deduped_batch),
        "dropped_duplicates": dropped_duplicates,
        "inserted_count": inserted_count,
        "duration_seconds": duration_s,
    }

    logger.info("=" * 80)
    logger.info("FLYWISE INGESTION PIPELINE COMPLETE")
    logger.info("  Files Processed:      %d", summary["files_processed"])
    logger.info("  Raw Observations:     %d", summary["raw_observations"])
    logger.info("  Deduped Observations: %d", summary["deduped_observations"])
    logger.info("  Duplicates Dropped:   %d", summary["dropped_duplicates"])
    logger.info("  Inserted into DB:     %d", summary["inserted_count"])
    logger.info("  Total Duration:       %.2fs", duration_s)
    logger.info("=" * 80)

    return summary


if __name__ == "__main__":
    res = run_ingestion_pipeline()
    print("\nPipeline Result:")
    for k, v in res.items():
        print(f"  {k}: {v}")
