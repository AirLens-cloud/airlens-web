// Ported verbatim from AirLens-platform apps/landing-lab
// `src/concepts/particulate/sections/Readout.tsx` (Wave L2, 2026-08-26);
// `fmtSnapshot` rebound from the source's `concepts/fieldnotes/format.ts` to
// this repo's minimal inline at `../../shared/format` (see that file's header
// for why only `fmtSnapshot` was carried over).
//
// `react-hooks/purity` is disabled file-wide: the "is this forecast run
// stale" check below reads `Date.now()` directly at render time, which the
// rule flags as an impure render input (its output can differ between two
// renders with identical props). That is the point here, not a bug — this
// is a day-granularity provenance label ("a stored run N days old"), not a
// value memoized or diffed anywhere; being off by the odd render is
// harmless, and there is no correct pure alternative that doesn't invent a
// clock-tick prop nothing else in this chapter needs.
/* eslint-disable react-hooks/purity */
import { useMemo } from 'react'
import type { Place } from '../types'
import type { FieldMode } from '../types'
import { fmtSnapshot } from '../../shared/format'
import { HOURS_PER_SECOND, TIME_SCALE } from '../scene/FlowField'

const WHO_24H = 15 // µg/m³ — the honest comparator for an instantaneous snapshot

/** p10–p90 band + p50 line over the forecast's 72 h horizon. The band is the disclosure,
 *  not decoration — the caller labels the horizon from the run's own issue time. */
function Band({ place }: { place: Place }) {
  const path = useMemo(() => {
    const hours = place.forecast?.hourly ?? []
    if (hours.length < 2) return null
    const w = 260
    const h = 54
    const lo = Math.min(...hours.map((p) => p.pm25_p10))
    const hi = Math.max(...hours.map((p) => p.pm25_p90))
    const span = Math.max(hi - lo, 1)
    const x = (i: number) => (i / (hours.length - 1)) * w
    const y = (v: number) => h - ((v - lo) / span) * h
    const top = hours.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.pm25_p90).toFixed(1)}`)
    const bottom = [...hours]
      .reverse()
      .map((p, i) => `L${x(hours.length - 1 - i).toFixed(1)},${y(p.pm25_p10).toFixed(1)}`)
    const mid = hours.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.pm25).toFixed(1)}`)
    return { w, h, band: `${top.join('')}${bottom.join('')}Z`, mid: mid.join('') }
  }, [place.forecast])

  if (!path) {
    return <p className="ch2-pt__nodata">No forecast published for this city.</p>
  }
  return (
    <svg className="ch2-pt__band" viewBox={`0 0 ${path.w} ${path.h}`} preserveAspectRatio="none" aria-hidden="true">
      <path className="ch2-pt__band-fill" d={path.band} />
      <path className="ch2-pt__band-line" d={path.mid} />
    </svg>
  )
}

const DAY_MS = 86_400_000

export default function Readout({
  place,
  snapshotMs,
  forecastIssuedAt,
  modelVersion,
  mode,
  animated,
}: {
  place: Place
  snapshotMs: number
  forecastIssuedAt: string
  modelVersion: string
  mode: FieldMode
  animated: boolean
}) {
  const multiple = place.pm25 / WHO_24H

  // The mirror is a stored snapshot, so "NEXT 72 H" is only true on the day the forecast
  // was issued. Past that, the horizon is stated relative to the issue time the dataset
  // itself carries — a months-old run must not read as a forecast for this coming week.
  const issuedMs = Date.parse(forecastIssuedAt)
  const ageDays = Number.isFinite(issuedMs) ? (Date.now() - issuedMs) / DAY_MS : NaN
  const stale = Number.isFinite(ageDays) && ageDays >= 1
  const horizon = stale ? `72 H FROM ${fmtSnapshot(issuedMs)}` : 'NEXT 72 H'

  return (
    <div className="ch2-pt__readout">
      <p className="ch2-pt__eyebrow">THE AIR OVER</p>
      <h1 className="ch2-pt__city">{place.name}</h1>

      <div className="ch2-pt__figures">
        <span className="ch2-pt__value">{place.pm25.toFixed(1)}</span>
        <span className="ch2-pt__unit">µg/m³</span>
        <span className="ch2-pt__mult">×{multiple.toFixed(1)} WHO 24-h</span>
      </div>

      <dl className="ch2-pt__meta">
        <div>
          <dt>WIND</dt>
          <dd>
            {place.windSpeed.toFixed(1)} m/s
            {animated
              ? ` · advected ${TIME_SCALE.toLocaleString('en-US')}× real time (~${HOURS_PER_SECOND.toFixed(0)} h per second)`
              : ' · still frame'}
          </dd>
        </div>
        <div>
          <dt>FIELD</dt>
          <dd>{mode === 'gpu' ? 'GPU flow field (semi-Lagrangian)' : 'still field — no GPU flow'}</dd>
        </div>
      </dl>

      <div className="ch2-pt__forecast">
        <p className="ch2-pt__forecast-h">{horizon} · p10–p90</p>
        <Band place={place} />
        <p className="ch2-pt__caveat">
          Surface PM2.5 from the NOAA GEFS-Aerosols model, snapshot {fmtSnapshot(snapshotMs)} — an exposure
          estimate, not a station measurement. The forecast is AirLens {modelVersion}
          {stale
            ? `, issued ${fmtSnapshot(issuedMs)} — a stored run ${Math.round(ageDays)} days old, not a live forecast`
            : ''}
          ; the shaded band is its p10–p90 and no point inside it is promised.
        </p>
      </div>
    </div>
  )
}
