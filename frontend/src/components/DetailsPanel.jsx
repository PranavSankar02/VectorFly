/**
 * DetailsPanel.jsx
 * Bottom panel: full telemetry readout for the selected aircraft.
 * Shows position, altitude, speed, heading, vertical rate, squawk code.
 */

import React from 'react'
import { Plane, Radio, Compass, Gauge, ArrowUpDown, MapPin } from 'lucide-react'

const EMERGENCY_SQUAWKS = new Set(['7500', '7600', '7700'])
const SQUAWK_MEANINGS = {
    '7500': 'HIJACKING',
    '7600': 'RADIO FAIL',
    '7700': 'EMERGENCY',
}

function TelemetryItem({ label, value, unit, colorClass }) {
    return (
        <div className="telem-item">
            <div className="telem-label">{label}</div>
            <div className={`telem-value ${colorClass || ''}`}>
                {value}
                {unit && <span className="telem-unit"> {unit}</span>}
            </div>
        </div>
    )
}

export default function DetailsPanel({ aircraft }) {
    if (!aircraft) {
        return (
            <div className="details-placeholder">
                <Plane size={18} style={{ opacity: 0.3 }} />
                SELECT A FLIGHT TO VIEW TELEMETRY
            </div>
        )
    }

    const sq = String(aircraft.squawk || '')
    const isEmergency = EMERGENCY_SQUAWKS.has(sq)
    const vr = aircraft.vertical_rate_fpm
    const vrColor = Math.abs(vr) > 2000 ? 'red' : vr > 100 ? 'green' : vr < -100 ? 'amber' : ''

    return (
        <div className="details-panel">
            {/* Identity */}
            <div className="details-section" style={{ minWidth: '160px', maxWidth: '200px' }}>
                <h4><Plane size={10} style={{ display: 'inline', marginRight: 4 }} />Identity</h4>
                <div style={{ marginBottom: '8px' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '22px', fontWeight: 700, color: 'var(--accent-green)' }}>
                        {aircraft.callsign}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                        {aircraft.icao24.toUpperCase()}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        {aircraft.origin_country}
                    </div>
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <MapPin size={10} />
                    {aircraft.on_ground
                        ? <span style={{ color: 'var(--accent-amber)' }}>ON GROUND</span>
                        : <span style={{ color: 'var(--accent-blue)' }}>AIRBORNE</span>}
                </div>
            </div>

            {/* Altitude & Speed */}
            <div className="details-section">
                <h4><Gauge size={10} style={{ display: 'inline', marginRight: 4 }} />Performance</h4>
                <div className="telemetry-grid">
                    <TelemetryItem
                        label="Altitude"
                        value={aircraft.altitude_ft.toLocaleString()}
                        unit="ft"
                        colorClass={aircraft.altitude_ft > 30000 ? 'green' : aircraft.altitude_ft > 10000 ? '' : 'amber'}
                    />
                    <TelemetryItem
                        label="Altitude"
                        value={(aircraft.altitude_m).toFixed(0)}
                        unit="m"
                    />
                    <TelemetryItem
                        label="Airspeed"
                        value={aircraft.velocity_kts}
                        unit="kts"
                        colorClass={aircraft.velocity_kts < 50 && !aircraft.on_ground ? 'red' : ''}
                    />
                    <TelemetryItem
                        label="Airspeed"
                        value={(aircraft.velocity_ms).toFixed(1)}
                        unit="m/s"
                    />
                </div>
            </div>

            {/* Navigation */}
            <div className="details-section">
                <h4><Compass size={10} style={{ display: 'inline', marginRight: 4 }} />Navigation</h4>
                <div className="telemetry-grid">
                    <TelemetryItem label="Heading" value={`${aircraft.heading}°`} />
                    <TelemetryItem
                        label="Vert Rate"
                        value={`${vr > 0 ? '+' : ''}${vr}`}
                        unit="fpm"
                        colorClass={vrColor}
                    />
                    <TelemetryItem
                        label="Latitude"
                        value={aircraft.latitude.toFixed(4)}
                        unit="°"
                    />
                    <TelemetryItem
                        label="Longitude"
                        value={aircraft.longitude.toFixed(4)}
                        unit="°"
                    />
                </div>
            </div>

            {/* Squawk */}
            <div className="details-section" style={{ minWidth: '120px', maxWidth: '150px' }}>
                <h4><Radio size={10} style={{ display: 'inline', marginRight: 4 }} />Transponder</h4>
                <div style={{ marginBottom: '8px' }}>
                    <div className={`squawk-badge ${isEmergency ? 'emergency' : ''}`}>
                        {sq || '----'}
                    </div>
                    {isEmergency && (
                        <div style={{ marginTop: '6px', fontSize: '10px', color: 'var(--accent-red)', fontWeight: 700, letterSpacing: '1px' }}>
                            ⚠ {SQUAWK_MEANINGS[sq]}
                        </div>
                    )}
                    {!isEmergency && sq === '7000' && (
                        <div style={{ marginTop: '4px', fontSize: '9px', color: 'var(--text-muted)' }}>VFR</div>
                    )}
                </div>
            </div>
        </div>
    )
}
