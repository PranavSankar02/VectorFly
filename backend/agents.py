"""
agents.py — ATC AI Agents: Conflict Detection & Anomaly Detection

ConflictDetectionAgent:
  Implements ICAO Doc 4444 separation minima:
  - Horizontal: < 5 NM (9260 m) between any two airborne aircraft
  - Vertical: < 1000 ft (304.8 m) between aircraft at same level

AnomalyDetectionAgent:
  Flags aircraft with unusual behaviour:
  - Rapid altitude change > 2000 ft/min (emergency descent/climb)
  - Speed outside normal range (< 50 or > 650 knots while airborne)
  - Emergency squawk codes: 7500 (hijack), 7600 (radio failure), 7700 (emergency)
"""

import math
from typing import Dict, List


# ─── Constants (ICAO separation minima) ──────────────────────────────────────
SEPARATION_HORIZONTAL_M   = 9260.0   # 5 nautical miles in metres
SEPARATION_VERTICAL_FT    = 1000.0   # 1000 feet
MAX_VERTICAL_RATE_FPM     = 2000.0   # ft/min — above this is anomalous
MIN_AIRBORNE_SPEED_KTS    = 50.0
MAX_AIRBORNE_SPEED_KTS    = 650.0
EMERGENCY_SQUAWKS         = {"7500", "7600", "7700"}


def _haversine_distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate great-circle distance between two GPS coordinates in metres.
    Uses the Haversine formula suitable for short-range ATC calculations.
    """
    R = 6_371_000  # Earth radius in metres
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda/2)**2
    return 2 * R * math.asin(math.sqrt(a))


def _bearing_deg(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate initial bearing from point 1 to point 2 (degrees, 0-360)."""
    dlon = math.radians(lon2 - lon1)
    x = math.sin(dlon) * math.cos(math.radians(lat2))
    y = math.cos(math.radians(lat1)) * math.sin(math.radians(lat2)) - \
        math.sin(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.cos(dlon)
    return (math.degrees(math.atan2(x, y)) + 360) % 360


# ─── Conflict Detection Agent ─────────────────────────────────────────────────

class ConflictDetectionAgent:
    """
    Scans all tracked aircraft pairs for loss of separation.
    O(n²) scan — practical for up to ~500 aircraft in a region.
    For global-scale, spatial indexing (R-tree / grid) would be used.
    """

    def detect(self, aircraft: Dict[str, dict]) -> List[dict]:
        """
        Returns a list of conflict events, each containing both aircraft and
        the horizontal/vertical separation that triggered the alert.
        """
        airborne = {
            k: v for k, v in aircraft.items()
            if not v.get("on_ground") and v.get("latitude") and v.get("longitude")
        }
        conflicts = []
        keys = list(airborne.keys())

        for i in range(len(keys)):
            for j in range(i + 1, len(keys)):
                a1 = airborne[keys[i]]
                a2 = airborne[keys[j]]

                h_dist = _haversine_distance_m(
                    a1["latitude"], a1["longitude"],
                    a2["latitude"], a2["longitude"]
                )
                v_dist = abs(a1["altitude_ft"] - a2["altitude_ft"])

                if h_dist < SEPARATION_HORIZONTAL_M and v_dist < SEPARATION_VERTICAL_FT:
                    bearing = _bearing_deg(
                        a1["latitude"], a1["longitude"],
                        a2["latitude"], a2["longitude"]
                    )
                    conflicts.append({
                        "type": "CONFLICT",
                        "severity": "CRITICAL",
                        "aircraft_1": a1["callsign"],
                        "aircraft_2": a2["callsign"],
                        "icao_1": a1["icao24"],
                        "icao_2": a2["icao24"],
                        "horizontal_sep_nm": round(h_dist / 1852, 2),
                        "vertical_sep_ft": round(v_dist),
                        "bearing_deg": round(bearing),
                        "message": (
                            f"SEPARATION VIOLATION: {a1['callsign']} and {a2['callsign']} "
                            f"are {round(h_dist/1852, 1)} NM apart horizontally, "
                            f"{round(v_dist)} ft vertically. ICAO minima: 5 NM / 1000 ft."
                        )
                    })

        return conflicts

    def get_nearby_conflicts(self, icao24: str, all_conflicts: List[dict]) -> List[dict]:
        """Filter conflicts involving a specific aircraft."""
        return [c for c in all_conflicts if icao24 in (c["icao_1"], c["icao_2"])]


# ─── Anomaly Detection Agent ──────────────────────────────────────────────────

class AnomalyDetectionAgent:
    """
    Detects individual aircraft anomalies based on telemetry thresholds
    and emergency squawk codes.
    """

    def analyze(self, aircraft: dict) -> List[dict]:
        """
        Analyze a single aircraft's telemetry for anomalies.
        Returns a list of anomaly events (may be empty).
        """
        anomalies = []
        callsign = aircraft.get("callsign", aircraft.get("icao24", "UNKNOWN"))
        on_ground = aircraft.get("on_ground", True)

        # 1. Emergency squawk codes
        squawk = str(aircraft.get("squawk") or "")
        if squawk in EMERGENCY_SQUAWKS:
            squawk_meanings = {
                "7500": "HIJACKING IN PROGRESS",
                "7600": "RADIO COMMUNICATIONS FAILURE",
                "7700": "GENERAL EMERGENCY / MAYDAY",
            }
            anomalies.append({
                "type": "EMERGENCY_SQUAWK",
                "severity": "CRITICAL",
                "code": squawk,
                "message": f"EMERGENCY: {callsign} squawking {squawk} — {squawk_meanings[squawk]}"
            })

        if not on_ground:
            vert_rate_fpm = aircraft.get("vertical_rate_fpm", 0)
            speed_kts = aircraft.get("velocity_kts", 0)
            altitude_ft = aircraft.get("altitude_ft", 0)

            # 2. Rapid altitude change
            if abs(vert_rate_fpm) > MAX_VERTICAL_RATE_FPM:
                direction = "CLIMBING" if vert_rate_fpm > 0 else "DESCENDING"
                anomalies.append({
                    "type": "RAPID_ALTITUDE_CHANGE",
                    "severity": "WARNING",
                    "vertical_rate_fpm": vert_rate_fpm,
                    "message": (
                        f"{callsign} is {direction} at {abs(vert_rate_fpm):.0f} fpm "
                        f"(threshold: {MAX_VERTICAL_RATE_FPM:.0f} fpm). "
                        f"Current altitude: {altitude_ft} ft."
                    )
                })

            # 3. Unusual airspeed
            if speed_kts < MIN_AIRBORNE_SPEED_KTS and altitude_ft > 1000:
                anomalies.append({
                    "type": "LOW_AIRSPEED",
                    "severity": "WARNING",
                    "speed_kts": speed_kts,
                    "message": (
                        f"{callsign} at dangerously low airspeed: {speed_kts} kts "
                        f"at {altitude_ft} ft. Risk of stall."
                    )
                })
            elif speed_kts > MAX_AIRBORNE_SPEED_KTS:
                anomalies.append({
                    "type": "HIGH_AIRSPEED",
                    "severity": "WARNING",
                    "speed_kts": speed_kts,
                    "message": (
                        f"{callsign} exceeding normal airspeed: {speed_kts} kts "
                        f"(normal max: {MAX_AIRBORNE_SPEED_KTS} kts)."
                    )
                })

        return anomalies

    def analyze_all(self, aircraft: Dict[str, dict]) -> Dict[str, List[dict]]:
        """Analyze all aircraft and return icao24 -> anomalies mapping."""
        return {k: self.analyze(v) for k, v in aircraft.items() if self.analyze(v)}


# ─── Shared Instances ─────────────────────────────────────────────────────────
conflict_agent = ConflictDetectionAgent()
anomaly_agent  = AnomalyDetectionAgent()
