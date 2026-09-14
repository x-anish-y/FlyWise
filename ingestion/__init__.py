"""
ingestion package
FlyWise (APIx) — Ingestion Pipeline.
"""

from .pipeline import run_ingestion_pipeline
from .ingest_raw_json import ingest_raw_json
from .normalize_airports import normalize_airports
from .normalize_fare_family import normalize_fare_family
from .dedup_observations import dedup_observations

__all__ = [
    "run_ingestion_pipeline",
    "ingest_raw_json",
    "normalize_airports",
    "normalize_fare_family",
    "dedup_observations",
]
