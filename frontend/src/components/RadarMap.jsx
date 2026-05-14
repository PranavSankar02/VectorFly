/**
 * RadarMap.jsx
 * Center panel: Mapbox GL map acting as an ATC radar display.
 * - Dark radar-style map style
 * - Aircraft markers rendered as SVG plane icons rotated to heading
 * - Selected aircraft highlighted in amber
 * - Smooth position interpolation between OpenSky updates
 * - Radar sweep animation overlay
 * - Shows conflict range rings for selected aircraft
 */

import React, { useEffect, useRef, useCallback } from 'react'
import * as maptilersdk from '@maptiler/sdk'
import '@maptiler/sdk/dist/maptiler-sdk.css'

const MAPTILER_TOKEN = import.meta.env.VITE_MAPTILER_API_KEY || ''

// Aircraft SVG icon — simple plane silhouette, pointing north (up)
function makeAircraftSVG(heading, selected, onGround) {
    const color = selected ? '#ffb703' : onGround ? '#4a7a85' : '#00ff88'
    const glow = selected ? '#ffb703' : '#00ff88'
    const scale = selected ? 1.4 : 1.0
    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${24 * scale}" height="${24 * scale}" viewBox="0 0 24 24">
      <filter id="glow">
        <feGaussianBlur stdDeviation="1.5" result="coloredBlur"/>
        <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <g transform="rotate(${heading}, 12, 12)" filter="url(#glow)">
        <path d="M12 2 L15 10 L22 12 L15 14 L14 20 L12 18 L10 20 L9 14 L2 12 L9 10 Z"
              fill="${color}" opacity="${onGround ? 0.5 : 1}" />
      </g>
    </svg>
  `
    return svg
}

function svgToBlob(svgString) {
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString.trim())
}

export default function RadarMap({ aircraft, selectedId, onSelect }) {
    const mapContainer = useRef(null)
    const map = useRef(null)
    const markers = useRef({})   // icao24 -> maptilersdk.Marker
    const prevAircraft = useRef({})

    // Initialize MapTiler map
    useEffect(() => {
        if (!MAPTILER_TOKEN || MAPTILER_TOKEN === 'MTkVxmx5OKpaAdcoTyJJ') {
            return // Will show placeholder
        }

        maptilersdk.config.apiKey = MAPTILER_TOKEN

        map.current = new maptilersdk.Map({
            container: mapContainer.current,
            style: maptilersdk.MapStyle.DATAVIZ.DARK,
            center: [0, 20],
            zoom: 2,
            attributionControl: false,
        })

        map.current.addControl(new maptilersdk.NavigationControl({ showCompass: true }), 'bottom-right')
        map.current.addControl(new maptilersdk.ScaleControl(), 'bottom-left')

        return () => {
            Object.values(markers.current).forEach(m => m.remove())
            markers.current = {}
            map.current.remove()
        }
    }, []) // eslint-disable-line

    // Update markers when aircraft data changes
    useEffect(() => {
        if (!map.current || !MAPTILER_TOKEN || MAPTILER_TOKEN === 'MTkVxmx5OKpaAdcoTyJJ') return

        const current = new Set(Object.keys(aircraft))
        const existing = new Set(Object.keys(markers.current))

        // Remove stale markers
        for (const icao of existing) {
            if (!current.has(icao)) {
                markers.current[icao].remove()
                delete markers.current[icao]
            }
        }

        // Add / update markers
        for (const [icao, ac] of Object.entries(aircraft)) {
            if (!ac.longitude || !ac.latitude) continue

            const selected = icao === selectedId

            if (markers.current[icao]) {
                // Update position with smooth LngLat transition
                markers.current[icao].setLngLat([ac.longitude, ac.latitude])

                // Update icon if selection or heading changed
                const prev = prevAircraft.current[icao]
                if (!prev || prev.heading !== ac.heading || (icao === selectedId) !== (prev._selected)) {
                    const el = markers.current[icao].getElement()
                    const img = el.querySelector('img')
                    if (img) img.src = svgToBlob(makeAircraftSVG(ac.heading, selected, ac.on_ground))
                    ac._selected = selected
                }
            } else {
                // Create new marker
                const el = document.createElement('div')
                el.className = `aircraft-marker${selected ? ' selected' : ''}`
                el.style.cursor = 'pointer'

                // Label
                const label = document.createElement('div')
                label.className = 'callsign-label'
                label.textContent = ac.callsign
                el.appendChild(label)

                // Plane icon
                const img = document.createElement('img')
                img.src = svgToBlob(makeAircraftSVG(ac.heading, selected, ac.on_ground))
                img.style.display = 'block'
                el.appendChild(img)

                el.addEventListener('click', (e) => {
                    e.stopPropagation()
                    onSelect(icao)
                })

                const marker = new maptilersdk.Marker({ element: el, anchor: 'center' })
                    .setLngLat([ac.longitude, ac.latitude])
                    .addTo(map.current)

                markers.current[icao] = marker
                ac._selected = selected
            }
        }

        prevAircraft.current = { ...aircraft }
    }, [aircraft, selectedId, onSelect])

    // Fly to selected aircraft
    useEffect(() => {
        if (!map.current || !selectedId || !aircraft[selectedId]) return
        const ac = aircraft[selectedId]
        map.current.flyTo({
            center: [ac.longitude, ac.latitude],
            zoom: Math.max(map.current.getZoom(), 6),
            duration: 1200,
            essential: true,
        })
    }, [selectedId]) // eslint-disable-line

    const noToken = !MAPTILER_TOKEN || MAPTILER_TOKEN === 'MTkVxmx5OKpaAdcoTyJJ'

    return (
        <div className="map-panel" style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
            {noToken ? (
                <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    height: '100%', gap: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '30px'
                }}>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                        <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
                        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                    </svg>
                    <div>
                        <div style={{ color: 'var(--accent-amber)', fontFamily: 'var(--font-mono)', fontSize: '12px', marginBottom: '6px' }}>
                            MAPTILER API KEY REQUIRED
                        </div>
                        <div style={{ fontSize: '11px' }}>
                            Add your token to <code style={{ color: 'var(--accent-green)' }}>frontend/.env</code><br />
                            <code style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>VITE_MAPTILER_API_KEY=your_key_here</code>
                        </div>
                    </div>
                </div>
            ) : (
                <>
                    <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
                    <div className="scanlines" />
                    <div className="radar-border" />
                    <div className="map-controls">
                        <div className="map-stat">
                            ✦ {Object.keys(aircraft).length} TRACKED
                        </div>
                        <div className="map-stat">
                            ⊙ RADAR LIVE
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}
