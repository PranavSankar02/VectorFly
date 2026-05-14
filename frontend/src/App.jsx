/**
 * App.jsx — Main ATC Dashboard
 * Manages:
 *  - WebSocket connection to FastAPI backend
 *  - Aircraft state (dict: icao24 -> aircraft)
 *  - Selected flight and telemetry
 *  - 4-panel layout: FlightList | RadarMap | AIPanel | DetailsPanel
 */

import React, { useState, useEffect, useRef, useCallback } from 'react'
import FlightList from './components/FlightList'
import RadarMap from './components/RadarMap'
import AIPanel from './components/AIPanel'
import DetailsPanel from './components/DetailsPanel'
import { Radio } from 'lucide-react'

const WS_URL = import.meta.env.VITE_BACKEND_WS || 'ws://localhost:8000/ws'

function useAircraftWebSocket(query, location, locationPermitted) {
    const [aircraft, setAircraft] = useState({})
    const [connected, setConnected] = useState(false)
    const [lastUpdate, setLastUpdate] = useState(null)
    const wsRef = useRef(null)
    const reconnectTimer = useRef(null)

    const queryRef = useRef(query)
    const locationRef = useRef(location)

    useEffect(() => {
        queryRef.current = query
        locationRef.current = location
    }, [query, location])

    const sendSubscription = useCallback(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                type: 'subscribe',
                query: query || '',
                lat: location?.lat || null,
                lon: location?.lon || null
            }))
        }
    }, [query, location])

    const connect = useCallback(() => {
        if (!locationPermitted) return
        if (wsRef.current?.readyState === WebSocket.OPEN) return

        const ws = new WebSocket(WS_URL)
        wsRef.current = ws

        ws.onopen = () => {
            setConnected(true)
            console.log('[WS] Connected to ATC backend')
            ws.send(JSON.stringify({
                type: 'subscribe',
                query: queryRef.current || '',
                lat: locationRef.current?.lat || null,
                lon: locationRef.current?.lon || null
            }))
        }

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data)
                if (msg.type === 'aircraft_update') {
                    const dict = {}
                    for (const ac of msg.data) {
                        dict[ac.icao24] = ac
                    }
                    setAircraft(dict)
                    setLastUpdate(new Date())
                }
            } catch (e) {
                console.error('[WS] Parse error:', e)
            }
        }

        ws.onclose = () => {
            setConnected(false)
            console.log('[WS] Disconnected — reconnecting in 5s...')
            reconnectTimer.current = setTimeout(connect, 5000)
        }

        ws.onerror = (e) => {
            console.error('[WS] Error:', e)
            ws.close()
        }
    }, [locationPermitted])

    useEffect(() => {
        connect()
        return () => {
            clearTimeout(reconnectTimer.current)
            if (wsRef.current) wsRef.current.close()
        }
    }, [connect])

    useEffect(() => {
        if (connected) {
            sendSubscription()
        }
    }, [query, location, connected, sendSubscription])

    return { aircraft, connected, lastUpdate }
}

function useClock() {
    const [time, setTime] = useState(new Date())
    useEffect(() => {
        const t = setInterval(() => setTime(new Date()), 1000)
        return () => clearInterval(t)
    }, [])
    return time
}

export default function App() {
    const [query, setQuery] = useState('')
    const [location, setLocation] = useState(null)
    const [locationPermitted, setLocationPermitted] = useState(false)

    useEffect(() => {
        navigator.geolocation.getCurrentPosition(
            pos => {
                setLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude })
                setLocationPermitted(true)
            },
            err => {
                console.log('Geolocation error:', err)
                setLocationPermitted(true) // Proceed with global fallback
            }
        )
    }, [])

    const { aircraft, connected, lastUpdate } = useAircraftWebSocket(query, location, locationPermitted)
    const [selectedId, setSelectedId] = useState(null)
    const utcTime = useClock()

    const selectedAircraft = selectedId ? aircraft[selectedId] ?? null : null

    const handleSelect = useCallback((icao24) => {
        setSelectedId(prev => prev === icao24 ? null : icao24)
    }, [])

    return (
        <div className="atc-shell">
            {/* ── Header ── */}
            <header className="atc-header">
                <div className="atc-header__logo">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <circle cx="12" cy="12" r="4" />
                        <line x1="12" y1="2" x2="12" y2="5" />
                        <line x1="12" y1="19" x2="12" y2="22" />
                        <line x1="2" y1="12" x2="5" y2="12" />
                        <line x1="19" y1="12" x2="22" y2="12" />
                    </svg>
                    ATC AI — AIR TRAFFIC CONTROL
                </div>
                <div className="atc-header__status">
                    {!locationPermitted && <span style={{ color: 'var(--accent-amber)', marginRight: '10px' }}>WAITING FOR LOCATION...</span>}
                    <span className={`status-dot ${connected ? '' : 'offline'}`} />
                    {connected ? 'OPENSKY CONNECTED' : 'CONNECTING...'}
                    <span style={{ color: 'var(--border-bright)' }}>|</span>
                    <span><Radio size={11} style={{ display: 'inline', marginRight: 4 }} />
                        {Object.keys(aircraft).length} AIRCRAFT
                    </span>
                    {lastUpdate && (
                        <>
                            <span style={{ color: 'var(--border-bright)' }}>|</span>
                            <span>UPD {lastUpdate.toLocaleTimeString()}</span>
                        </>
                    )}
                </div>
                <div className="atc-header__time">
                    {utcTime.toUTCString().slice(17, 25)} UTC
                </div>
            </header>

            {/* ── Main Body ── */}
            <main className="atc-body">
                {/* Left: Flight List */}
                <div className="panel panel-left">
                    <FlightList
                        aircraft={aircraft}
                        selectedId={selectedId}
                        onSelect={handleSelect}
                        query={query}
                        onSearch={setQuery}
                    />
                </div>

                {/* Center: Radar Map */}
                <RadarMap
                    aircraft={aircraft}
                    selectedId={selectedId}
                    onSelect={handleSelect}
                />

                {/* Right: AI Panel */}
                <div className="panel panel-right">
                    <AIPanel selectedAircraft={selectedAircraft} />
                </div>
            </main>

            {/* ── Bottom: Details Panel ── */}
            <div className="panel panel-bottom">
                <div className="panel__header" style={{ minWidth: '120px', borderBottom: 'none', borderRight: '1px solid var(--border)' }}>
                    <span className="panel__title">Telemetry</span>
                    {selectedAircraft && (
                        <span className="panel__badge">{selectedAircraft.callsign}</span>
                    )}
                </div>
                <DetailsPanel aircraft={selectedAircraft} />
            </div>
        </div>
    )
}
