"""
collectors/bright_data_adapter.py
FlyWise (APIx) — Bright Data Google Flights collector.

Builds the Google Flights search URL (protobuf tfs= param) using a
self-contained encoder (no external dependency), then sends that URL to
Bright Data's SERP API which handles the actual fetch + anti-bot proxy
layer. The returned raw HTML is parsed into structured observation dicts.

NOTE: Bright Data's `/request` endpoint returns "JSON output for this
endpoint is not supported" when format="json" for Google Flights URLs.
We ALWAYS use format="raw" and parse the HTML ourselves.
"""

from __future__ import annotations

import json
import logging
import os
import re
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

BRIGHT_DATA_API_TOKEN: str = os.getenv("BRIGHT_DATA_API_TOKEN", "")
BRIGHT_DATA_ACCOUNT_TOKEN: str = os.getenv("BRIGHT_DATA_ACCOUNT_TOKEN", "")
BRIGHT_DATA_ZONE: str = os.getenv("BRIGHT_DATA_ZONE", "flywise")

BRIGHT_DATA_ENDPOINT = "https://api.brightdata.com/request"

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

logger = logging.getLogger("bright_data_adapter")
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
# 0. Self-whitelisting — register this machine's IP on the Bright Data zone
# ---------------------------------------------------------------------------

def whitelist_current_ip() -> None:
    """Detect this machine's public IP and whitelist it on the Bright Data zone.

    Calls https://api.ipify.org to get the public IP, then POSTs it to
    Bright Data's Account Management API.  Non-fatal: logs a warning on
    failure and continues (the IP may already be whitelisted).
    """
    if not BRIGHT_DATA_ACCOUNT_TOKEN:
        logger.warning("Skipping IP whitelisting: BRIGHT_DATA_ACCOUNT_TOKEN is not set.")
        return

    # Step 1 — Detect public IP
    try:
        ip_response = requests.get("https://api.ipify.org", timeout=10)
        ip_response.raise_for_status()
        public_ip = ip_response.text.strip()
        logger.info("Detected public IP: %s", public_ip)
    except Exception as e:
        logger.warning("Could not detect public IP (ipify): %s — skipping whitelisting.", e)
        return

    # Step 2 — Register IP on the Bright Data zone
    try:
        wl_response = requests.post(
            "https://api.brightdata.com/zone/whitelist",
            headers={
                "Authorization": f"Bearer {BRIGHT_DATA_ACCOUNT_TOKEN}",
                "Content-Type": "application/json",
            },
            json={"zone": BRIGHT_DATA_ZONE, "ip": public_ip},
            timeout=15,
        )
        if wl_response.status_code == 200:
            logger.info(
                "Successfully whitelisted IP %s on zone '%s'.",
                public_ip, BRIGHT_DATA_ZONE,
            )
        else:
            logger.warning(
                "Whitelist request returned status %d for IP %s: %s",
                wl_response.status_code, public_ip, wl_response.text[:300],
            )
    except Exception as e:
        logger.warning(
            "Failed to whitelist IP %s on zone '%s': %s — proceeding anyway.",
            public_ip, BRIGHT_DATA_ZONE, e,
        )


# ---------------------------------------------------------------------------
# 1. URL Builder — self-contained protobuf tfs= encoder (no external deps)
# ---------------------------------------------------------------------------
# This replaces the former fast-flights dependency.  We only ever used its
# protobuf URL-builder; the library's own fetching was never called.
# The encoder below produces byte-identical tfs tokens (verified against
# fast-flights v0.2 output for DEL-BOM and DEL-DXB).
# ---------------------------------------------------------------------------


def _pb_varint(n: int) -> bytes:
    """Encode an unsigned integer as a protobuf varint."""
    out = bytearray()
    while n > 0x7F:
        out.append((n & 0x7F) | 0x80)
        n >>= 7
    out.append(n)
    return bytes(out)


def _pb_tag(field_number: int, wire_type: int) -> bytes:
    """Encode a protobuf field tag (field number + wire type)."""
    return _pb_varint((field_number << 3) | wire_type)


def _pb_string(field_number: int, value: str) -> bytes:
    """Encode a string field (wire type 2 — length-delimited)."""
    encoded = value.encode("utf-8")
    return _pb_tag(field_number, 2) + _pb_varint(len(encoded)) + encoded


def _pb_varint_field(field_number: int, value: int) -> bytes:
    """Encode a varint field (wire type 0)."""
    return _pb_tag(field_number, 0) + _pb_varint(value)


def _pb_message(field_number: int, msg_bytes: bytes) -> bytes:
    """Encode a sub-message field (wire type 2 — length-delimited)."""
    return _pb_tag(field_number, 2) + _pb_varint(len(msg_bytes)) + msg_bytes


def _pb_packed_varints(field_number: int, values: list[int]) -> bytes:
    """Encode a packed repeated varint field (proto3 default for scalars)."""
    packed = b"".join(_pb_varint(v) for v in values)
    return _pb_tag(field_number, 2) + _pb_varint(len(packed)) + packed


def _build_tfs_token(
    origin: str,
    destination: str,
    travel_date: str,
) -> str:
    """Build the base64-encoded protobuf tfs= token for Google Flights.

    Mirrors the exact protobuf schema used by Google Flights' URL format:
        Info {
            FlightData data = 3;          // repeated, 1 entry
            repeated Passenger passengers = 8;  // packed [ADULT=1]
            Seat seat = 9;                // ECONOMY = 1
            Trip trip = 19;               // ONE_WAY = 2
        }
        FlightData {
            string date = 2;
            int32 max_stops = 5;          // 0 = nonstop
            Airport from_airport = 13;
            Airport to_airport = 14;
        }
        Airport { string airport = 2; }
    """
    import base64

    from_airport = _pb_string(2, origin)
    to_airport = _pb_string(2, destination)

    flight_data = (
        _pb_string(2, travel_date)
        + _pb_varint_field(5, 0)            # max_stops = 0 (nonstop)
        + _pb_message(13, from_airport)
        + _pb_message(14, to_airport)
    )

    info = (
        _pb_message(3, flight_data)         # data[0]
        + _pb_packed_varints(8, [1])         # passengers = [ADULT]
        + _pb_varint_field(9, 1)             # seat = ECONOMY
        + _pb_varint_field(19, 2)            # trip = ONE_WAY
    )

    return base64.b64encode(info).decode("utf-8")


def build_google_flights_url(
    origin: str,
    destination: str,
    travel_date: str,
    currency: str = "INR",
) -> str:
    """Build a Google Flights search URL with a protobuf-encoded tfs= token.

    Args:
        origin: 3-letter IATA airport code (e.g. "DEL").
        destination: 3-letter IATA airport code (e.g. "BOM").
        travel_date: ISO date string "YYYY-MM-DD".
        currency: Currency code for the search results.

    Returns:
        Full Google Flights URL with the opaque tfs= protobuf parameter.
    """
    # Strip trailing "=" padding — Google Flights tfs uses unpadded Base64
    # (same convention as JWTs). Bright Data rejects padded tokens.
    tfs_token = _build_tfs_token(origin, destination, travel_date).rstrip("=")
    return (
        f"https://www.google.com/travel/flights/search"
        f"?tfs={tfs_token}"
        f"&gl=in"
        f"&hl=en"
        f"&curr={currency}"
    )


# ---------------------------------------------------------------------------
# 2. Bright Data SERP API call
# ---------------------------------------------------------------------------

def fetch_raw_html(url: str) -> str:
    """Send a Google Flights URL to Bright Data's SERP API and return raw HTML.

    Uses format="raw" because Bright Data does NOT support JSON output
    for Google Flights URLs (confirmed via manual testing).

    Raises:
        requests.RequestException: On HTTP/network errors.
        ValueError: If the response is empty or indicates an error.
    """
    if not BRIGHT_DATA_API_TOKEN:
        raise ValueError(
            "BRIGHT_DATA_API_TOKEN is not set. "
            "Set it in config/.env or as an environment variable."
        )

    headers = {
        "Authorization": f"Bearer {BRIGHT_DATA_API_TOKEN}",
        "Content-Type": "application/json",
        "x-unblock-data-format": "html",
    }
    payload = {
        "zone": BRIGHT_DATA_ZONE,
        "url": url,
        "format": "raw",
        "headers": {
            "x-unblock-data-format": "html",
        },
    }

    logger.info("Sending request to Bright Data SERP API for URL: %s", url[:120])
    response = requests.post(
        BRIGHT_DATA_ENDPOINT,
        headers=headers,
        json=payload,
        timeout=90,  # Generous timeout — Flights pages can be slow
    )

    # ---- DIAGNOSTIC LOGGING (temporary) ----
    print("\n" + "=" * 70)
    print("DIAGNOSTIC: Bright Data request/response dump")
    print("=" * 70)
    print(f"\n[FULL REQUEST PAYLOAD] (complete dict, no truncation):")
    import json as _json_diag
    print(_json_diag.dumps(payload, indent=2))
    print(f"\n[PAYLOAD KEYS]: {list(payload.keys())}")
    print(f"[Has 'data_format' key?]: {'data_format' in payload}")
    print(f"\n[RESPONSE STATUS CODE]: {response.status_code}")
    print(f"\n[RESPONSE HEADERS] (full dict):")
    for k, v in response.headers.items():
        print(f"  {k}: {v}")
    print(f"\n[Content-Type]:   {response.headers.get('Content-Type', '(missing)')}")
    print(f"[Content-Length]: {response.headers.get('Content-Length', '(missing)')}")
    print(f"\n[RESPONSE BODY] ({len(response.text)} bytes total, first 500 chars):")
    print(response.text[:500] if len(response.text) > 500 else response.text)
    print("=" * 70 + "\n")
    # ---- END DIAGNOSTIC LOGGING ----

    response.raise_for_status()

    html = response.text
    if not html or len(html) < 500:
        raise ValueError(
            f"Bright Data returned unexpectedly short response ({len(html)} bytes). "
            "Possible block or empty page."
        )

    return html


# ---------------------------------------------------------------------------
# 3. HTML → structured observation parser
# ---------------------------------------------------------------------------

def _extract_js_data(html: str) -> list[Any]:
    """Extract the embedded flight data from Google Flights HTML.

    Google Flights renders flight data server-side into a
    <script class="ds:1"> tag containing a JS data blob. This is
    the same extraction strategy used by fast-flights' internal parser.

    Returns:
        Parsed JSON payload (list of nested arrays).

    Raises:
        ValueError: If the embedded data cannot be found or parsed.
    """
    # Strategy 1: Look for <script class="ds:1"> (primary)
    # The script tag contains: AF_initDataCallback({...data: [...],...});
    pattern = r'<script\s+class="ds:1"[^>]*>(.*?)</script>'
    match = re.search(pattern, html, re.DOTALL)

    if match:
        script_text = match.group(1)
    else:
        # Strategy 2: Search for AF_initDataCallback with flight data markers
        pattern2 = r"AF_initDataCallback\(\{[^}]*key:\s*'ds:1'.*?data:(.*?),\s*sideChannel"
        match2 = re.search(pattern2, html, re.DOTALL)
        if match2:
            script_text = f"data:{match2.group(1)},"
        else:
            raise ValueError(
                "Could not find embedded flight data (script.ds:1) in the HTML. "
                "The page structure may have changed or the page failed to load."
            )

    # Extract the data: [...] portion from the script
    data_match = script_text.split("data:", 1)
    if len(data_match) < 2:
        raise ValueError("Could not split on 'data:' in the embedded script.")

    data_str = data_match[1].rsplit(",", 1)[0]

    try:
        return json.loads(data_str)
    except json.JSONDecodeError as e:
        raise ValueError(f"Failed to parse embedded flight JSON: {e}") from e


def _safe_get(data: Any, *path: int, default: Any = None) -> Any:
    """Safely traverse nested lists by index path."""
    current = data
    for idx in path:
        try:
            if current is None:
                return default
            current = current[idx]
        except (IndexError, TypeError, KeyError):
            return default
    return current if current is not None else default


def _parse_time_pair(value: list[int | None] | None) -> tuple[int, int]:
    """Expand a Google Flights JS time pair that omits default (zero) components.

    Google drops trailing zero components and uses None for a leading zero,
    so [8] means 08:00 and [None, 31] means 00:31.
    """
    padded = [*(value or []), None, None]
    return (padded[0] or 0, padded[1] or 0)


def parse_flights_from_html(
    html: str,
    route_id: str,
    original_currency: str,
) -> list[dict[str, Any]]:
    """Parse Google Flights HTML into a list of flat observation dicts.

    Args:
        html: Raw HTML from Bright Data.
        route_id: e.g. "DEL-BOM".
        original_currency: e.g. "INR", "AED", "SGD".

    Returns:
        List of dicts, each representing one flight observation.
        Only direct/nonstop flights are included; connecting flights
        are discarded with a log warning.
    """
    payload = _extract_js_data(html)
    results: list[dict[str, Any]] = []

    # Google Flights data structure (v3 / JS-based):
    # The top-level payload is a nested array. Flight offers are typically
    # found at payload[2] or payload[3] depending on the page variant.
    # Each offer contains legs → segments → flight details.
    #
    # We try multiple known paths to be resilient to minor structural changes.

    offer_lists = _find_offer_lists(payload)

    if not offer_lists:
        logger.warning("No flight offer lists found in parsed data for %s", route_id)
        return results

    for offer in offer_lists:
        try:
            parsed = _parse_single_offer(offer, route_id, original_currency)
            if parsed is not None:
                results.append(parsed)
        except Exception as e:
            logger.debug("Skipping unparseable offer for %s: %s", route_id, e)
            continue

    logger.info(
        "Parsed %d direct flight(s) for %s from HTML (%d bytes)",
        len(results), route_id, len(html),
    )
    return results


def _find_offer_lists(payload: Any) -> list[Any]:
    """Locate the list of flight offers in the parsed JS data.

    The structure varies slightly between page versions. We try several
    known paths and return the first non-empty list found.
    """
    candidates: list[Any] = []

    # Common paths where flight offers appear in Google Flights JS data
    # Path pattern: payload -> top-level index -> nested arrays of offers
    for top_idx in [2, 3, 1]:
        top = _safe_get(payload, top_idx)
        if not isinstance(top, list):
            continue

        # Offers are often at top[0] or top[1], each being a list of flights
        for sub_idx in [0, 1, 2]:
            sub = _safe_get(top, sub_idx)
            if isinstance(sub, list) and len(sub) > 0:
                # Check if this looks like a list of offers (each offer is a list)
                if all(isinstance(item, list) for item in sub[:3]):
                    candidates.extend(sub)

    return candidates


def _parse_single_offer(
    offer: Any,
    route_id: str,
    original_currency: str,
) -> Optional[dict[str, Any]]:
    """Parse a single flight offer from the JS data structure.

    Returns None if the flight is not direct (has stops).
    """
    legs = _safe_get(offer, 0)
    if not isinstance(legs, list):
        return None

    # Google Flights JS structure:
    # Modern schema: legs is the leg info array where legs[12] is num_stops (0 = nonstop),
    # and legs[2] contains the flight segments list.
    if len(legs) >= 13 and isinstance(legs[12], int):
        num_stops = legs[12]
        if num_stops > 0:
            logger.debug(
                "Discarding connecting flight for %s (%d stops)", route_id, num_stops
            )
            return None

        raw_segments = _safe_get(legs, 2)
        if not isinstance(raw_segments, list) or not raw_segments:
            return None
        seg = raw_segments[0]
        airline_data = _safe_get(seg, 22)
        airline_code = _safe_get(airline_data, 0, default="") or _safe_get(legs, 0, default="")
        flight_number = _safe_get(airline_data, 1, default="")
        operating_carrier = airline_code
        airline_name = _safe_get(airline_data, 3, default="") or _safe_get(legs, 1, 0, default="")

        dep_time_raw = _safe_get(seg, 8)
        dep_time = _parse_time_pair(dep_time_raw if isinstance(dep_time_raw, list) else None)
        departure_time_str = f"{dep_time[0]:02d}:{dep_time[1]:02d}"
    else:
        # Legacy schema fallback
        segments = [s for s in legs if isinstance(s, list) and len(s) >= 3]
        num_stops = len(segments) - 1 if segments else -1

        if num_stops > 0:
            logger.debug(
                "Discarding connecting flight for %s (%d stops)", route_id, num_stops
            )
            return None

        if not segments:
            return None

        seg = segments[0]
        airline_data = _safe_get(seg, 2)
        airline_code = _safe_get(airline_data, 0, default="")
        flight_number = _safe_get(airline_data, 1, default="")
        operating_carrier = _safe_get(airline_data, 4, default=airline_code)
        airline_name = _safe_get(airline_data, 5, default="")

        dep_time_raw = _safe_get(seg, 0, 0)
        dep_time = _parse_time_pair(dep_time_raw if isinstance(dep_time_raw, list) else None)
        departure_time_str = f"{dep_time[0]:02d}:{dep_time[1]:02d}"

    # If operating_carrier is empty or None, fall back to marketing carrier
    if not operating_carrier:
        operating_carrier = airline_code

    # Extract price — check offer[1][0][1] first, then general extraction
    total_fare = _safe_get(offer, 1, 0, 1)
    if not (isinstance(total_fare, (int, float)) and 100 < total_fare < 1_000_000):
        total_fare = _extract_price(offer)

    # Validate airline code (IATA code: 2-3 alphanumeric characters)
    if not airline_code or not re.match(r"^[A-Za-z0-9]{2,3}$", str(airline_code)):
        return None

    # Determine availability
    availability_status = "available" if total_fare and total_fare > 0 else "price_unavailable"

    return {
        "airline": str(airline_code)[:10] if airline_code else None,
        "flight_number": str(flight_number)[:10] if flight_number else None,
        "operating_carrier": str(operating_carrier)[:10] if operating_carrier else None,
        "cabin": "economy",
        "fare_family_raw": None,  # Not reliably available from search results
        "base_fare": None,  # Google Flights search doesn't break down fare components
        "taxes": None,
        "mandatory_fees": None,
        "total_fare_original_currency": float(total_fare) if total_fare else None,
        "original_currency": original_currency,
        "availability_status": availability_status,
        "stops": num_stops,
        "departure_time": departure_time_str,
        "airline_name": airline_name,
        "source": "bright_data",
        "collection_method": "serp_api",
    }


def _extract_price(offer: Any) -> Optional[float]:
    """Extract the total fare price from a flight offer.

    Searches through the offer structure for a numeric price value.
    Google Flights encodes prices in various nested positions.
    """
    # Strategy: walk the offer looking for price-like values
    # Prices are typically integers (in the smallest currency unit or whole units)
    # found at predictable positions in the offer array

    # Common price locations in the offer structure
    for price_path in [
        (1, 0, 1),
        (1,),       # offer[1] might be price directly
        (1, 0),     # offer[1][0]
        (1, 0, 0),  # offer[1][0][0]
        (2,),       # offer[2]
        (2, 0),
        (3,),
        (3, 0),
    ]:
        val = _safe_get(offer, *price_path)
        if isinstance(val, (int, float)) and 100 < val < 1_000_000:
            return float(val)

    # Fallback: recursive search for price-shaped values
    return _find_price_recursive(offer, depth=0, max_depth=6)


def _find_price_recursive(
    data: Any, depth: int, max_depth: int
) -> Optional[float]:
    """Recursively search for a price-shaped numeric value."""
    if depth > max_depth:
        return None

    if isinstance(data, (int, float)):
        # Heuristic: airfares are typically between 500 and 500,000 INR
        # or equivalent in AED/SGD
        if 100 < data < 1_000_000:
            return float(data)
        return None

    if isinstance(data, list):
        for item in data:
            result = _find_price_recursive(item, depth + 1, max_depth)
            if result is not None:
                return result

    return None


# ---------------------------------------------------------------------------
# 4. Main fetch function
# ---------------------------------------------------------------------------

def fetch_fares(
    origin: str,
    destination: str,
    travel_date: str,
    advance_days: int,
) -> dict[str, Any]:
    """Fetch fares from Google Flights via Bright Data for a single route+date.

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
    run_id = f"bd_{route_id}_{timestamp.strftime('%Y%m%d_%H%M%S')}"
    is_international = route_id in INTERNATIONAL_ROUTES
    original_currency = ROUTE_CURRENCY.get(route_id, "INR")

    result: dict[str, Any] = {
        "route_id": route_id,
        "travel_date": travel_date,
        "advance_days": advance_days,
        "collection_timestamp": timestamp.isoformat(),
        "source": "bright_data",
        "run_id": run_id,
        "observations": [],
        "errors": [],
    }

    try:
        # Step 1: Build the Google Flights URL (local, no network)
        url = build_google_flights_url(
            origin=origin,
            destination=destination,
            travel_date=travel_date,
            currency=original_currency,
        )
        logger.info("[%s] Built Google Flights URL for %s T+%d", run_id, route_id, advance_days)

        # Step 2: Send to Bright Data SERP API (network call)
        html = fetch_raw_html(url)
        logger.info("[%s] Received %d bytes of HTML from Bright Data", run_id, len(html))

        # Step 3: Parse the HTML into structured observations
        observations = parse_flights_from_html(html, route_id, original_currency)

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
        error_msg = f"Bright Data timeout for {route_id} T+{advance_days}: {e}"
        logger.error(error_msg)
        result["errors"].append(error_msg)

    except requests.RequestException as e:
        error_msg = f"Bright Data HTTP error for {route_id} T+{advance_days}: {e}"
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
# 5. Write raw output to JSON
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
# 6. CLI test harness
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    """Run a single test fetch for DEL-BOM, T+21, and print the result."""

    # Self-whitelist this machine's IP before any Bright Data calls
    whitelist_current_ip()

    travel_date = (datetime.now(UTC) + timedelta(days=21)).strftime("%Y-%m-%d")

    print(f"{'='*60}")
    print(f"FlyWise Bright Data Adapter -- Test Fetch")
    print(f"{'='*60}")
    print(f"Route:       DEL-BOM")
    print(f"Travel date: {travel_date} (T+21)")
    print(f"Zone:        {BRIGHT_DATA_ZONE}")
    print(f"Token:       {'***' + BRIGHT_DATA_API_TOKEN[-6:] if len(BRIGHT_DATA_API_TOKEN) > 6 else '(not set)'}")
    print(f"{'='*60}")
    print()

    # Show the built URL (no network call)
    url = build_google_flights_url("DEL", "BOM", travel_date)
    print(f"[URL Builder] Google Flights URL:\n{url}\n")

    # Fetch via Bright Data
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
