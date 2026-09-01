/**
 * Observed-conditions sentences for Today's Why section — fixed templates
 * filled with a real reading, never free-generated text
 * (page-specs/today-decision-surface.md §7: "Why의 관찰된 변화 문장은
 * rule-based 템플릿에서만 생성"). `describeSixHourTrend` reuses
 * `computeSixHourDelta`/`formatUtcTime` from `lib/home/whyNow.ts` rather
 * than recomputing the PM2.5 delta a second way.
 */
import { computeSixHourDelta, formatUtcTime } from '../home/whyNow'
import type { CapsuleSeriesPoint } from '../../components/fluid/capsule/useCapsuleData'
import type { OpenMeteoWeatherHourly } from '../../types/forecast'

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const

/** Matches InstrumentGrid's own `compassLabel` convention. */
function compassLabel(deg: number): string {
  const idx = Math.round((((deg % 360) + 360) % 360) / 45) % 8
  return COMPASS[idx]
}

/** Open-Meteo serves `wind_speed_10m` in km/h — same conversion InstrumentGrid applies. */
export function describeWind(weather: OpenMeteoWeatherHourly | null): string | null {
  const kmh = weather?.wind_speed_10m?.[0]
  if (kmh == null || !Number.isFinite(kmh)) return null
  const ms = kmh / 3.6
  const dirDeg = weather?.wind_direction_10m?.[0]
  const dir = dirDeg != null && Number.isFinite(dirDeg) ? compassLabel(dirDeg) : null
  return dir ? `Wind from the ${dir} at ${ms.toFixed(1)} m/s.` : `Wind at ${ms.toFixed(1)} m/s.`
}

export function describeHumidity(weather: OpenMeteoWeatherHourly | null): string | null {
  const rh = weather?.relative_humidity_2m?.[0]
  if (rh == null || !Number.isFinite(rh)) return null
  return `Relative humidity ${Math.round(rh)}%.`
}

/** Null when the CAMS series does not reach hour 6 — never a shorter-window
 * delta mislabeled as 6h (same guarantee `computeSixHourDelta` gives Home). */
export function describeSixHourTrend(series: CapsuleSeriesPoint[]): string | null {
  const delta = computeSixHourDelta(series)
  if (!delta) return null
  const sign = delta.delta >= 0 ? '+' : ''
  return `PM2.5 ${sign}${delta.delta.toFixed(0)} µg/m³ from ${formatUtcTime(delta.fromTime)} to ${formatUtcTime(delta.toTime)} (CAMS forecast).`
}
