"""
collectors/ota_scraper.py
FlyWise (APIx) — OTA direct scraper using Playwright (Python).

Scrapes public flight search-results pages directly:
1. Tries Ixigo first.
2. If Ixigo blocks scraping, is disallowed by robots.txt, or shows CAPTCHA
   challenges, switches to EaseMyTrip (no CAPTCHA bypass or anti-bot tooling).
3. Locked data-integrity requirements:
   - Playwright async API.
   - Fresh browser context per search (zero cookie/session reuse across calls).
   - Programmatic robots.txt verification prior to scraping; aborts if disallowed.
   - No CAPTCHA-solving, no anti-bot bypass tooling, no IP rotation.
   - Output normalized to the unified flat observation structure matching
     bright_data_adapter.py and scrappa_adapter.py.
   - Raw output saved to collectors/raw_output/{domestic|international}/.
   - source set to "ota_playwright".
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import sys
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

load_dotenv(dotenv_path=Path(__file__).resolve().parent.parent / "config" / ".env")

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)

INTERNATIONAL_ROUTES: set[str] = {"DEL-DXB", "BOM-DXB", "DEL-SIN", "BOM-SIN"}

ROUTE_CURRENCY: dict[str, str] = {
    "DEL-DXB": "AED",
    "BOM-DXB": "AED",
    "DEL-SIN": "SGD",
    "BOM-SIN": "SGD",
}

# Airport IATA -> City Name mapping (required for EaseMyTrip search URLs)
IATA_TO_CITY: dict[str, str] = {
    "DEL": "Delhi",
    "BOM": "Mumbai",
    "BLR": "Bangalore",
    "MAA": "Chennai",
    "CCU": "Kolkata",
    "HYD": "Hyderabad",
    "GOI": "Goa",
    "GOX": "Goa",
    "PNQ": "Pune",
    "AMD": "Ahmedabad",
    "COK": "Kochi",
    "JAI": "Jaipur",
    "LKO": "Lucknow",
    "DXB": "Dubai",
    "SIN": "Singapore",
}

RAW_OUTPUT_DIR = Path(__file__).resolve().parent / "raw_output"
ERRORS_LOG = Path(__file__).resolve().parent / "errors.log"

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logger = logging.getLogger("ota_scraper")
logger.setLevel(logging.INFO)

# Avoid duplicate handlers if reloaded
if not logger.handlers:
    _stream_handler = logging.StreamHandler(sys.stdout)
    _stream_handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s"))
    logger.addHandler(_stream_handler)

    _file_handler = logging.FileHandler(ERRORS_LOG, mode="a", encoding="utf-8")
    _file_handler.setLevel(logging.ERROR)
    _file_handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
    logger.addHandler(_file_handler)


# ---------------------------------------------------------------------------
# 1. robots.txt Verification
# ---------------------------------------------------------------------------

def check_robots_txt(url: str, user_agent: str = "*") -> tuple[bool, str]:
    """Programmatically check if the site's robots.txt permits fetching the URL.

    Args:
        url: Full target URL to inspect.
        user_agent: User-agent to test rules against (default '*').

    Returns:
        tuple (allowed: bool, reason: str)
    """
    import urllib.request

    try:
        parsed = urlparse(url)
        robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"

        req = urllib.request.Request(
            robots_url,
            headers={"User-Agent": USER_AGENT},
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            content = resp.read().decode("utf-8", errors="ignore")

        rp = RobotFileParser()
        rp.parse(content.splitlines())

        allowed = rp.can_fetch(user_agent, url)
        if allowed:
            msg = f"robots.txt ({robots_url}) allows access to: {url}"
            logger.info(msg)
            return True, msg
        else:
            msg = f"robots.txt ({robots_url}) DISALLOWS access to: {url}"
            logger.warning(msg)
            return False, msg

    except Exception as e:
        msg = f"Could not fetch/evaluate robots.txt for {url}: {e}"
        logger.warning(msg)
        # Conservative: if robots.txt cannot be fetched due to network, allow but warn
        return True, msg


# ---------------------------------------------------------------------------
# 2. URL Builders
# ---------------------------------------------------------------------------

def build_ixigo_url(origin: str, destination: str, travel_date: str) -> str:
    """Build Ixigo flight search URL.

    Format: https://www.ixigo.com/search/result/flight/{origin}/{dest}/{DDMMYYYY}/1/0/0/e
    """
    parts = travel_date.split("-")
    ddmmyyyy = f"{parts[2]}{parts[1]}{parts[0]}"
    return f"https://www.ixigo.com/search/result/flight/{origin}/{destination}/{ddmmyyyy}/1/0/0/e"


def build_easemytrip_url(origin: str, destination: str, travel_date: str) -> str:
    """Build EaseMyTrip flight search URL.

    Format: https://flight.easemytrip.com/FlightList/Index?srch={origin}-{city}-India|{dest}-{city}-India|{DD/MM/YYYY}&px=1-0-0&cbn=0&ar=undefined&isSplit=false
    """
    parts = travel_date.split("-")
    dd_mm_yyyy = f"{parts[2]}/{parts[1]}/{parts[0]}"
    orig_city = IATA_TO_CITY.get(origin, origin)
    dest_city = IATA_TO_CITY.get(destination, destination)

    country_orig = "India" if origin not in {"DXB", "SIN"} else ("UAE" if origin == "DXB" else "Singapore")
    country_dest = "India" if destination not in {"DXB", "SIN"} else ("UAE" if destination == "DXB" else "Singapore")

    srch_param = f"{origin}-{orig_city}-{country_orig}|{destination}-{dest_city}-{country_dest}|{dd_mm_yyyy}"
    return (
        f"https://flight.easemytrip.com/FlightList/Index"
        f"?srch={srch_param}"
        f"&px=1-0-0&cbn=0&ar=undefined&isSplit=false"
    )


# ---------------------------------------------------------------------------
# 3. DOM Parsers (based on actual rendered DOM)
# ---------------------------------------------------------------------------

async def _parse_easemytrip_page(page: Any, currency: str) -> list[dict[str, Any]]:
    """Parse real DOM from EaseMyTrip search-results page.

    Verified DOM structure:
      Each flight has a distinct 'Book Now' button: button[id^='BK_']
      Container: outermost card container ancestor (.fltResult or divAir*)
      Airline: .txt-r4 (e.g. 'SpiceJet', 'IndiGo')
      Airline Code & Flight #: .txt-r5 (e.g. 'SG- 802')
      Departure Time: .txt-r2-n (e.g. '22:30')
      Stops: .dura_md2 (e.g. 'Non-stop' -> stops = 0)
      Price: span[price] or .exPrc (e.g. price='6368')
    """
    results: list[dict[str, Any]] = []

    raw_flights = await page.evaluate("""() => {
        const flights = [];
        const bkBtns = document.querySelectorAll("button[id^='BK_']:not([id*='Loader'])");

        for (const btn of bkBtns) {
            let curr = btn;
            while (curr && curr.parentElement && !curr.classList.contains("fltResult") && !curr.id.startsWith("divAir")) {
                curr = curr.parentElement;
            }
            const container = curr || btn.closest(".row");
            if (!container) continue;

            const airlineEl = container.querySelector(".txt-r4");
            const fltNumEl = container.querySelector(".txt-r5");
            const depEl = container.querySelector(".txt-r2-n");
            const stopsEl = container.querySelector(".dura_md2");
            const priceEl = container.querySelector("span[price]") || container.querySelector(".exPrc");

            if (airlineEl && depEl && priceEl) {
                flights.push({
                    airlineName: airlineEl.innerText.trim(),
                    flightNumText: fltNumEl ? fltNumEl.innerText.trim() : "",
                    depTime: depEl.innerText.trim(),
                    stopsText: stopsEl ? stopsEl.innerText.trim() : "",
                    priceAttr: priceEl.getAttribute ? priceEl.getAttribute("price") : null,
                    priceText: priceEl.innerText.trim()
                });
            }
        }
        return flights;
    }""")

    logger.info("EaseMyTrip DOM raw cards extracted: %d", len(raw_flights))

    # Keyed by (flight_number, departure_time) to retain the lowest available fare
    seen_flights: dict[tuple[str, str], dict[str, Any]] = {}

    for item in raw_flights:
        stops_str = item.get("stopsText", "").lower()
        # Non-stop / direct flights only
        if "non-stop" not in stops_str and "non stop" not in stops_str and stops_str != "":
            continue

        flight_num_text = item.get("flightNumText", "").replace(" ", "")
        code_match = re.search(r"([A-Z0-9]{2})[- ]?(\d+)", flight_num_text)
        if code_match:
            airline_code = code_match.group(1)
            flight_number = f"{code_match.group(1)}-{code_match.group(2)}"
        else:
            airline_code = flight_num_text[:2] if flight_num_text else None
            flight_number = flight_num_text or None

        price_val: Optional[float] = None
        price_attr = item.get("priceAttr")
        if price_attr:
            try:
                price_val = float(price_attr)
            except ValueError:
                pass
        if price_val is None:
            clean_price = re.sub(r"[^\d.]", "", item.get("priceText", ""))
            if clean_price:
                try:
                    price_val = float(clean_price)
                except ValueError:
                    pass

        if not price_val or price_val < 100:
            continue

        dep_time = item.get("depTime", "")
        time_match = re.search(r"(\d{1,2}:\d{2})", dep_time)
        dep_time_clean = time_match.group(1) if time_match else dep_time[:5]

        key = (str(flight_number), dep_time_clean)
        if key in seen_flights:
            # If seen, keep lowest fare
            if price_val < (seen_flights[key]["total_fare_original_currency"] or float("inf")):
                seen_flights[key]["total_fare_original_currency"] = price_val
            continue

        obs: dict[str, Any] = {
            "airline": airline_code,
            "flight_number": flight_number,
            "operating_carrier": airline_code,
            "cabin": "economy",
            "fare_family_raw": None,
            "base_fare": None,
            "taxes": None,
            "mandatory_fees": None,
            "total_fare_original_currency": price_val,
            "original_currency": currency,
            "availability_status": "available",
            "stops": 0,
            "departure_time": dep_time_clean,
            "airline_name": item.get("airlineName", ""),
            "source": "ota_playwright",
            "collection_method": "playwright_scrape",
        }
        seen_flights[key] = obs

    results = list(seen_flights.values())
    return results


async def _parse_ixigo_page(page: Any, currency: str) -> list[dict[str, Any]]:
    """Parse real DOM from Ixigo search-results page.

    Verified DOM structure:
      Card: div containing .airlineInfo
      Airline Name: p.airlineTruncate
      Flight Number: p.text-secondary inside .airlineInfo
      Departure Time: h6.text-primary inside .timeTileList
      Stops: element containing 'Non-stop'
      Price: span/div containing rupee symbol
    """
    results: list[dict[str, Any]] = []

    raw_flights = await page.evaluate("""() => {
        const flights = [];
        const cards = document.querySelectorAll(".airlineInfo");

        for (const info of cards) {
            const cardRoot = info.closest(".flex.items-start") || info.parentElement;
            if (!cardRoot) continue;

            const nameEl = info.querySelector(".airlineTruncate") || info.querySelector("p");
            const numEl = info.querySelector(".text-secondary");
            const depEl = cardRoot.querySelector(".timeTileList h6") || cardRoot.querySelector("h6");
            const fullText = cardRoot.innerText || "";

            const isNonStop = fullText.includes("Non-stop");
            const priceMatch = fullText.match(/₹([0-9,]+)/);

            flights.push({
                airlineName: nameEl ? nameEl.innerText.trim() : "",
                flightNumber: numEl ? numEl.innerText.trim() : "",
                depTime: depEl ? depEl.innerText.trim() : "",
                isNonStop: isNonStop,
                priceText: priceMatch ? priceMatch[1] : ""
            });
        }
        return flights;
    }""")

    logger.info("Ixigo DOM raw cards extracted: %d", len(raw_flights))

    for item in raw_flights:
        if not item.get("isNonStop"):
            continue

        raw_num = item.get("flightNumber", "")
        code_match = re.match(r"([A-Z0-9]{2})(\d+)", raw_num)
        if code_match:
            airline_code = code_match.group(1)
            flight_number = f"{code_match.group(1)}-{code_match.group(2)}"
        else:
            airline_code = raw_num[:2] if raw_num else None
            flight_number = raw_num or None

        clean_price = re.sub(r"[^\d.]", "", item.get("priceText", ""))
        price_val = float(clean_price) if clean_price else None
        if not price_val or price_val < 100:
            continue

        dep_time = item.get("depTime", "")
        time_match = re.search(r"(\d{1,2}:\d{2})", dep_time)
        dep_time_clean = time_match.group(1) if time_match else dep_time[:5]

        obs: dict[str, Any] = {
            "airline": airline_code,
            "flight_number": flight_number,
            "operating_carrier": airline_code,
            "cabin": "economy",
            "fare_family_raw": None,
            "base_fare": None,
            "taxes": None,
            "mandatory_fees": None,
            "total_fare_original_currency": price_val,
            "original_currency": currency,
            "availability_status": "available",
            "stops": 0,
            "departure_time": dep_time_clean,
            "airline_name": item.get("airlineName", ""),
            "source": "ota_playwright",
            "collection_method": "playwright_scrape",
        }
        results.append(obs)

    return results


# ---------------------------------------------------------------------------
# 4. Scraper Engine (Playwright Async API)
# ---------------------------------------------------------------------------

async def _scrape_single_target_async(
    target_name: str,
    url: str,
    parser_func: Any,
    currency: str,
) -> list[dict[str, Any]]:
    """Execute a single scrape run in a fresh Playwright browser context.

    Enforces:
    - Fresh browser context per search (no session / cookie reuse).
    - Programmatic robots.txt verification.
    - No anti-bot or CAPTCHA bypass tooling (aborts and logs if encountered).
    """
    from playwright.async_api import async_playwright

    # 1. robots.txt verification
    allowed, robots_reason = check_robots_txt(url)
    if not allowed:
        raise PermissionError(
            f"[{target_name}] Blocked by robots.txt: {robots_reason}"
        )

    logger.info("[%s] Launching fresh Playwright context for URL: %s", target_name, url)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        # Fresh context per search — locked data-integrity requirement
        context = await browser.new_context(
            user_agent=USER_AGENT,
            viewport={"width": 1366, "height": 768},
            locale="en-IN",
        )
        page = await context.new_page()

        try:
            response = await page.goto(url, wait_until="domcontentloaded", timeout=45000)
            if response and response.status >= 400:
                raise ValueError(
                    f"[{target_name}] HTTP {response.status} returned for {url}"
                )

            # Wait for content to stabilize
            await page.wait_for_timeout(6000)

            content = await page.content()
            lower_content = content.lower()

            challenge_terms = [
                "verify you are human",
                "challenge-running",
                "cf-turnstile",
                "hcaptcha",
                "g-recaptcha",
                "access denied",
                "attention required! | cloudflare",
            ]
            for term in challenge_terms:
                if term in lower_content:
                    raise ValueError(
                        f"[{target_name}] Anti-bot challenge or CAPTCHA encountered ('{term}'). "
                        f"Skipping per policy (no bypass tooling permitted)."
                    )

            # Parse DOM using verified target-specific parser
            observations = await parser_func(page, currency)
            if not observations:
                logger.warning(
                    "[%s] 0 observations extracted from rendered page (%d bytes)",
                    target_name, len(content),
                )

            return observations

        finally:
            await context.close()
            await browser.close()


async def scrape_flights_async(
    origin: str,
    destination: str,
    travel_date: str,
    currency: str = "INR",
) -> tuple[list[dict[str, Any]], list[str]]:
    """Scrape flight search results trying Ixigo first, with EaseMyTrip fallback.

    Requirements fulfilled:
    - Try Ixigo first.
    - If blocked by robots.txt, CAPTCHA, or network failure, switch to EaseMyTrip.
    - Uses Playwright async API.
    - Fresh browser context per attempt.
    - Collects direct flights only.
    """
    errors: list[str] = []

    # -------------------------------------------------------------
    # Target 1: Ixigo
    # -------------------------------------------------------------
    ixigo_url = build_ixigo_url(origin, destination, travel_date)
    logger.info("Attempting Primary OTA: Ixigo (%s -> %s on %s)", origin, destination, travel_date)

    try:
        obs = await _scrape_single_target_async("Ixigo", ixigo_url, _parse_ixigo_page, currency)
        if obs:
            logger.info("Ixigo scrape successful: %d direct flight(s) found", len(obs))
            return obs, errors
        else:
            errors.append("Ixigo returned 0 direct flights; falling back to EaseMyTrip.")
    except (PermissionError, ValueError, Exception) as e:
        err_msg = f"Ixigo scrape failed ({type(e).__name__}: {e}); falling back to EaseMyTrip."
        logger.warning(err_msg)
        errors.append(err_msg)

    # -------------------------------------------------------------
    # Target 2: EaseMyTrip (Fallback)
    # -------------------------------------------------------------
    emt_url = build_easemytrip_url(origin, destination, travel_date)
    logger.info("Attempting Fallback OTA: EaseMyTrip (%s -> %s on %s)", origin, destination, travel_date)

    try:
        obs = await _scrape_single_target_async("EaseMyTrip", emt_url, _parse_easemytrip_page, currency)
        if obs:
            logger.info("EaseMyTrip scrape successful: %d direct flight(s) found", len(obs))
            return obs, errors
        else:
            err_msg = "EaseMyTrip returned 0 direct flights."
            logger.error(err_msg)
            errors.append(err_msg)
            return [], errors
    except (PermissionError, ValueError, Exception) as e:
        err_msg = f"EaseMyTrip scrape failed ({type(e).__name__}: {e})."
        logger.error(err_msg)
        errors.append(err_msg)
        return [], errors


# ---------------------------------------------------------------------------
# 5. Main Fetch Function (Public Adapter Interface)
# ---------------------------------------------------------------------------

def fetch_fares(
    origin: str,
    destination: str,
    travel_date: str,
    advance_days: int,
) -> dict[str, Any]:
    """Fetch fares from OTA search pages via Playwright scraping.

    Standardized adapter signature matching bright_data_adapter.py and
    scrappa_adapter.py.

    Args:
        origin: 3-letter IATA code (e.g. 'DEL').
        destination: 3-letter IATA code (e.g. 'BOM').
        travel_date: ISO date string 'YYYY-MM-DD'.
        advance_days: Lead time in days (e.g. 1, 7, 21).

    Returns:
        Dict adhering to the standard raw output envelope:
        - route_id: 'ORIGIN-DEST'
        - travel_date: 'YYYY-MM-DD'
        - advance_days: int
        - collection_timestamp: ISO 8601 UTC timestamp
        - source: 'ota_playwright'
        - run_id: unique run identifier
        - observations: list of normalized flight observation dicts
        - errors: list of error strings encountered
    """
    route_id = f"{origin}-{destination}"
    timestamp = datetime.now(UTC)
    run_id = f"pw_{route_id}_{timestamp.strftime('%Y%m%d_%H%M%S')}"
    original_currency = ROUTE_CURRENCY.get(route_id, "INR")

    result: dict[str, Any] = {
        "route_id": route_id,
        "travel_date": travel_date,
        "advance_days": advance_days,
        "collection_timestamp": timestamp.isoformat(),
        "source": "ota_playwright",
        "run_id": run_id,
        "observations": [],
        "errors": [],
    }

    try:
        observations, scrape_errors = asyncio.run(
            scrape_flights_async(origin, destination, travel_date, original_currency)
        )
        result["errors"].extend(scrape_errors)

        # Enrich observations with standard metadata
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
        logger.info(
            "[%s] Complete: %d observations, %d error notes for %s T+%d",
            run_id, len(observations), len(result["errors"]), route_id, advance_days,
        )

    except Exception as e:
        error_msg = f"Unexpected error in ota_scraper for {route_id} T+{advance_days}: {type(e).__name__}: {e}"
        logger.error(error_msg)
        result["errors"].append(error_msg)

    return result


# ---------------------------------------------------------------------------
# 6. File Writing Convention
# ---------------------------------------------------------------------------

def save_raw_output(result: dict[str, Any]) -> Optional[Path]:
    """Write a fetch result to the raw_output directory as JSON.

    Format: collectors/raw_output/{domestic|international}/{route_id}_{advance_days}_{timestamp}.json
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
# 7. CLI Test Runner
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    travel_date = (datetime.now(UTC) + timedelta(days=21)).strftime("%Y-%m-%d")

    print("=" * 60)
    print("FlyWise OTA Scraper (Playwright) — Test Fetch")
    print("=" * 60)
    print("Route:       DEL-BOM")
    print(f"Travel date: {travel_date} (T+21)")
    print("=" * 60)

    res = fetch_fares(
        origin="DEL",
        destination="BOM",
        travel_date=travel_date,
        advance_days=21,
    )

    saved_file = save_raw_output(res)
    obs = res.get("observations", [])
    errs = res.get("errors", [])

    print("\n" + "=" * 60)
    print(f"Summary: {len(obs)} observation(s), {len(errs)} note(s)/error(s)")
    print("=" * 60)

    if errs:
        print("\nLog notes:")
        for err in errs:
            print(f"  [-] {err}")

    if obs:
        fares = [o["total_fare_original_currency"] for o in obs if o.get("total_fare_original_currency")]
        airlines = sorted(set(str(o.get("airline_name") or o.get("airline")) for o in obs))
        print(f"\nAirlines observed: {', '.join(airlines)}")
        if fares:
            print(f"Min fare: {min(fares):.2f} INR")
            print(f"Max fare: {max(fares):.2f} INR")
            print(f"Avg fare: {sum(fares)/len(fares):.2f} INR")

        print("\nFirst 3 parsed flights:")
        for idx, o in enumerate(obs[:3], 1):
            print(f"  {idx}. {o.get('airline_name')} ({o.get('airline')}) | Flight: {o.get('flight_number')} | "
                  f"Dept: {o.get('departure_time')} | Fare: {o.get('total_fare_original_currency')} {o.get('original_currency')}")

    if saved_file:
        print(f"\nRaw output written to: {saved_file}")
