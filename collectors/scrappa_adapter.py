"""
collectors/scrappa_adapter.py
FlyWise (APIx) — Scrappa Google Flights collector (secondary source).

Calls Scrappa's structured Google Flights JSON API.  Unlike the Bright Data
adapter (which fetches raw HTML and parses it), Scrappa returns pre-parsed
JSON — so this module is simpler: build query params, call the API, map the
structured response to our observation schema.

Same function signature, output format, file-writing convention, and error-
handling behaviour as bright_data_adapter.py.
"""

from __future__ import annotations

import json
import logging
import os
import sys
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, Optional

import requests
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

load_dotenv(dotenv_path=Path(__file__).resolve().parent.parent / "config" / ".env")

SCRAPPA_API_KEY: str = os.getenv("SCRAPPA_API_KEY", "")

SCRAPPA_ENDPOINT = "https://scrappa.co/api/flights/one-way"

INTERNATIONAL_ROUTES: set[str] = {"DEL-DXB", "BOM-DXB", "DEL-SIN", "BOM-SIN"}

# Currency mapping by route for international routes
ROUTE_CURRENCY: dict[str, str] = {
    "DEL-DXB": "AED",
    "BOM-DXB": "AED",
    "DEL-SIN": "SGD",
    "BOM-SIN": "SGD",
}

RAW_OUTPUT_DIR = Path(__file__).resolve().parent / "raw_output"
ERRORS_LOG = Path(__file__).resolve().parent / "errors.log"

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logger = logging.getLogger("scrappa_adapter")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
)

# Also log errors to file
_file_handler = logging.FileHandler(ERRORS_LOG, mode="a", encoding="utf-8")
_file_handler.setLevel(logging.ERROR)
_file_handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
logger.addHandler(_file_handler)


# ---------------------------------------------------------------------------
# 1. Scrappa API call
# ---------------------------------------------------------------------------

def fetch_flights_json(
    origin: str,
    destination: str,
    travel_date: str,
    currency: str = "INR",
) -> dict[str, Any]:
    """Call Scrappa's One-Way Flight Search API and return the JSON response.

    Args:
        origin: 3-letter IATA airport code (e.g. "DEL").
        destination: 3-letter IATA airport code (e.g. "BOM").
        travel_date: ISO date string "YYYY-MM-DD".
        currency: Currency code for the search results.

    Returns:
        Parsed JSON dict with "flights" and "search_metadata" keys.

    Raises:
        requests.RequestException: On HTTP/network errors.
        ValueError: If the response is empty or malformed.
    """
    if not SCRAPPA_API_KEY:
        raise ValueError(
            "SCRAPPA_API_KEY is not set. "
            "Set it in config/.env or as an environment variable."
        )

    params: dict[str, str | int] = {
        "origin": origin,
        "destination": destination,
        "departure_date": travel_date,
        "adults": 1,
        "cabin_class": "economy",
        "max_stops": "nonstop",
        "currency": currency,
        "gl": "in",
        "hl": "en",
    }

    headers = {
        "X-API-KEY": SCRAPPA_API_KEY,
        "Accept": "application/json",
    }

    logger.info(
        "Sending request to Scrappa Flights API: %s -> %s on %s (%s)",
        origin, destination, travel_date, currency,
    )

    response = requests.get(
        SCRAPPA_ENDPOINT,
        params=params,
        headers=headers,
        timeout=90,
    )
    response.raise_for_status()

    data = response.json()
    if not isinstance(data, dict):
        raise ValueError(
            f"Scrappa returned unexpected response type: {type(data).__name__}"
        )

    flights = data.get("flights", [])
    logger.info(
        "Scrappa returned %d flight(s) for %s-%s on %s",
        len(flights), origin, destination, travel_date,
    )

    return data


# ---------------------------------------------------------------------------
# 2. JSON response -> observation dicts
# ---------------------------------------------------------------------------

def parse_flights_from_json(
    data: dict[str, Any],
    route_id: str,
    original_currency: str,
) -> list[dict[str, Any]]:
    """Map Scrappa's structured flight JSON to our flat observation dicts.

    Args:
        data: Parsed JSON from Scrappa API.
        route_id: e.g. "DEL-BOM".
        original_currency: e.g. "INR", "AED", "SGD".

    Returns:
        List of dicts matching the observation schema.
        Only direct/nonstop flights are included.
    """
    results: list[dict[str, Any]] = []
    flights = data.get("flights", [])

    for flight in flights:
        try:
            parsed = _parse_single_flight(flight, route_id, original_currency)
            if parsed is not None:
                results.append(parsed)
        except Exception as e:
            logger.debug("Skipping unparseable flight for %s: %s", route_id, e)
            continue

    logger.info(
        "Parsed %d direct flight(s) for %s from Scrappa JSON",
        len(results), route_id,
    )
    return results


def _parse_single_flight(
    flight: dict[str, Any],
    route_id: str,
    original_currency: str,
) -> Optional[dict[str, Any]]:
    """Parse a single Scrappa flight object into an observation dict.

    Returns None if the flight has stops (not direct/nonstop).
    """
    # Check stops — Scrappa uses "stops" or "outbound_stops"
    stops = flight.get("stops")
    if stops is None:
        stops = flight.get("outbound_stops", 0)
    if stops is None:
        stops = 0

    if stops > 0:
        logger.debug(
            "Discarding connecting flight for %s (%d stops)", route_id, stops
        )
        return None

    # Extract price
    total_fare = flight.get("price")
    flight_currency = flight.get("currency", original_currency)

    # Extract leg details (first leg for one-way)
    legs = flight.get("legs") or flight.get("outbound_legs") or []
    if not legs:
        return None

    first_leg = legs[0]
    airline_code = first_leg.get("airline", "")
    flight_number = first_leg.get("flight_number", "")

    # Extract operating carrier if available, fall back to marketing carrier
    operating_carrier = first_leg.get("operating_carrier") or airline_code

    # Extract departure time
    departure_time_raw = first_leg.get("departure_time", "")
    departure_time = ""
    if departure_time_raw:
        # Scrappa returns ISO format like "2026-10-04T10:30:00"
        try:
            if "T" in str(departure_time_raw):
                time_part = str(departure_time_raw).split("T")[1]
                departure_time = time_part[:5]  # "HH:MM"
            else:
                departure_time = str(departure_time_raw)[:5]
        except (IndexError, ValueError):
            departure_time = str(departure_time_raw)

    # Determine availability
    availability_status = "available" if total_fare and total_fare > 0 else "price_unavailable"

    return {
        "airline": str(airline_code)[:10] if airline_code else None,
        "flight_number": str(flight_number)[:10] if flight_number else None,
        "operating_carrier": str(operating_carrier)[:10] if operating_carrier else None,
        "cabin": "economy",
        "fare_family_raw": None,
        "base_fare": None,  # Scrappa doesn't break down fare components
        "taxes": None,
        "mandatory_fees": None,
        "total_fare_original_currency": float(total_fare) if total_fare else None,
        "original_currency": flight_currency or original_currency,
        "availability_status": availability_status,
        "stops": int(stops),
        "departure_time": departure_time,
        "airline_name": first_leg.get("airline_name", ""),
        "source": "scrappa",
        "collection_method": "flights_api",
    }


# ---------------------------------------------------------------------------
# 3. Main fetch function
# ---------------------------------------------------------------------------

def fetch_fares(
    origin: str,
    destination: str,
    travel_date: str,
    advance_days: int,
) -> dict[str, Any]:
    """Fetch fares from Scrappa's Google Flights API for a single route+date.

    This is the main entry point used by the scheduler/cron.

    Args:
        origin: 3-letter IATA code (e.g. "DEL").
        destination: 3-letter IATA code (e.g. "BOM").
        travel_date: ISO date string "YYYY-MM-DD".
        advance_days: Lead-time window (e.g. 1, 7, 15, 21, 30, 45, 60).

    Returns:
        Dict with keys: route_id, travel_date, advance_days, observations,
        collection_timestamp, source, run_id, errors.
    """
    route_id = f"{origin}-{destination}"
    timestamp = datetime.now(UTC)
    run_id = f"sc_{route_id}_{timestamp.strftime('%Y%m%d_%H%M%S')}"
    original_currency = ROUTE_CURRENCY.get(route_id, "INR")

    result: dict[str, Any] = {
        "route_id": route_id,
        "travel_date": travel_date,
        "advance_days": advance_days,
        "collection_timestamp": timestamp.isoformat(),
        "source": "scrappa",
        "run_id": run_id,
        "observations": [],
        "errors": [],
    }

    try:
        # Step 1: Call Scrappa API (returns structured JSON)
        data = fetch_flights_json(
            origin=origin,
            destination=destination,
            travel_date=travel_date,
            currency=original_currency,
        )
        logger.info("[%s] Received Scrappa response for %s T+%d", run_id, route_id, advance_days)

        # Step 2: Map the JSON to our observation schema
        observations = parse_flights_from_json(data, route_id, original_currency)

        # Enrich each observation with collection metadata
        for obs in observations:
            obs.update({
                "observation_id": str(uuid.uuid4()),
                "route_id": route_id,
                "service_type": "one-way",
                "collection_timestamp": timestamp.isoformat(),
                "travel_date": travel_date,
                "advance_days": advance_days,
                "run_id": run_id,
                "is_imputed": False,
                "imputation_method": None,
                "methodology_version": "v1.0",
            })

        result["observations"] = observations

    except requests.Timeout as e:
        error_msg = f"Scrappa timeout for {route_id} T+{advance_days}: {e}"
        logger.error(error_msg)
        result["errors"].append(error_msg)

    except requests.RequestException as e:
        error_msg = f"Scrappa HTTP error for {route_id} T+{advance_days}: {e}"
        logger.error(error_msg)
        result["errors"].append(error_msg)

    except ValueError as e:
        error_msg = f"Parse error for {route_id} T+{advance_days}: {e}"
        logger.error(error_msg)
        result["errors"].append(error_msg)

    except Exception as e:
        error_msg = f"Unexpected error for {route_id} T+{advance_days}: {type(e).__name__}: {e}"
        logger.error(error_msg)
        result["errors"].append(error_msg)

    return result


# ---------------------------------------------------------------------------
# 4. Write raw output to JSON
# ---------------------------------------------------------------------------

def save_raw_output(result: dict[str, Any]) -> Optional[Path]:
    """Write a fetch result to the raw_output directory as JSON.

    File path: collectors/raw_output/{domestic|international}/{route_id}_{advance_days}_{timestamp}.json

    Returns:
        Path to the written file, or None on error.
    """
    route_id: str = result.get("route_id", "UNKNOWN")
    advance_days: int = result.get("advance_days", 0)
    timestamp_str = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")

    is_international = route_id in INTERNATIONAL_ROUTES
    subfolder = "international" if is_international else "domestic"

    output_dir = RAW_OUTPUT_DIR / subfolder
    output_dir.mkdir(parents=True, exist_ok=True)

    filename = f"{route_id}_{advance_days}_{timestamp_str}.json"
    filepath = output_dir / filename

    try:
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, ensure_ascii=False, default=str)
        logger.info("Saved raw output to %s", filepath)
        return filepath
    except OSError as e:
        logger.error("Failed to write raw output to %s: %s", filepath, e)
        return None


# ---------------------------------------------------------------------------
# 5. CLI test harness
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    """Run a single test fetch for DEL-BOM, T+21, and print the result."""

    travel_date = (datetime.now(UTC) + timedelta(days=21)).strftime("%Y-%m-%d")

    print(f"{'='*60}")
    print(f"FlyWise Scrappa Adapter -- Test Fetch")
    print(f"{'='*60}")
    print(f"Route:       DEL-BOM")
    print(f"Travel date: {travel_date} (T+21)")
    print(f"API Key:     {'***' + SCRAPPA_API_KEY[-6:] if len(SCRAPPA_API_KEY) > 6 else '(not set)'}")
    print(f"{'='*60}")
    print()

    # Fetch via Scrappa
    result = fetch_fares(
        origin="DEL",
        destination="BOM",
        travel_date=travel_date,
        advance_days=21,
    )

    # Save to raw_output
    saved_path = save_raw_output(result)

    # Print summary
    obs = result.get("observations", [])
    errors = result.get("errors", [])

    print(f"\n{'='*60}")
    print(f"Results: {len(obs)} observation(s), {len(errors)} error(s)")
    print(f"{'='*60}")

    if errors:
        print("\nErrors:")
        for err in errors:
            print(f"  [X] {err}")

    if obs:
        print("\nObservations:")
        for i, o in enumerate(obs, 1):
            print(f"\n  --- Flight {i} ---")
            print(f"  Airline:         {o.get('airline')} ({o.get('airline_name', '')})")
            print(f"  Flight #:        {o.get('flight_number')}")
            print(f"  Operating:       {o.get('operating_carrier')}")
            print(f"  Fare:            {o.get('total_fare_original_currency')} {o.get('original_currency')}")
            print(f"  Stops:           {o.get('stops')}")
            print(f"  Departure:       {o.get('departure_time')}")
            print(f"  Status:          {o.get('availability_status')}")

    if saved_path:
        print(f"\nRaw output saved to: {saved_path}")

    # Pretty-print full JSON for inspection
    print(f"\n{'='*60}")
    print("Full JSON result:")
    print(json.dumps(result, indent=2, default=str))
