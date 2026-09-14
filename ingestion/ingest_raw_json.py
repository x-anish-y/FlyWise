"""
ingestion/ingest_raw_json.py
FlyWise (APIx) — Raw JSON Collector Ingestion & Archival.

Reads raw output files from collectors/raw_output/{domestic,international}/,
parses observations into normalized dictionary records matching the PostgreSQL
`observations` table schema, and archives each successfully processed file into
collectors/raw_output/processed/{domestic,international}/ for full auditability.
"""

from __future__ import annotations

import json
import logging
import os
import shutil
import sys
import uuid
from pathlib import Path
from typing import Any, Optional

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_RAW_OUTPUT_DIR = PROJECT_ROOT / "collectors" / "raw_output"
DEFAULT_PROCESSED_DIR = PROJECT_ROOT / "collectors" / "raw_output" / "processed"

logger = logging.getLogger("ingest_raw_json")
if not logger.handlers:
    sh = logging.StreamHandler(sys.stdout)
    sh.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s"))
    logger.addHandler(sh)
    logger.setLevel(logging.INFO)


def parse_raw_file(
    file_path: Path,
    archived_reference_path: str,
) -> list[dict[str, Any]]:
    """Parse a single raw JSON file into normalized observation dicts.

    Args:
        file_path: Path to the raw JSON file.
        archived_reference_path: Destination path string after archiving.

    Returns:
        List of observation dictionaries.
    """
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    # Top-level envelope attributes
    route_id = data.get("route_id", "")
    travel_date = data.get("travel_date")
    advance_days = data.get("advance_days", 0)
    collection_ts = data.get("collection_timestamp")
    source = data.get("source", "")
    run_id = data.get("run_id", "")
    raw_obs_list = data.get("observations", [])

    parsed_observations: list[dict[str, Any]] = []

    for raw_obs in raw_obs_list:
        adv = raw_obs.get("advance_days", advance_days)
        window_cat = raw_obs.get("window_category") or f"T+{adv}"
        curr = raw_obs.get("original_currency", "INR")
        fare_orig = raw_obs.get("total_fare_original_currency")

        # Basic INR default if already in INR
        fare_inr = raw_obs.get("total_fare_inr")
        fx_rate = raw_obs.get("fx_rate_used")
        if curr == "INR" and fare_orig is not None:
            fare_inr = fare_orig
            fx_rate = 1.0

        obs_dict: dict[str, Any] = {
            "observation_id": raw_obs.get("observation_id") or str(uuid.uuid4()),
            "route_id": raw_obs.get("route_id") or route_id,
            "service_type": raw_obs.get("service_type") or "one-way",
            "collection_timestamp": raw_obs.get("collection_timestamp") or collection_ts,
            "travel_date": raw_obs.get("travel_date") or travel_date,
            "advance_days": adv,
            "window_category": window_cat,
            "airline": raw_obs.get("airline"),
            "flight_number": raw_obs.get("flight_number"),
            "operating_carrier": raw_obs.get("operating_carrier") or raw_obs.get("airline"),
            "cabin": raw_obs.get("cabin") or "economy",
            "fare_family_raw": raw_obs.get("fare_family_raw"),
            "fare_family_tier": raw_obs.get("fare_family_tier"),
            "baggage_bucket": raw_obs.get("baggage_bucket"),
            "service_spec_id": raw_obs.get("service_spec_id"),
            "base_fare": raw_obs.get("base_fare"),
            "taxes": raw_obs.get("taxes"),
            "mandatory_fees": raw_obs.get("mandatory_fees"),
            "total_fare_original_currency": fare_orig,
            "original_currency": curr,
            "fx_rate_used": fx_rate,
            "fx_rate_date": raw_obs.get("fx_rate_date"),
            "total_fare_inr": fare_inr,
            "availability_status": raw_obs.get("availability_status") or "available",
            "is_imputed": raw_obs.get("is_imputed", False),
            "imputation_method": raw_obs.get("imputation_method"),
            "quality_score": raw_obs.get("quality_score"),
            "source": raw_obs.get("source") or source,
            "collection_method": raw_obs.get("collection_method"),
            "run_id": raw_obs.get("run_id") or run_id,
            "raw_reference": archived_reference_path,
            "methodology_version": raw_obs.get("methodology_version") or "v1.0",
        }
        parsed_observations.append(obs_dict)

    return parsed_observations


def ingest_raw_json(
    raw_output_dir: Optional[Path] = None,
    processed_dir: Optional[Path] = None,
) -> tuple[list[dict[str, Any]], list[Path]]:
    """Read all JSON files in raw_output/{domestic,international}, parse and archive them.

    Args:
        raw_output_dir: Base directory containing domestic/ and international/ subfolders.
        processed_dir: Base destination directory for archived processed files.

    Returns:
        tuple (all_parsed_observations, list_of_archived_file_paths)
    """
    raw_dir = raw_output_dir or DEFAULT_RAW_OUTPUT_DIR
    archive_base = processed_dir or DEFAULT_PROCESSED_DIR

    all_observations: list[dict[str, Any]] = []
    archived_files: list[Path] = []

    subfolders = ["domestic", "international"]

    for sub in subfolders:
        folder_path = raw_dir / sub
        if not folder_path.is_dir():
            continue

        target_archive_dir = archive_base / sub
        target_archive_dir.mkdir(parents=True, exist_ok=True)

        json_files = sorted(folder_path.glob("*.json"))
        logger.info("Found %d raw file(s) in %s", len(json_files), folder_path)

        for json_file in json_files:
            dest_file = target_archive_dir / json_file.name

            try:
                # 1. Parse file content, referencing destination path for audit trail
                observations = parse_raw_file(json_file, str(dest_file))
                all_observations.extend(observations)

                # 2. Archive file (move rather than delete)
                shutil.move(str(json_file), str(dest_file))
                archived_files.append(dest_file)
                logger.debug("Archived %s -> %s (%d obs)", json_file.name, dest_file, len(observations))

            except Exception as e:
                logger.error("Failed to parse and archive %s: %s", json_file, e)

    logger.info(
        "Ingested %d observation(s) from %d file(s) into memory.",
        len(all_observations), len(archived_files),
    )
    return all_observations, archived_files


if __name__ == "__main__":
    obs, files = ingest_raw_json()
    print(f"Total ingested: {len(obs)} observations from {len(files)} files.")
    if obs:
        print("Sample observation:")
        print(json.dumps(obs[0], indent=2, default=str))
