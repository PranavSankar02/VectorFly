"""
opensky.py — OpenSky Network Data Fetcher
Polls the OpenSky REST API every 5 seconds and caches the latest aircraft states.
Each "state vector" contains: icao24, callsign, origin_country, longitude, latitude,
baro_altitude, velocity, true_track (heading), vertical_rate, on_ground, squawk.
"""

import asyncio
import httpx
import os
from typing import Dict, Optional

OPENSKY_URL = "https://opensky-network.org/api/states/all"

# In-memory cache: icao24 -> aircraft dict
_aircraft_cache: Dict[str, dict] = {}
_fetch_lock = asyncio.Lock()


def _parse_state_vector(sv: list) -> Optional[dict]:
    """Parse a single OpenSky state vector list into a structured dict."""
    try:
        icao24    = sv[0]
        callsign  = (sv[1] or "").strip() or icao24.upper()
        origin    = sv[2] or "Unknown"
        longitude = sv[5]
        latitude  = sv[6]
        altitude  = sv[7]  # baro_altitude in metres
        on_ground = sv[8]
        velocity  = sv[9]  # m/s
        heading   = sv[10]  # true_track in degrees
        vert_rate = sv[11]  # m/s
        squawk    = sv[14] if len(sv) > 14 else None

        # Skip aircraft without valid position
        if longitude is None or latitude is None:
            return None

        return {
            "icao24": icao24,
            "callsign": callsign,
            "origin_country": origin,
            "longitude": longitude,
            "latitude": latitude,
            "altitude_m": altitude or 0,
            "altitude_ft": round((altitude or 0) * 3.28084),
            "velocity_ms": velocity or 0,
            "velocity_kts": round((velocity or 0) * 1.94384),
            "heading": heading or 0,
            "vertical_rate_ms": vert_rate or 0,
            "vertical_rate_fpm": round((vert_rate or 0) * 196.85),
            "on_ground": on_ground,
            "squawk": squawk,
        }
    except (IndexError, TypeError):
        return None


async def fetch_opensky_states() -> Dict[str, dict]:
    """
    Fetch all aircraft state vectors from OpenSky Network.
    Returns the current in-memory cache even if the request fails.
    Anonymous access is rate-limited to ~100 req/day; credentials lift this.
    """
    username = os.getenv("OPENSKY_USERNAME", "")
    password = os.getenv("OPENSKY_PASSWORD", "")
    auth = (username, password) if username else None

    async with _fetch_lock:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(OPENSKY_URL, auth=auth)
                resp.raise_for_status()
                data = resp.json()
                states = data.get("states") or []

                new_cache: Dict[str, dict] = {}
                for sv in states:
                    parsed = _parse_state_vector(sv)
                    if parsed:
                        new_cache[parsed["icao24"]] = parsed

                _aircraft_cache.clear()
                _aircraft_cache.update(new_cache)
                print(f"[OpenSky] Fetched {len(_aircraft_cache)} aircraft")
        except Exception as e:
            print(f"[OpenSky] Fetch error: {e}")

    return dict(_aircraft_cache)


def get_cached_states() -> Dict[str, dict]:
    """Return the current cached aircraft states (non-blocking)."""
    return dict(_aircraft_cache)


async def start_polling(interval_seconds: int = 10):
    """
    Background task: continuously poll OpenSky every `interval_seconds`.
    OpenSky updates every ~10 seconds; anonymous users should use ≥10s to avoid throttling.
    """
    while True:
        await fetch_opensky_states()
        await asyncio.sleep(interval_seconds)
