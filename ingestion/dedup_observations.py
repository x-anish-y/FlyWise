"""
ingestion/dedup_observations.py
FlyWise (APIx) — Codeshare & In-Batch Observation Deduplication.

Drops duplicate observations from the current batch, keyed on:
(route_id, travel_date, operating_carrier, collection_timestamp rounded to the nearest hour)

This specifically catches codeshare duplicates (same physical flight marketed
under different airline flight numbers) by keying on operating_carrier rather
than flight_number.
"""

from __future__ import annotations

import logging
import sys
from datetime import datetime, timedelta
from typing import Any

logger = logging.getLogger("dedup_observations")
if not logger.handlers:
    sh = logging.StreamHandler(sys.stdout)
    sh.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s"))
    logger.addHandler(sh)
    logger.setLevel(logging.INFO)


def round_timestamp_to_nearest_hour(ts_val: Any) -> str:
    """Round an ISO timestamp or datetime to the nearest hour string (YYYY-MM-DD HH:00).

    Args:
        ts_val: ISO formatted string or datetime instance.

    Returns:
        String formatted as 'YYYY-MM-DD HH:00'.
    """
    if not ts_val:
        return "1970-01-01 00:00"

    if isinstance(ts_val, str):
        clean_str = ts_val.replace("Z", "+00:00")
        try:
            dt = datetime.fromisoformat(clean_str)
        except ValueError:
            try:
                dt = datetime.strptime(clean_str[:19], "%Y-%m-%dT%H:%M:%S")
            except ValueError:
                return clean_str[:13] + ":00"
    elif isinstance(ts_val, datetime):
        dt = ts_val
    else:
        return str(ts_val)[:13] + ":00"

    # Round to nearest hour: if minute >= 30, add 1 hour
    if dt.minute >= 30:
        dt = dt + timedelta(hours=1)

    rounded = dt.replace(minute=0, second=0, microsecond=0)
    return rounded.strftime("%Y-%m-%d %H:00")


def dedup_observations(
    observations: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], int]:
    """Deduplicate observations in the current batch by operating carrier.

    Key: (route_id, travel_date, operating_carrier, collection_timestamp rounded to hour)

    When duplicates match this key, retains the record with the lower fare
    (or the first observed record) and discards the codeshare duplicate.

    Args:
        observations: Raw or normalized observation dicts.

    Returns:
        tuple (deduped_observations_list, number_of_dropped_duplicates)
    """
    initial_count = len(observations)
    seen: dict[tuple[str, str, str, str], dict[str, Any]] = {}
    dropped_count = 0

    for obs in observations:
        route_id = str(obs.get("route_id") or "").strip().upper()
        travel_date = str(obs.get("travel_date") or "").strip()
        operating_carrier = str(
            obs.get("operating_carrier") or obs.get("airline") or "UNKNOWN"
        ).strip().upper()
        collection_ts = obs.get("collection_timestamp")
        rounded_hour = round_timestamp_to_nearest_hour(collection_ts)

        key = (route_id, travel_date, operating_carrier, rounded_hour)

        if key in seen:
            dropped_count += 1
            existing = seen[key]
            existing_fare = existing.get("total_fare_original_currency")
            new_fare = obs.get("total_fare_original_currency")

            # Retain the observation with the lower fare if both are valid
            if (
                new_fare is not None
                and (existing_fare is None or float(new_fare) < float(existing_fare))
            ):
                seen[key] = obs
        else:
            seen[key] = obs

    deduped = list(seen.values())
    logger.info(
        "Deduplication complete: %d input observation(s) -> %d deduped (%d duplicate(s) dropped).",
        initial_count, len(deduped), dropped_count,
    )
    return deduped, dropped_count


if __name__ == "__main__":
    test_batch = [
        {
            "route_id": "DEL-BOM",
            "travel_date": "2026-10-05",
            "airline": "AI",
            "operating_carrier": "IX",
            "flight_number": "AI-9999",  # Codeshare marketed by AI
            "collection_timestamp": "2026-09-14T11:15:00Z",
            "total_fare_original_currency": 6500.0,
        },
        {
            "route_id": "DEL-BOM",
            "travel_date": "2026-10-05",
            "airline": "IX",
            "operating_carrier": "IX",
            "flight_number": "IX-1234",  # Operating flight
            "collection_timestamp": "2026-09-14T11:20:00Z",
            "total_fare_original_currency": 6200.0,
        },
        {
            "route_id": "DEL-BOM",
            "travel_date": "2026-10-05",
            "airline": "6E",
            "operating_carrier": "6E",
            "flight_number": "6E-501",
            "collection_timestamp": "2026-09-14T11:20:00Z",
            "total_fare_original_currency": 5800.0,
        },
    ]

    deduped, dropped = dedup_observations(test_batch)
    print(f"Test dedup: {len(test_batch)} -> {len(deduped)}, dropped={dropped}")
    for d in deduped:
        print(f"  Carrier: {d['operating_carrier']} | Flight: {d['flight_number']} | Fare: {d['total_fare_original_currency']}")
