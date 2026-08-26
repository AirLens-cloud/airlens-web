/**
 * DataProbe — temporary, unstyled verification page.
 *
 * Fetches each ported data feed for real and reports OK/failed, a timestamp,
 * and a few sample values as plain HTML. No design system yet (DESIGN.md:
 * "UI는 최소한의 무스타일 검증 페이지만") — this page exists to prove the ported
 * data layer talks to the live HF dataset / CDN, and gets replaced once the
 * real UI lands.
 */
import { useEffect, useState } from 'react'
import { fetchAQGrid } from '../api/airQualityGrid'
import { fetchWindField } from '../api/weather'
import { fetchGlobalGridSnapshot } from '../api/gridSnapshot'
import { fetchTimelineManifest } from '../api/timeline'
import { fetchForecast } from '../lib/today/forecastSource'
import { useDataHealth } from '../hooks/useDataHealth'
import { useDataHealthStore } from '../store/dataHealthStore'

type ProbeStatus = 'pending' | 'ok' | 'failed'

interface ProbeResult {
  label: string
  status: ProbeStatus
  timestamp: string | null
  samples: string[]
  error?: string
}

function isoOrNull(ms: number | null | undefined): string | null {
  return typeof ms === 'number' && Number.isFinite(ms) ? new Date(ms).toISOString() : null
}

async function probeGrid(): Promise<ProbeResult> {
  try {
    const grid = await fetchAQGrid('pm25')
    if (!grid) return { label: 'PM2.5 grid (fetchAQGrid)', status: 'failed', timestamp: null, samples: [] }
    const samples: string[] = []
    for (let i = 0; i < grid.values.length && samples.length < 3; i++) {
      const v = grid.values[i]
      if (Number.isFinite(v)) samples.push(v.toFixed(1))
    }
    return {
      label: 'PM2.5 grid (fetchAQGrid)',
      status: 'ok',
      timestamp: isoOrNull(grid.timestamp),
      samples: [`${grid.nLat}×${grid.nLon} grid`, `source=${grid.source ?? 'unknown'}`, ...samples],
    }
  } catch (e) {
    return { label: 'PM2.5 grid (fetchAQGrid)', status: 'failed', timestamp: null, samples: [], error: String(e) }
  }
}

async function probeWind(): Promise<ProbeResult> {
  try {
    const field = await fetchWindField('surface')
    if (!field) return { label: 'Wind field (fetchWindField)', status: 'failed', timestamp: null, samples: [] }
    const { u, v } = field.interpolate(37.5, 127.0)
    return {
      label: 'Wind field (fetchWindField)',
      status: 'ok',
      timestamp: field.meta?.generatedAt ?? null,
      samples: [`level=${field.meta?.level}`, `Seoul u=${u.toFixed(2)} v=${v.toFixed(2)} m/s`],
    }
  } catch (e) {
    return { label: 'Wind field (fetchWindField)', status: 'failed', timestamp: null, samples: [], error: String(e) }
  }
}

async function probeGlobalGrid(): Promise<ProbeResult> {
  try {
    const snap = await fetchGlobalGridSnapshot({ lat: 37.5, lon: 127.0 })
    return {
      label: 'Global grid snapshot (fetchGlobalGridSnapshot)',
      status: 'ok',
      timestamp: snap.updatedAt,
      samples: [`pm25=${snap.pm25}`, `grade=${snap.grade}`, `nearby=${snap.nearbyCells.length}`, `stale=${snap.stale}`],
    }
  } catch (e) {
    return { label: 'Global grid snapshot (fetchGlobalGridSnapshot)', status: 'failed', timestamp: null, samples: [], error: String(e) }
  }
}

async function probeTimeline(): Promise<ProbeResult> {
  try {
    const manifest = await fetchTimelineManifest(Date.now())
    if (!manifest) return { label: 'Timeline manifest (fetchTimelineManifest)', status: 'failed', timestamp: null, samples: [] }
    return {
      label: 'Timeline manifest (fetchTimelineManifest)',
      status: 'ok',
      timestamp: manifest.generatedAt,
      samples: [`frames=${manifest.frames.length}`, `stale=${manifest.stale}`, `refTime=${manifest.refTime}`],
    }
  } catch (e) {
    return { label: 'Timeline manifest (fetchTimelineManifest)', status: 'failed', timestamp: null, samples: [], error: String(e) }
  }
}

async function probeForecast(): Promise<ProbeResult> {
  try {
    const forecast = await fetchForecast()
    if (!forecast) return { label: 'Forecast (fetchForecast)', status: 'failed', timestamp: null, samples: [] }
    return {
      label: 'Forecast (fetchForecast)',
      status: 'ok',
      timestamp: forecast.generated_at,
      samples: [`cities=${forecast.cities.length}`, `source=${forecast.source ?? 'unknown'}`],
    }
  } catch (e) {
    return { label: 'Forecast (fetchForecast)', status: 'failed', timestamp: null, samples: [], error: String(e) }
  }
}

function statusColor(status: ProbeStatus): string {
  if (status === 'ok') return 'green'
  if (status === 'failed') return 'red'
  return 'gray'
}

function ProbeRow({ result }: { result: ProbeResult }) {
  return (
    <tr>
      <td>{result.label}</td>
      <td style={{ color: statusColor(result.status), fontWeight: 'bold' }}>{result.status.toUpperCase()}</td>
      <td>{result.timestamp ?? '(none)'}</td>
      <td>{result.samples.join(' · ') || '—'}</td>
      <td>{result.error ?? ''}</td>
    </tr>
  )
}

export function DataProbe() {
  const [results, setResults] = useState<ProbeResult[]>([
    { label: 'PM2.5 grid (fetchAQGrid)', status: 'pending', timestamp: null, samples: [] },
    { label: 'Wind field (fetchWindField)', status: 'pending', timestamp: null, samples: [] },
    { label: 'Global grid snapshot (fetchGlobalGridSnapshot)', status: 'pending', timestamp: null, samples: [] },
    { label: 'Timeline manifest (fetchTimelineManifest)', status: 'pending', timestamp: null, samples: [] },
    { label: 'Forecast (fetchForecast)', status: 'pending', timestamp: null, samples: [] },
  ])

  useDataHealth()
  const healthFeeds = useDataHealthStore((s) => s.feeds)
  const healthPolledAt = useDataHealthStore((s) => s.lastPolledAt)

  useEffect(() => {
    let cancelled = false
    async function run() {
      const probes = [probeGrid, probeWind, probeGlobalGrid, probeTimeline, probeForecast]
      for (let i = 0; i < probes.length; i++) {
        const result = await probes[i]()
        if (cancelled) return
        setResults((prev) => prev.map((r, idx) => (idx === i ? result : r)))
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div style={{ fontFamily: 'monospace', padding: '1rem', maxWidth: '100%', overflowX: 'auto' }}>
      <h1>AirLens Web — Data Probe (M0 bootstrap)</h1>
      <p>
        Unstyled verification page. Each row is a real fetch against the ported
        data layer (HF dataset <code>Robeedau/airlens-live</code> + mac CDN
        fallback). This page is replaced once a real UI lands.
      </p>

      <table border={1} cellPadding={6} style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th>Feed</th>
            <th>Status</th>
            <th>Source timestamp</th>
            <th>Samples</th>
            <th>Error</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => (
            <ProbeRow key={r.label} result={r} />
          ))}
        </tbody>
      </table>

      <h2>health.json (useDataHealth / dataHealthStore)</h2>
      <p>Last polled: {healthPolledAt ? new Date(healthPolledAt).toISOString() : '(not yet polled)'}</p>
      {Object.keys(healthFeeds).length === 0 ? (
        <p>(no feeds reported yet)</p>
      ) : (
        <table border={1} cellPadding={6} style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th>Source</th>
              <th>Available</th>
              <th>Served from</th>
              <th>Stale</th>
              <th>Generated at</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(healthFeeds).map(([key, f]) => (
              <tr key={key}>
                <td>{key}</td>
                <td>{String(f.available)}</td>
                <td>{f.servedFrom ?? '(none)'}</td>
                <td style={{ color: f.stale ? 'red' : 'green', fontWeight: 'bold' }}>{String(f.stale)}</td>
                <td>{isoOrNull(f.generatedAt) ?? '(none)'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
