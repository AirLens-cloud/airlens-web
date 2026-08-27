// useCapsuleData — maps the live forecast feed onto the shape
// AqiCapsule/CapsulePanel need: a featured city's current reading, today's
// expected range, a 24h series, and a 3-way (never fabricated) alert signal.
//
// Source: `fetchForecast` (HF `aq-data/forecast.json`, cron-refreshed, with a
// bundled static fallback). It used to read `loadTft` — the landing chapters'
// `public/mirror/data/tft.json`, a snapshot committed once and never
// refreshed, which had the capsule reporting a reading four months old on
// every surface. The landing chapters keep that mirror: it is a narrative
// surface, and its sparkline/band sections hard-depend on the TFT p10/p90
// fields the live deterministic feed does not carry.
//
// That is the trade this makes explicit: the live source (Open-Meteo CAMS) is
// deterministic and publishes NO uncertainty band, so `range` is null there
// rather than collapsed onto the point value. A p10/p90-carrying source is
// still handled — if one is published, the band comes back on its own.
import { useEffect, useState } from 'react'
import { fetchForecast } from '../../../lib/today/forecastSource'
import type { ForecastCity, ForecastHourly } from '../../../types/forecast'
import type { AqiTier } from '../../wireframe/AqiDot'

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

export interface CapsuleDataReady {
  status: 'ready'
  city: string
  current: number
  tier: AqiTier
  /** null when the source publishes no p10/p90 — a deterministic forecast has
   * no band, and a lo===hi "range" would read as one measured at zero width. */
  range: CapsuleRange | null
  series24h: CapsuleSeriesPoint[]
  updatedAt: string
  alert: CapsuleAlert
}

export type CapsuleDataState = { status: 'loading' } | CapsuleDataReady | { status: 'missing' }

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

const TIER_RANK: Record<AqiTier, number> = {
  good: 0,
  moderate: 1,
  usg: 2,
  unhealthy: 3,
  'very-unhealthy': 4,
  hazardous: 5,
  unknown: -1,
}

/** Same "thickest air first" selection as Ch4's `useDawnBriefingData`
 * (`forecastRowAt48h`) — highest first-hour PM2.5 among cities — applied to
 * the current hour instead of +48h. Independent implementation per the wave
 * brief; the chapter-internal helper is not promoted/shared. */
function pickFeaturedCity(cities: ForecastCity[]): ForecastCity | null {
  let city: ForecastCity | null = null
  for (const c of cities) {
    const now = c.hourly[0]
    if (!now || !Number.isFinite(now.pm25)) continue
    if (city === null || now.pm25 > (city.hourly[0]?.pm25 ?? -Infinity)) city = c
  }
  return city
}

function detectAlert(hourly: ForecastHourly[], currentTier: AqiTier): CapsuleAlert {
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

export function useCapsuleData(): CapsuleDataState {
  const [state, setState] = useState<CapsuleDataState>({ status: 'loading' })

  useEffect(() => {
    let alive = true
    fetchForecast()
      .then((forecast) => {
        if (!alive) return
        const city = forecast ? pickFeaturedCity(forecast.cities) : null
        const now = city?.hourly[0]
        if (!forecast || !city || !now || !Number.isFinite(now.pm25)) {
          setState({ status: 'missing' })
          return
        }
        const window = city.hourly.slice(0, LOOKAHEAD_HOURS)
        let lo = now.pm25
        let hi = now.pm25
        // Only a band the source actually published widens lo/hi. If no hour
        // carries one, `range` stays null instead of reporting lo===hi.
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
        const tier = tierFromPm25(now.pm25)
        setState({
          status: 'ready',
          city: city.name,
          current: now.pm25,
          tier,
          range: sawBand ? { lo, hi } : null,
          series24h,
          updatedAt: forecast.generated_at,
          alert: detectAlert(city.hourly, tier),
        })
      })
      .catch(() => {
        if (alive) setState({ status: 'missing' })
      })
    return () => {
      alive = false
    }
  }, [])

  return state
}
