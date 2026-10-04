/**
 * tier — PM2.5 tier classification plus the capsule's alert/24h-window
 * primitives, moved out of `useCapsuleData.ts` (W1b commit ①) so
 * `resolvePrimaryReading.ts` (Today's shared reading resolver, same
 * directory) can reuse the exact same tier cuts and window summarisation
 * without importing a React hook module. Every name here is a verbatim move,
 * not a rewrite — behaviour is unchanged. `useCapsuleData.ts` re-exports all
 * of them so its existing importers keep compiling against the old path.
 */
import type { AqiTier } from '../../components/wireframe/AqiDot'
import type { ForecastHourly } from '../../types/forecast'

export type CapsuleAlert = 'worsening' | 'steady' | 'unknown'

export interface CapsuleRange {
  lo: number
  hi: number
}

export interface CapsuleSeriesPoint {
  time: string
  p10: number | null
  p50: number
  p90: number | null
}

const LOOKAHEAD_HOURS = 24

/** PM2.5 -> 6-tier AQI classification. Shares the 15/35/75 cut convention
 * with `src/api/gridSnapshot.ts`'s `gradeFromPm25` (4-tier), extended with
 * two further EPA-style breakpoints (55, 150) to reach AqiDot's 6 tiers. */
export function tierFromPm25(pm25: number): AqiTier {
  if (pm25 <= 15) return 'good'
  if (pm25 <= 35) return 'moderate'
  if (pm25 <= 55) return 'usg'
  if (pm25 <= 75) return 'unhealthy'
  if (pm25 <= 150) return 'very-unhealthy'
  return 'hazardous'
}

export const TIER_RANK: Record<AqiTier, number> = {
  good: 0,
  moderate: 1,
  usg: 2,
  unhealthy: 3,
  'very-unhealthy': 4,
  hazardous: 5,
  unknown: -1,
}

export function detectAlert(hourly: ForecastHourly[], currentTier: AqiTier): CapsuleAlert {
  if (hourly.length < 2 || currentTier === 'unknown') return 'unknown'
  const currentRank = TIER_RANK[currentTier]
  const window = hourly.slice(0, LOOKAHEAD_HOURS)
  let sawFinite = false
  for (const hour of window) {
    if (!Number.isFinite(hour.pm25)) continue
    sawFinite = true
    if (TIER_RANK[tierFromPm25(hour.pm25)] > currentRank) return 'worsening'
  }
  return sawFinite ? 'steady' : 'unknown'
}

export interface Window24hSummary {
  series24h: CapsuleSeriesPoint[]
  /** null when no hour in the window actually publishes a p10/p90 bound —
   * never a lo===hi band collapsed from the point value alone. */
  range: CapsuleRange | null
}

/**
 * 24h window summarisation — moved verbatim out of `useCapsuleData`'s fetch
 * handler: builds the hourly `series24h` points and widens a lo/hi band from
 * any hour that actually publishes p10/p90. `sawBand` only flips true on a
 * real bound, so a source with no band anywhere in the window reports
 * `range: null` rather than a zero-width `{lo: currentPm25, hi: currentPm25}`.
 */
export function summarizeWindow24h(hourly: ForecastHourly[], currentPm25: number): Window24hSummary {
  const window = hourly.slice(0, LOOKAHEAD_HOURS)
  let lo = currentPm25
  let hi = currentPm25
  let sawBand = false
  const series24h: CapsuleSeriesPoint[] = []
  for (const hour of window) {
    if (!Number.isFinite(hour.pm25)) continue
    const p10 = Number.isFinite(hour.pm25_p10) ? (hour.pm25_p10 as number) : null
    const p90 = Number.isFinite(hour.pm25_p90) ? (hour.pm25_p90 as number) : null
    if (p10 !== null) {
      lo = Math.min(lo, p10)
      sawBand = true
    }
    if (p90 !== null) {
      hi = Math.max(hi, p90)
      sawBand = true
    }
    series24h.push({ time: hour.time, p10, p50: hour.pm25, p90 })
  }
  return { series24h, range: sawBand ? { lo, hi } : null }
}
