"""
ingestion/normalize_airports.py
FlyWise (APIx) — Airport Code Normalization.

Standardizes airport IATA codes across all observations against the curated
airport lookup table (ingestion/lookup_tables/airport_codes.csv).
Ensures consistency across disparate data sources (Bright Data, Scrappa, OTAs).
"""

from __future__ import annotations

import csv
import logging
import sys
from pathlib import Path
from typing import Any, Optional

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_AIRPORT_CSV = PROJECT_ROOT / "ingestion" / "lookup_tables" / "airport_codes.csv"

logger = logging.getLogger("normalize_airports")
if not logger.handlers:
    sh = logging.StreamHandler(sys.stdout)
    sh.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s"))
    logger.addHandler(sh)
    logger.setLevel(logging.INFO)


def load_airport_lookup(csv_path: Optional[Path] = None) -> dict[str, str]:
    """Load airport code mapping from CSV.

    Maps: raw_code.upper() -> normalized_code.upper()
    """
    path = csv_path or DEFAULT_AIRPORT_CSV
    lookup: dict[str, str] = {}

    if not path.is_file():
        logger.warning("Airport lookup CSV not found at %s. Using identity fallback.", path)
        return lookup

    with open(path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            raw = (row.get("raw_code") or "").strip().upper()
            norm = (row.get("normalized_code") or "").strip().upper()
            if raw and norm:
                lookup[raw] = norm

    logger.info("Loaded %d airport mapping(s) from %s", len(lookup), path)
    return lookup


def normalize_airports(
    observations: list[dict[str, Any]],
    lookup_path: Optional[Path] = None,
) -> list[dict[str, Any]]:
    """Standardize airport codes and route_id in a batch of observations.

    Args:
        observations: List of observation dictionaries.
        lookup_path: Optional path to airport_codes.csv.

    Returns:
        List of observations with normalized route_id and airport fields.
    """
    lookup = load_airport_lookup(lookup_path)
    normalized_count = 0

    for obs in observations:
        route_id = obs.get("route_id", "")
        if "-" in route_id:
            parts = route_id.split("-")
            if len(parts) == 2:
                orig_raw = parts[0].strip().upper()
                dest_raw = parts[1].strip().upper()

                orig_norm = lookup.get(orig_raw, orig_raw)
                dest_norm = lookup.get(dest_raw, dest_raw)

                normalized_route = f"{orig_norm}-{dest_norm}"
                if normalized_route != route_id:
                    obs["route_id"] = normalized_route
                    normalized_count += 1
                else:
                    obs["route_id"] = normalized_route

    logger.info(
        "Airport normalization complete: %d observations processed (%d updated).",
        len(observations), normalized_count,
    )
    return observations


if __name__ == "__main__":
    test_obs = [
        {"route_id": "DEL-BOM", "airline": "AI"},
        {"route_id": "del-bom", "airline": "6E"},
        {"route_id": "SXR-DEL", "airline": "SG"},
    ]
    res = normalize_airports(test_obs)
    print("Normalized test observations:")
    for r in res:
        print(" ", r["route_id"], r["airline"])
