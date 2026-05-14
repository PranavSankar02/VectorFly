/**
 * FlightList.jsx
 * Left panel: scrollable, searchable list of all tracked aircraft.
 * Shows callsign, altitude, speed, heading indicator, airborne/ground status.
 */

import React, { useMemo } from 'react'

function compassArrow(heading) {
    // Returns a Unicode arrow closest to the aircraft heading
    const dirs = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖']
    return dirs[Math.round(heading / 45) % 8]
}

function altColor(alt_ft) {
    if (alt_ft > 30000) return 'green'
    if (alt_ft > 10000) return ''
    return 'amber'
}

export default function FlightList({ aircraft, selectedId, onSelect, query, onSearch }) {
    const list = useMemo(() => {
        const arr = Object.values(aircraft)
        // Filtering is now handled by the backend! We just sort by altitude here.
        return arr.sort((a, b) => b.altitude_ft - a.altitude_ft)
    }, [aircraft])

    return (
        <>
            <div className="panel__header">
                <span className="panel__title">Flights</span>
                <span className="panel__badge">{list.length}</span>
            </div>

            <div className="flight-search">
                <input
                    type="text"
                    placeholder="Search callsign / ICAO..."
                    value={query}
                    onChange={e => onSearch(e.target.value)}
                    id="flight-search-input"
                />
            </div>

            <div className="panel__content">
                {list.length === 0 && (
                    <div style={{ padding: '20px', color: 'var(--text-muted)', textAlign: 'center', fontSize: '11px' }}>
                        {Object.keys(aircraft).length === 0
                            ? 'Waiting for ATC data...'
                            : 'No matches found'}
                    </div>
                )}
                {list.map(ac => (
                    <div
                        key={ac.icao24}
                        className={`flight-item ${selectedId === ac.icao24 ? 'selected' : ''}`}
                        onClick={() => onSelect(ac.icao24)}
                        id={`flight-${ac.icao24}`}
                    >
                        <div>
                            <div className="flight-callsign">{ac.callsign}</div>
                            <div className="flight-sub">
                                <span className={`flight-alt ${altColor(ac.altitude_ft)}`}>
                                    {ac.on_ground ? 'GND' : `${ac.altitude_ft.toLocaleString()} ft`}
                                </span>
                                <span style={{ color: 'var(--border-bright)' }}>·</span>
                                <span className="flight-speed">{ac.velocity_kts} kts</span>
                                <span style={{ color: 'var(--border-bright)' }}>·</span>
                                <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>{ac.origin_country}</span>
                            </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                            <span className={`flight-status ${ac.on_ground ? 'ground' : 'airborne'}`}>
                                {ac.on_ground ? 'GND' : 'AIR'}
                            </span>
                            <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                                {compassArrow(ac.heading)}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </>
    )
}
