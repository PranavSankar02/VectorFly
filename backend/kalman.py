"""
kalman.py — Kalman Filter for Aircraft Position Smoothing
Implements a 4-state constant-velocity Kalman filter per aircraft.
State vector: [latitude, longitude, velocity_lat, velocity_lon]
This smooths the noisy 10-second position snapshots from OpenSky
into continuous, realistic-looking movement on the radar.
"""

import numpy as np
from typing import Dict, Tuple
import time

# Per-aircraft Kalman filter state storage
_filters: Dict[str, dict] = {}

# Process noise — how much we expect the aircraft dynamics to vary
Q_SCALE = 1e-5

# Measurement noise — how noisy the OpenSky GPS positions are (roughly ±100m)
R_SCALE = 1e-4


def _init_filter(lat: float, lon: float) -> dict:
    """Initialize a new Kalman filter state for an aircraft."""
    return {
        # State: [lat, lon, v_lat, v_lon]
        "x": np.array([lat, lon, 0.0, 0.0]),
        # State covariance matrix (initial uncertainty)
        "P": np.eye(4) * 1.0,
        # State transition matrix (constant velocity model)
        "F": None,  # Will be computed per dt
        # Measurement matrix: we observe lat, lon directly
        "H": np.array([[1, 0, 0, 0],
                       [0, 1, 0, 0]], dtype=float),
        # Measurement noise covariance
        "R": np.eye(2) * R_SCALE,
        # Process noise covariance
        "Q": np.eye(4) * Q_SCALE,
        "last_time": time.time(),
    }


def update_aircraft(icao24: str, lat: float, lon: float) -> Tuple[float, float]:
    """
    Update the Kalman filter for an aircraft with a new GPS observation.
    Returns the smoothed (lat, lon) position estimate.
    """
    now = time.time()

    if icao24 not in _filters:
        _filters[icao24] = _init_filter(lat, lon)
        return lat, lon

    kf = _filters[icao24]
    dt = now - kf["last_time"]
    kf["last_time"] = now

    if dt <= 0:
        dt = 10.0  # Default to 10s if timing is off

    # State transition: position += velocity * dt
    F = np.array([
        [1, 0, dt,  0],
        [0, 1,  0, dt],
        [0, 0,  1,  0],
        [0, 0,  0,  1],
    ], dtype=float)

    H = kf["H"]
    R = kf["R"]
    Q = kf["Q"] * dt  # Scale process noise by time step

    # --- Predict Step ---
    x_pred = F @ kf["x"]
    P_pred = F @ kf["P"] @ F.T + Q

    # --- Update Step ---
    z = np.array([lat, lon])  # Measurement
    y = z - H @ x_pred        # Innovation (measurement residual)
    S = H @ P_pred @ H.T + R  # Innovation covariance
    K = P_pred @ H.T @ np.linalg.inv(S)  # Kalman gain

    kf["x"] = x_pred + K @ y
    kf["P"] = (np.eye(4) - K @ H) @ P_pred

    smoothed_lat = float(kf["x"][0])
    smoothed_lon = float(kf["x"][1])
    return smoothed_lat, smoothed_lon


def predict_position(icao24: str, seconds_ahead: float = 5.0) -> Tuple[float, float]:
    """
    Predict an aircraft's position `seconds_ahead` from now using current velocity.
    Useful for interpolating marker movement between OpenSky updates.
    """
    if icao24 not in _filters:
        return None, None

    kf = _filters[icao24]
    lat  = kf["x"][0] + kf["x"][2] * seconds_ahead
    lon  = kf["x"][1] + kf["x"][3] * seconds_ahead
    return float(lat), float(lon)


def cleanup_stale_filters(max_age_seconds: int = 60):
    """Remove Kalman filters for aircraft not seen recently."""
    now = time.time()
    stale = [k for k, v in _filters.items() if now - v["last_time"] > max_age_seconds]
    for k in stale:
        del _filters[k]
