"""
processing/fx_rate_fetcher.py
FlyWise (APIx) — Daily FX rate fetcher with local cache.

Fetches currency→INR exchange rates from Frankfurter's public API
(https://api.frankfurter.dev), preferring FBIL (RBI/FBIL reference rate)
where available.

FBIL coverage:
  FBIL directly publishes rates for ~7 currencies including AED.
  SGD is NOT among them, so we fall back to Frankfurter's default
  (ECB-blended) rate for SGD.

Caching:
  Each day's rate is cached to a local JSON file so we never refetch
  the same day's rate.  FBIL publishes once/day, so this is safe.
"""

from __future__ import annotations

import json
import logging
import os
import sys
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Optional

import requests

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

PROJECT_ROOT = Path(__file__).resolve().parent.parent

# Local cache directory: processing/fx_cache/
FX_CACHE_DIR = Path(__file__).resolve().parent / "fx_cache"
FX_CACHE_DIR.mkdir(parents=True, exist_ok=True)

FRANKFURTER_BASE = "https://api.frankfurter.dev/v2/rate"

# Currencies we need to convert to INR
# For each: (currency, try_fbil_first)
SUPPORTED_CURRENCIES: dict[str, bool] = {
    "AED": True,   # FBIL publishes AED/INR directly
    "SGD": True,   # We'll *try* FBIL first; expect 404 → fall back to default
}

logger = logging.getLogger("fx_rate_fetcher")
if not logger.handlers:
    sh = logging.StreamHandler(sys.stdout)
    sh.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s"))
    logger.addHandler(sh)
    logger.setLevel(logging.INFO)


# ---------------------------------------------------------------------------
# Cache helpers
# ---------------------------------------------------------------------------

def _cache_key(currency: str, rate_date: date) -> str:
    """Build a deterministic cache filename."""
    return f"{currency}_{rate_date.isoformat()}.json"


def _read_cache(currency: str, rate_date: date) -> Optional[dict]:
    """Read a cached rate entry, if it exists and is valid."""
    path = FX_CACHE_DIR / _cache_key(currency, rate_date)
    if not path.exists():
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        # Validate structure
        if data.get("rate") and data.get("currency") == currency:
            return data
    except (json.JSONDecodeError, OSError) as e:
        logger.warning("Corrupt cache file %s: %s — will refetch.", path.name, e)
    return None


def _write_cache(currency: str, rate_date: date, entry: dict) -> None:
    """Persist a rate entry to the local cache."""
    path = FX_CACHE_DIR / _cache_key(currency, rate_date)
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(entry, f, indent=2, default=str)
    except OSError as e:
        logger.warning("Failed to write cache file %s: %s", path.name, e)


# ---------------------------------------------------------------------------
# API fetchers
# ---------------------------------------------------------------------------

def _fetch_fbil_rate(currency: str) -> Optional[dict]:
    """Fetch the latest rate from Frankfurter with providers=FBIL.

    Returns dict with keys: rate, date, provider  — or None on failure/404.
    """
    url = f"{FRANKFURTER_BASE}/{currency}/INR?providers=FBIL"
    try:
        resp = requests.get(url, timeout=15)
        if resp.status_code == 404:
            logger.info(
                "FBIL does not publish %s/INR (HTTP 404). Will use default provider.",
                currency,
            )
            return None
        resp.raise_for_status()
        data = resp.json()
        # Expected shape: {"date":"2026-09-09","base":"AED","quote":"INR","rate":25.9055}
        if "rate" not in data:
            logger.warning("FBIL response for %s missing 'rate' key: %s", currency, data)
            return None
        return {
            "rate": float(data["rate"]),
            "date": data.get("date", date.today().isoformat()),
            "provider": "FBIL",
        }
    except requests.RequestException as e:
        logger.warning("FBIL request for %s/INR failed: %s", currency, e)
        return None


def _fetch_default_rate(currency: str) -> Optional[dict]:
    """Fetch the latest rate from Frankfurter's default (ECB-blended) provider.

    Returns dict with keys: rate, date, provider  — or None on failure.
    """
    url = f"{FRANKFURTER_BASE}/{currency}/INR"
    try:
        resp = requests.get(url, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        if "rate" not in data:
            logger.warning("Default Frankfurter response for %s missing 'rate': %s", currency, data)
            return None
        return {
            "rate": float(data["rate"]),
            "date": data.get("date", date.today().isoformat()),
            "provider": "ECB_blended",
        }
    except requests.RequestException as e:
        logger.warning("Default Frankfurter request for %s/INR failed: %s", currency, e)
        return None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_fx_rate(
    currency: str,
    for_date: Optional[date] = None,
) -> dict:
    """Get the FX rate for *currency* → INR, with caching.

    Strategy:
    1. Check local cache for today's (or *for_date*'s) rate.
    2. Try FBIL provider first (if the currency is expected to be published).
    3. Fall back to Frankfurter's default (ECB-blended) rate.
    4. Cache the result for the rest of the day.

    Args:
        currency: ISO 4217 code (e.g. "AED", "SGD").
        for_date:  Date for which we need the rate.  Defaults to today (UTC).

    Returns:
        Dict with keys:
            rate        (float): The exchange rate (1 *currency* = *rate* INR).
            date        (str):   The publication date from the provider.
            provider    (str):   "FBIL" or "ECB_blended".
            currency    (str):   The input currency code.
            cached      (bool):  Whether the result was served from cache.

    Raises:
        ValueError: If both FBIL and default fetches fail.
    """
    if currency == "INR":
        return {
            "rate": 1.0,
            "date": (for_date or date.today()).isoformat(),
            "provider": "identity",
            "currency": "INR",
            "cached": False,
        }

    target_date = for_date or datetime.now(timezone.utc).date()

    # 1. Cache check
    cached = _read_cache(currency, target_date)
    if cached:
        logger.info(
            "Cache hit: %s/INR = %.4f on %s (provider: %s)",
            currency, cached["rate"], cached["date"], cached["provider"],
        )
        cached["cached"] = True
        return cached

    # 2. Try FBIL first
    result = None
    try_fbil = SUPPORTED_CURRENCIES.get(currency, False)
    if try_fbil:
        result = _fetch_fbil_rate(currency)

    # 3. Fallback to default (ECB-blended) if FBIL failed or isn't available
    if result is None:
        result = _fetch_default_rate(currency)

    if result is None:
        raise ValueError(
            f"Could not fetch FX rate for {currency}/INR from any provider. "
            "Both FBIL and default Frankfurter endpoints failed."
        )

    # Enrich and cache
    result["currency"] = currency
    result["cached"] = False
    _write_cache(currency, target_date, result)

    logger.info(
        "Fetched fresh rate: %s/INR = %.4f on %s (provider: %s)",
        currency, result["rate"], result["date"], result["provider"],
    )
    return result


def get_fx_rate_value(currency: str, for_date: Optional[date] = None) -> float:
    """Convenience wrapper that returns just the numeric rate."""
    return get_fx_rate(currency, for_date)["rate"]


# ---------------------------------------------------------------------------
# CLI test harness
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("=" * 60)
    print("FlyWise FX Rate Fetcher — Test")
    print("=" * 60)

    for ccy in ["INR", "AED", "SGD"]:
        try:
            info = get_fx_rate(ccy)
            print(
                f"\n  {ccy}/INR = {info['rate']:.4f}  "
                f"(date: {info['date']}, provider: {info['provider']}, "
                f"cached: {info['cached']})"
            )
        except ValueError as e:
            print(f"\n  {ccy}: FAILED — {e}")

    # Verify cache works on second call
    print("\n--- Second call (should be cached) ---")
    for ccy in ["AED", "SGD"]:
        info = get_fx_rate(ccy)
        print(f"  {ccy}/INR = {info['rate']:.4f} (cached: {info['cached']})")
