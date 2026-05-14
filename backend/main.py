"""
main.py — FastAPI ATC Backend
Provides:
  GET  /api/states             — Current aircraft states (JSON)
  GET  /api/recommendations/{icao24} — AI recommendations for a flight
  WS   /ws                     — Live aircraft state stream (JSON, custom interval)
"""

import asyncio
import json
import time
import math
import random
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

import opensky
import kalman
import agents
import llm

def haversine_dist(lat1, lon1, lat2, lon2):
    if lat1 is None or lon1 is None or lat2 is None or lon2 is None: return float('inf')
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

class Connection:
    def __init__(self, ws: WebSocket):
        self.ws = ws
        self.lat = None
        self.lon = None
        self.query = ""
        self.last_send_time = 0.0
        self.takeoff_icao24s = set()

class ConnectionManager:
    def __init__(self):
        self.active: dict[WebSocket, Connection] = {}

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active[ws] = Connection(ws)
        print(f"[WS] Client connected. Total: {len(self.active)}")

    def disconnect(self, ws: WebSocket):
        self.active.pop(ws, None)
        print(f"[WS] Client disconnected. Total: {len(self.active)}")

    async def process_message(self, ws: WebSocket, message: str):
        try:
            data = json.loads(message)
            if data.get("type") == "subscribe":
                conn = self.active[ws]
                conn.lat = data.get("lat")
                conn.lon = data.get("lon")
                conn.query = data.get("query", "").strip().lower()
                conn.takeoff_icao24s.clear()
                conn.last_send_time = 0 
                print(f"[WS] Subscription updated: query='{conn.query}', lat={conn.lat}, lon={conn.lon}")
        except Exception as e:
            print(f"[WS] Error parsing message: {e}")

manager = ConnectionManager()

async def broadcast_loop():
    while True:
        await asyncio.sleep(1)
        now = time.time()
        states = opensky.get_cached_states()
        if not states: continue

        dead = set()
        # Use list() to avoid RuntimeError if dict changes during iteration
        for ws, conn in list(manager.active.items()):
            interval = 7 if conn.query else 10
            if now - conn.last_send_time >= interval:
                conn.last_send_time = now
                filtered = {}
                
                if conn.query:
                    # Search mode
                    for icao, ac in states.items():
                        if conn.query in ac.get("callsign", "").lower() or conn.query in icao:
                            filtered[icao] = ac
                    print(f"[WS] Search for '{conn.query}' found {len(filtered)} flights")
                else:
                    # Takeoff mode
                    valid_icao24s = []
                    for icao, ac in states.items():
                        if ac["altitude_ft"] < 10000 and ac["vertical_rate_ms"] > 0:
                            if conn.lat is not None and conn.lon is not None:
                                dist = haversine_dist(conn.lat, conn.lon, ac["latitude"], ac["longitude"])
                                if dist < 1000:
                                    valid_icao24s.append(icao)
                            else:
                                valid_icao24s.append(icao) # global fallback
                    
                    # If we don't have enough local flights, fallback to global
                    if len(valid_icao24s) < 5 and conn.lat is not None:
                        for icao, ac in states.items():
                            if ac["altitude_ft"] < 10000 and ac["vertical_rate_ms"] > 0:
                                if icao not in valid_icao24s:
                                    valid_icao24s.append(icao)

                    # Update tracked takeoff list
                    conn.takeoff_icao24s = {i for i in conn.takeoff_icao24s if i in valid_icao24s}
                    needed = 5 - len(conn.takeoff_icao24s)
                    if needed > 0:
                        available = [i for i in valid_icao24s if i not in conn.takeoff_icao24s]
                        random.shuffle(available)
                        conn.takeoff_icao24s.update(available[:needed])

                    for icao in conn.takeoff_icao24s:
                        filtered[icao] = states[icao]
                    print(f"[WS] Takeoff mode sent {len(filtered)} flights")

                # Apply kalman filtering
                smoothed = {}
                for icao, ac in filtered.items():
                    s_lat, s_lon = kalman.update_aircraft(icao, ac["latitude"], ac["longitude"])
                    smoothed[icao] = {**ac, "latitude": s_lat, "longitude": s_lon}

                kalman.cleanup_stale_filters()

                payload = json.dumps({
                    "type": "aircraft_update",
                    "count": len(smoothed),
                    "data": list(smoothed.values())
                })
                try:
                    await ws.send_text(payload)
                except Exception:
                    dead.add(ws)

        for ws in dead:
            manager.disconnect(ws)

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[ATC] Starting OpenSky poller and WebSocket broadcaster...")
    task1 = asyncio.create_task(opensky.start_polling(interval_seconds=10))
    task2 = asyncio.create_task(broadcast_loop())
    yield
    task1.cancel()
    task2.cancel()

app = FastAPI(
    title="ATC AI Backend",
    description="Real-time ATC system powered by OpenSky Network + Gemini AI",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/states")
async def get_states():
    states = opensky.get_cached_states()
    return {"count": len(states), "data": list(states.values())}

@app.get("/api/recommendations/{icao24}")
async def get_recommendations(icao24: str):
    states = opensky.get_cached_states()
    aircraft = states.get(icao24.lower())
    if not aircraft:
        return {"error": f"Aircraft {icao24} not found in current data.", "summary": "Aircraft not tracked.", "recommendations": []}

    all_conflicts  = agents.conflict_agent.detect(states)
    nearby_conflicts = agents.conflict_agent.get_nearby_conflicts(icao24.lower(), all_conflicts)
    anomalies = agents.anomaly_agent.analyze(aircraft)
    result = await llm.get_recommendations(aircraft, nearby_conflicts, anomalies)
    result["icao24"] = icao24
    result["callsign"] = aircraft.get("callsign")
    result["conflicts_total"] = len(all_conflicts)
    result["anomalies"] = anomalies
    return result

@app.get("/api/health")
async def health():
    states = opensky.get_cached_states()
    return {"status": "ok", "tracked_aircraft": len(states)}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            await manager.process_message(websocket, data)
    except WebSocketDisconnect:
        manager.disconnect(websocket)
