import { formatUtcTime } from '../../lib/home/whyNow'
import type { CapsuleSeriesPoint } from '../fluid/capsule/useCapsuleData'

export interface HomeForecastStripProps {
  series: CapsuleSeriesPoint[]
  city: string
}

const STRIP_W = 640
const STRIP_H = 140
const AXIS_INDICES = [0, 6, 12, 18, 23]

interface StripGeometry {
  bandPoints: string | null
  linePoints: string
  cursorX: number
}

/**
 * Presentational chart geometry only — an independent implementation for a
 * wider strip with axis ticks, not a reuse of CapsulePanel's private
 * `buildSparkline` (that one targets a small 260×64 capsule panel). Shares
 * the same "min/max across p10/p50/p90, then normalize" approach because
 * that is the correct approach for this data shape, not because the logic
 * was copied.
 */
function buildStripGeometry(series: CapsuleSeriesPoint[], hasBand: boolean): StripGeometry | null {
  if (series.length === 0) return null
  // When hasBand is false the band is not drawn, so unpublished p10/p90 must
  // not influence the scale either — scale on p50 alone.
  const values = hasBand ? series.flatMap((p) => [p.p10 ?? p.p50, p.p90 ?? p.p50, p.p50]) : series.map((p) => p.p50)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const x = (i: number) => (i / Math.max(1, series.length - 1)) * STRIP_W
  const y = (v: number) => STRIP_H - ((v - min) / span) * STRIP_H

  const linePoints = series.map((p, i) => `${x(i)},${y(p.p50)}`).join(' ')

  let bandPoints: string | null = null
  if (hasBand) {
    // hasBand guarantees every point published p10/p90 — the `?? p.p50` here
    // only narrows the nullable type and can never fabricate a band edge.
    const top = series.map((p, i) => `${x(i)},${y(p.p90 ?? p.p50)}`)
    const bottom = series
      .map((p, i) => [x(i), y(p.p10 ?? p.p50)] as const)
      .reverse()
      .map(([px, py]) => `${px},${py}`)
    bandPoints = [...top, ...bottom].join(' ')
  }

  return { bandPoints, linePoints, cursorX: x(0) }
}

/**
 * HomeForecastStrip — "Next 24h · PM2.5". Renders the p10-p90 band only when
 * the source actually published one (never a lo===hi collapse); an orange
 * cursor line marks hour 0 ("now"). Below-24h series still render — the
 * axis ticks skip any index the series doesn't reach.
 */
export default function HomeForecastStrip({ series, city }: HomeForecastStripProps) {
  // Band renders only when the source published a real range for EVERY hour —
  // a partially published series must not have its gaps filled with p50 (that
  // would fabricate band edges), and a lo===hi collapse is not a range.
  const hasBand =
    series.length > 0 && series.every((p) => p.p10 !== null && p.p90 !== null && p.p90 > p.p10)
  const geometry = buildStripGeometry(series, hasBand)

  const ariaLabel = geometry
    ? `24-hour PM2.5 forecast for ${city}${hasBand ? ', with a shaded expected range' : ', no uncertainty range published for this forecast'}`
    : `24-hour PM2.5 forecast for ${city} — unavailable this pass`

  return (
    <section className="home-strip" aria-label="Next 24 hours, PM2.5">
      <div className="home-strip__head">
        <span className="t-tag">Next 24h · PM2.5</span>
        {!hasBand && geometry ? (
          <span className="home-strip__no-band t-caption">No uncertainty range published for this forecast</span>
        ) : null}
      </div>

      {geometry ? (
        <svg viewBox={`0 0 ${STRIP_W} ${STRIP_H}`} className="home-strip__svg" role="img" aria-label={ariaLabel}>
          {geometry.bandPoints ? <polygon points={geometry.bandPoints} className="home-strip__band" /> : null}
          <polyline points={geometry.linePoints} className="home-strip__line" fill="none" />
          <line
            x1={geometry.cursorX}
            y1={0}
            x2={geometry.cursorX}
            y2={STRIP_H}
            className="home-strip__cursor"
            aria-hidden="true"
          />
        </svg>
      ) : (
        <p className="home-strip__empty t-caption">No 24h series available this pass.</p>
      )}

      {geometry ? (
        <div className="home-strip__axis" aria-hidden="true">
          {AXIS_INDICES.filter((i) => i < series.length).map((i) => (
            <span key={i} className="home-strip__axis-tick">
              {formatUtcTime(series[i].time)}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  )
}
