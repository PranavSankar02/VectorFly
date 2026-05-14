/**
 * AIPanel.jsx
 * Right panel: fetches and displays AI agent recommendations for the selected aircraft.
 * Shows severity-categorized recommendation cards (CRITICAL / WARNING / INFO).
 * Powered by backend conflict + anomaly agents, optionally Gemini LLM.
 */

import React, { useState, useEffect, useCallback } from 'react'
import { Brain, AlertTriangle, Info, Zap, RefreshCw } from 'lucide-react'

const SEV_ICONS = {
    CRITICAL: <AlertTriangle size={11} />,
    WARNING: <Zap size={11} />,
    INFO: <Info size={11} />,
}

const BACKEND = import.meta.env.VITE_BACKEND_HTTP || 'http://localhost:8000'

export default function AIPanel({ selectedAircraft }) {
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [lastFetch, setLastFetch] = useState(null)

    const fetchRecommendations = useCallback(async (icao24) => {
        setLoading(true)
        setError(null)
        try {
            const res = await fetch(`${BACKEND}/api/recommendations/${icao24}`)
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const json = await res.json()
            setData(json)
            setLastFetch(new Date())
        } catch (e) {
            setError(e.message)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        if (!selectedAircraft) {
            setData(null)
            return
        }
        fetchRecommendations(selectedAircraft.icao24)

        // Auto-refresh every 15 seconds while selected
        const interval = setInterval(() => {
            fetchRecommendations(selectedAircraft.icao24)
        }, 15_000)
        return () => clearInterval(interval)
    }, [selectedAircraft?.icao24, fetchRecommendations])

    if (!selectedAircraft) {
        return (
            <>
                <div className="panel__header">
                    <span className="panel__title">AI Analysis</span>
                    <Brain size={13} style={{ color: 'var(--accent-green)', opacity: 0.6 }} />
                </div>
                <div className="ai-placeholder">
                    <Brain size={32} />
                    <div>Select a flight to run<br />AI conflict & anomaly analysis</div>
                </div>
            </>
        )
    }

    return (
        <>
            <div className="panel__header">
                <span className="panel__title">AI Analysis</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {data?.source === 'gemini' && (
                        <span style={{ fontSize: '9px', color: 'var(--accent-blue)', fontFamily: 'var(--font-mono)' }}>
                            ✦ GEMINI
                        </span>
                    )}
                    <button
                        onClick={() => fetchRecommendations(selectedAircraft.icao24)}
                        style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: 'var(--text-muted)', padding: '2px',
                            display: 'flex', alignItems: 'center'
                        }}
                        title="Refresh recommendations"
                    >
                        <RefreshCw size={11} />
                    </button>
                </div>
            </div>

            <div className="ai-status-bar">
                <span className="pulse" />
                ANALYZING: <span style={{ color: 'var(--accent-green)' }}>{selectedAircraft.callsign}</span>
                {lastFetch && (
                    <span style={{ marginLeft: 'auto' }}>
                        {lastFetch.toLocaleTimeString()}
                    </span>
                )}
            </div>

            <div className="panel__content">
                {loading && (
                    <div className="ai-loading">
                        <div className="spinner" />
                        Running agents...
                    </div>
                )}

                {error && (
                    <div style={{ padding: '12px', color: 'var(--accent-red)', fontSize: '11px' }}>
                        ⚠ Error: {error}
                    </div>
                )}

                {data && !loading && (
                    <>
                        <div className="ai-summary">{data.summary}</div>

                        {data.conflicts_total > 0 && (
                            <div style={{
                                margin: '8px 10px',
                                padding: '6px 10px',
                                background: 'rgba(255,56,96,0.08)',
                                border: '1px solid rgba(255,56,96,0.25)',
                                borderRadius: '6px',
                                fontSize: '10px',
                                color: 'var(--accent-red)',
                                fontFamily: 'var(--font-mono)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                            }}>
                                <AlertTriangle size={10} />
                                {data.conflicts_total} airspace conflict(s) detected in sector
                            </div>
                        )}

                        {(data.recommendations || []).map((rec, i) => (
                            <div key={i} className={`rec-card sev-${rec.severity}`}>
                                <div className="rec-card__header">
                                    {SEV_ICONS[rec.severity]}
                                    {rec.severity} — {rec.action}
                                </div>
                                <div className="rec-card__body">
                                    {rec.detail}
                                    <div className="rec-card__target">→ {rec.target}</div>
                                </div>
                            </div>
                        ))}

                        {data.anomalies?.length > 0 && (
                            <div style={{ padding: '6px 10px 4px', fontSize: '9px', color: 'var(--text-muted)', letterSpacing: '1px', textTransform: 'uppercase' }}>
                                Raw Anomaly Flags
                            </div>
                        )}
                        {(data.anomalies || []).map((a, i) => (
                            <div key={i} style={{
                                margin: '2px 10px',
                                padding: '5px 10px',
                                background: 'rgba(255,183,3,0.04)',
                                border: '1px solid rgba(255,183,3,0.12)',
                                borderRadius: '5px',
                                fontSize: '10px',
                                color: 'var(--text-secondary)',
                            }}>
                                [{a.severity}] {a.type.replace(/_/g, ' ')}
                            </div>
                        ))}
                    </>
                )}
            </div>
        </>
    )
}
