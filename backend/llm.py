"""
llm.py — LLM Orchestrator (Google Gemini)
Formats agent outputs and aircraft telemetry into a structured ATC prompt,
then calls Gemini to generate natural-language ATC recommendations.
"""

import os
import json
from typing import List
from dotenv import load_dotenv
from google import genai

load_dotenv()

_client = None


def _get_client():
    global _client
    if _client is None:
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key or api_key == "AIzaSyAqriAeJJ8vs_mhwpg_XhsIi2IWzxkgZDU":
            return None
        _client = genai.Client(api_key=api_key)
    return _client


SYSTEM_PROMPT = """You are an expert AI Air Traffic Controller assistant.
You analyze live aircraft telemetry data, conflict alerts, and anomaly reports,
then provide precise, professional ATC recommendations.

Your responses must:
1. Be concise and prioritized by severity (CRITICAL → WARNING → INFO)
2. Use proper ATC phraseology where appropriate
3. Give specific actionable headings, altitudes, or speeds when relevant
4. Always consider the safety of ALL aircraft in the vicinity

Format your response as valid JSON with this structure:
{
  "summary": "One-sentence overall assessment",
  "recommendations": [
    {
      "severity": "CRITICAL|WARNING|INFO",
      "action": "Short action title",
      "detail": "Detailed instruction",
      "target": "Aircraft callsign or 'ALL'"
    }
  ]
}"""


def _build_prompt(aircraft: dict, conflicts: List[dict], anomalies: List[dict]) -> str:
    """Build the prompt sent to Gemini from agent outputs."""
    callsign = aircraft.get("callsign", aircraft.get("icao24", "UNKNOWN"))

    telemetry = f"""
SELECTED AIRCRAFT TELEMETRY:
- Callsign: {aircraft.get('callsign')}
- ICAO24: {aircraft.get('icao24')}
- Origin: {aircraft.get('origin_country')}
- Position: {aircraft.get('latitude'):.4f}°, {aircraft.get('longitude'):.4f}°
- Altitude: {aircraft.get('altitude_ft')} ft
- Airspeed: {aircraft.get('velocity_kts')} kts
- Heading: {aircraft.get('heading')}°
- Vertical Rate: {aircraft.get('vertical_rate_fpm')} fpm
- On Ground: {aircraft.get('on_ground')}
- Squawk: {aircraft.get('squawk') or 'N/A'}
"""

    conflict_section = ""
    if conflicts:
        conflict_section = "\nCONFLICT ALERTS:\n"
        for c in conflicts:
            conflict_section += f"  - {c['message']}\n"
    else:
        conflict_section = "\nCONFLICT ALERTS: None detected\n"

    anomaly_section = ""
    if anomalies:
        anomaly_section = "\nANOMALY ALERTS:\n"
        for a in anomalies:
            anomaly_section += f"  - [{a['severity']}] {a['message']}\n"
    else:
        anomaly_section = "\nANOMALY ALERTS: None detected\n"

    return f"{telemetry}{conflict_section}{anomaly_section}\nProvide ATC recommendations as JSON."


async def get_recommendations(
    aircraft: dict,
    conflicts: List[dict],
    anomalies: List[dict]
) -> dict:
    """
    Call Gemini with telemetry + agent outputs.
    Returns a structured recommendations dict.
    Falls back to agent-only output if Gemini is unavailable.
    """
    client = _get_client()

    fallback = _build_fallback_response(aircraft, conflicts, anomalies)

    if not client:
        return fallback

    try:
        prompt = _build_prompt(aircraft, conflicts, anomalies)
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=prompt,
            config={
                "system_instruction": SYSTEM_PROMPT,
                "temperature": 0.3,
                "max_output_tokens": 1024,
            }
        )

        text = response.text.strip()
        # Strip markdown code fences if present
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]

        result = json.loads(text)
        result["source"] = "gemini"
        return result

    except Exception as e:
        print(f"[LLM] Gemini error: {e}")
        return fallback


def _build_fallback_response(aircraft: dict, conflicts: List[dict], anomalies: List[dict]) -> dict:
    """
    Build a structured response from agent outputs alone (no LLM).
    Used when Gemini API key is not configured or call fails.
    """
    recs = []

    for c in conflicts:
        recs.append({
            "severity": "CRITICAL",
            "action": "Separation Alert",
            "detail": c["message"],
            "target": f"{c['aircraft_1']} / {c['aircraft_2']}"
        })

    for a in anomalies:
        recs.append({
            "severity": a.get("severity", "WARNING"),
            "action": a["type"].replace("_", " ").title(),
            "detail": a["message"],
            "target": aircraft.get("callsign", "UNKNOWN")
        })

    if not recs:
        recs.append({
            "severity": "INFO",
            "action": "Normal Operations",
            "detail": f"{aircraft.get('callsign')} operating normally. No conflicts or anomalies detected.",
            "target": aircraft.get("callsign", "UNKNOWN")
        })

    return {
        "summary": f"Analysis for {aircraft.get('callsign')}: {len(conflicts)} conflict(s), {len(anomalies)} anomaly(ies).",
        "recommendations": recs,
        "source": "agents-only"
    }
