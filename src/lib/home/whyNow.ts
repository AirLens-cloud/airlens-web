/**
 * Why-now — rule-based observations derived from the 24h series
 * `useCapsuleData()` already fetches (`CapsuleDataReady.series24h`). No
 * inference, no LLM text: every sentence traces to two or more real points
 * in the same series the strip chart renders. When the series is too short
 * to support an item honestly, the caller omits that item rather than this
 * module inventing a shorter-window value and mislabeling it.
 */
import type { CapsuleSeriesPoint } from '../../components/fluid/capsule/useCapsuleData'

export const SIX_HOUR_LOOKAHEAD = 6

export interface SixHourDelta {
  fromTime: string
  toTime: string
  fromValue: number
  toValue: number
  delta: number
}

/**
 * Observed delta between hour 0 and hour 6 of the series. Returns null when
 * the series does not reach hour 6 — never computed over a shorter window
 * and still labeled "6h".
 */
export function computeSixHourDelta(series: CapsuleSeriesPoint[]): SixHourDelta | null {
  if (series.length <= SIX_HOUR_LOOKAHEAD) return null
  const from = series[0]
  const to = series[SIX_HOUR_LOOKAHEAD]
  return {
    fromTime: from.time,
    toTime: to.time,
    fromValue: from.p50,
    toValue: to.p50,
    delta: to.p50 - from.p50,
  }
}

export interface SeriesPeak {
  time: string
  value: number
}

/** Highest p50 in the series, with its time. Null for an empty series. */
export function computePeak(series: CapsuleSeriesPoint[]): SeriesPeak | null {
  if (series.length === 0) return null
  let peak = series[0]
  for (const point of series) {
    if (point.p50 > peak.p50) peak = point
  }
  return { time: peak.time, value: peak.p50 }
}

/**
 * HH:MM + a literal "UTC" suffix, extracted directly from the ISO string —
 * matches HourlyForecastRail's `formatHourLabel` technique. The CAMS series
 * is UTC-stamped; routing through `Date` would silently reinterpret the
 * hour in the viewer's own timezone.
 */
export function formatUtcTime(iso: string): string {
  const match = /T(\d{2}):(\d{2})/.exec(iso)
  return match ? `${match[1]}:${match[2]} UTC` : '—'
}

/**
 * "Xm ago" / "Xh ago" / "Xd ago" — elapsed time since a `generated_at`
 * timestamp. Always reads as age, never a countdown — a stale reading must
 * never look like it is about to refresh. A negative elapsed (client clock
 * skew putting the timestamp in the future) returns null rather than
 * fabricating "1m ago" — Glass-box: no honest reading, no label.
 */
export function formatElapsed(elapsedMs: number): string | null {
  if (elapsedMs < 0) return null
  const totalMin = Math.floor(elapsedMs / 60000)
  if (totalMin < 60) return `${Math.max(1, totalMin)}m ago`
  const totalHours = Math.floor(totalMin / 60)
  if (totalHours < 48) return `${totalHours}h ago`
  return `${Math.floor(totalHours / 24)}d ago`
}
