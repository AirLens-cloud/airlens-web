import type { AqiTier } from './AqiDot'
import type { DqssGrade } from './DqssBadge'

/**
 * SkyStrip — live AQI readout band (paper/ink doctrine, sky-glass exception surface).
 * Ported from AirLens-platform apps/web/src/components/wireframe/SkyStrip.tsx with
 * three dependencies not present in this repo stripped:
 *   - react-router-dom `Link`  -> plain `<a href>` ("more" link)
 *   - react-i18next `t()`      -> plain-English label props with the same defaults
 *   - `useSiteStats()` hook    -> `gridCells` prop (caller supplies the real count,
 *                                 or omits it — never fabricated)
 *
 * `status='live'` stamps the reading as current. Only pass it when there IS
 * one — a LIVE badge over a row of '—' claims a measurement that does not
 * exist, which is the same lie as printing a number for it.
 */
export type SkyStripStatus = 'live' | 'loading' | 'unavailable'
export type SkyStripLayout = 'strip' | 'stack'

interface Props {
  city?: string
  /** null = no live measurement -> renders '—' (no fabricated value). */
  pm25?: number | null
  tier?: AqiTier
  /** 'unknown' / undefined -> renders '—' (DQSS not data-derived). */
  dqss?: DqssGrade
  p10?: number | null
  p90?: number | null
  n?: number
  status?: SkyStripStatus
  layout?: SkyStripLayout
  more?: { to: string; label: string }
  coords?: { lat: number; lng: number }
  onCoordsChange?: (coords: { lat: number; lng: number }) => void
  onCoordClick?: () => void
  /** Real published grid-cell count. Omit or null -> renders '—', never invented. */
  gridCells?: number | null
  loadingLabel?: string
  unavailableLabel?: string
  coordButtonLabel?: string
}

const TIER_LABEL: Partial<Record<AqiTier, string>> = {
  good: 'GOOD',
  moderate: 'MOD',
  usg: 'USG',
  unhealthy: 'UNH',
  'very-unhealthy': 'VUNH',
  hazardous: 'HAZ',
  unknown: '—',
}

export default function SkyStrip({
  city = 'SEOUL · KR',
  pm25 = 42,
  tier = 'moderate',
  dqss = 'unknown',
  p10 = 36,
  p90 = 51,
  n = 12,
  status = 'live',
  layout = 'strip',
  more,
  coords,
  onCoordsChange,
  onCoordClick,
  gridCells = null,
  loadingLabel = 'READING…',
  unavailableLabel = 'NO READING',
  coordButtonLabel = 'Enter coordinates',
}: Props) {
  const expanded = !!(coords && onCoordsChange)
  const classes = ['sky-strip']
  if (expanded) classes.push('sky-strip--expanded')
  if (layout === 'stack') classes.push('sky-strip--stack')

  return (
    <div className={classes.join(' ')} data-aqi={tier}>
      {status === 'live' ? (
        <span className="sky-strip__stamp sky-strip__stamp--live">LIVE</span>
      ) : (
        <span className="sky-strip__stamp sky-strip__stamp--muted">
          {status === 'loading' ? loadingLabel : unavailableLabel}
        </span>
      )}
      <span className="sky-strip__stamp sky-strip__stamp--muted">{city}</span>
      <span className="sky-strip__readout">
        PM2.5 <span className="sky-strip__num">{pm25 == null ? '—' : pm25}</span>
        <span className="sky-strip__label">{TIER_LABEL[tier] ?? '—'} · µg/m³</span>
      </span>
      <span className="sky-strip__label">· p10–p90 {p10 == null || p90 == null ? '—' : `${p10}–${p90}`}</span>
      <span className="sky-strip__label">· DQSS {dqss === 'unknown' ? '—' : dqss}</span>
      <span className="sky-strip__label">· n={n} stations / 24 km</span>

      {expanded ? (
        <>
          <span className="sky-strip-divider" />
          <span className="sky-strip__label sky-strip__label--coord">COORDS</span>
          <input
            className="sky-coord-input"
            value={coords!.lat}
            onChange={(e) => {
              const v = parseFloat(e.target.value)
              if (!Number.isNaN(v)) onCoordsChange!({ ...coords!, lat: v })
            }}
            aria-label="Latitude"
            inputMode="decimal"
          />
          <input
            className="sky-coord-input"
            value={coords!.lng}
            onChange={(e) => {
              const v = parseFloat(e.target.value)
              if (!Number.isNaN(v)) onCoordsChange!({ ...coords!, lng: v })
            }}
            aria-label="Longitude"
            inputMode="decimal"
          />
        </>
      ) : onCoordClick ? (
        <button
          type="button"
          className="sky-strip__stamp sky-strip__stamp--coord-toggle"
          onClick={onCoordClick}
        >
          {coordButtonLabel}
        </button>
      ) : more ? (
        <a className="sky-strip__more" href={more.to}>
          {more.label}
        </a>
      ) : null}

      <span className="sky-strip__stamp sky-strip__stamp--muted sky-strip__stamp--grid">
        {gridCells != null ? `${gridCells.toLocaleString('en-US')} GRID CELLS` : '—'}
      </span>
    </div>
  )
}
