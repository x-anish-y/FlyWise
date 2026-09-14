"""
ingestion/normalize_fare_family.py
FlyWise (APIx) — Fare Family Normalization & Service Specification Construction.

Maps raw fare family names to standard tiers (base, standard, flex) and baggage
buckets (0kg, 15kg, 20kg+) using ingestion/lookup_tables/airline_fare_family_map.csv.

Constructs service_spec_id exactly as:
route_id + "-" + cabin + "-" + service_type + "-T" + str(advance_days) + "-" + baggage_bucket + "-" + fare_family_tier
"""

from __future__ import annotations

import csv
import logging
import sys
from pathlib import Path
from typing import Any, Optional

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_FARE_MAP_CSV = PROJECT_ROOT / "ingestion" / "lookup_tables" / "airline_fare_family_map.csv"

logger = logging.getLogger("normalize_fare_family")
if not logger.handlers:
    sh = logging.StreamHandler(sys.stdout)
    sh.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s"))
    logger.addHandler(sh)
    logger.setLevel(logging.INFO)


def load_fare_family_map(
    csv_path: Optional[Path] = None,
) -> dict[tuple[str, str], tuple[str, str]]:
    """Load airline fare family mappings from CSV.

    Key: (airline.strip().lower(), fare_family_raw.strip().lower())
    Value: (fare_family_tier, baggage_bucket)
    """
    path = csv_path or DEFAULT_FARE_MAP_CSV
    lookup: dict[tuple[str, str], tuple[str, str]] = {}

    if not path.is_file():
        logger.warning("Fare family lookup CSV not found at %s. Will tag as unmapped.", path)
        return lookup

    with open(path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            airline = (row.get("airline") or "").strip().lower()
            ff_raw = (row.get("fare_family_raw") or "").strip().lower()
            tier = (row.get("fare_family_tier") or "unmapped").strip()
            baggage = (row.get("baggage_bucket") or "unmapped").strip()

            if airline and ff_raw:
                lookup[(airline, ff_raw)] = (tier, baggage)

    logger.info("Loaded %d fare family mapping(s) from %s", len(lookup), path)
    return lookup


def normalize_fare_family(
    observations: list[dict[str, Any]],
    lookup_path: Optional[Path] = None,
) -> list[dict[str, Any]]:
    """Map fare family and compute exact service_spec_id for all observations.

    Rules:
    - If fare_family_raw matches (airline, fare_family_raw) in lookup:
      sets fare_family_tier and baggage_bucket from lookup.
    - If not found or raw is None/empty:
      tags fare_family_tier="unmapped", baggage_bucket="unmapped".
    - Computes service_spec_id exactly as:
      route_id + "-" + cabin + "-" + service_type + "-T" + str(advance_days) + "-" + baggage_bucket + "-" + fare_family_tier

    Args:
        observations: List of observation dictionaries.
        lookup_path: Optional path to airline_fare_family_map.csv.

    Returns:
        List of observations with fare_family_tier, baggage_bucket, and service_spec_id populated.
    """
    lookup = load_fare_family_map(lookup_path)
    mapped_count = 0

    for obs in observations:
        airline_name = (obs.get("airline_name") or "").strip().lower()
        airline_code = (obs.get("airline") or "").strip().lower()
        ff_raw = (obs.get("fare_family_raw") or "").strip().lower()

        matched = False
        tier = "unmapped"
        baggage = "unmapped"

        if ff_raw:
            # Check by airline name or carrier code
            if (airline_name, ff_raw) in lookup:
                tier, baggage = lookup[(airline_name, ff_raw)]
                matched = True
            elif (airline_code, ff_raw) in lookup:
                tier, baggage = lookup[(airline_code, ff_raw)]
                matched = True

        if matched:
            mapped_count += 1

        obs["fare_family_tier"] = tier
        obs["baggage_bucket"] = baggage

        # Construct exact service_spec_id per requirement:
        # route_id + "-" + cabin + "-" + service_type + "-T" + str(advance_days) + "-" + baggage_bucket + "-" + fare_family_tier
        route_id = obs.get("route_id") or "UNKNOWN"
        cabin = obs.get("cabin") or "economy"
        service_type = obs.get("service_type") or "one-way"
        advance_days = obs.get("advance_days", 0)

        service_spec_id = (
            f"{route_id}-{cabin}-{service_type}-T{str(advance_days)}-{baggage}-{tier}"
        )
        obs["service_spec_id"] = service_spec_id

    logger.info(
        "Fare family normalization complete: %d observations processed (%d mapped, %d unmapped).",
        len(observations), mapped_count, len(observations) - mapped_count,
    )
    return observations


if __name__ == "__main__":
    test_obs = [
        {
            "route_id": "DEL-BOM",
            "airline": "6E",
            "airline_name": "IndiGo",
            "fare_family_raw": "Saver",
            "cabin": "economy",
            "service_type": "one-way",
            "advance_days": 21,
        },
        {
            "route_id": "DEL-BOM",
            "airline": "AI",
            "airline_name": "Air India",
            "fare_family_raw": None,
            "cabin": "economy",
            "service_type": "one-way",
            "advance_days": 21,
        },
    ]
    res = normalize_fare_family(test_obs)
    print("Fare family test results:")
    for r in res:
        print(f"  {r['airline']}: tier={r['fare_family_tier']}, bucket={r['baggage_bucket']}, spec={r['service_spec_id']}")
