// useCapsuleData — maps the shared TFT forecast mirror onto the shape
// AqiCapsule/CapsulePanel need: a featured city's current reading, today's
// expected range, a 24h series, and a 3-way (never fabricated) alert signal.
import { useEffect, useState } from 'react'
import { loadTft } from '../../../landing/shared/data/loaders'
import type { TftCity, TftHour } from '../../../landing/shared/data/loaders'
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
  range: CapsuleRange
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
function pickFeaturedCity(cities: TftCity[]): TftCity | null {
  let city: TftCity | null = null
  for (const c of cities) {
    const now = c.hourly[0]
    if (!now || !Number.isFinite(now.pm25)) continue
    if (city === null || now.pm25 > (city.hourly[0]?.pm25 ?? -Infinity)) city = c
  }
  return city
}

function detectAlert(hourly: TftHour[], currentTier: AqiTier): CapsuleAlert {
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
    loadTft()
      .then((tft) => {
        if (!alive) return
        const city = pickFeaturedCity(tft.cities)
        const now = city?.hourly[0]
        if (!city || !now || !Number.isFinite(now.pm25)) {
          setState({ status: 'missing' })
          return
        }
        const window = city.hourly.slice(0, LOOKAHEAD_HOURS)
        let lo = now.pm25
        let hi = now.pm25
        const series24h: CapsuleSeriesPoint[] = []
        for (const hour of window) {
          if (!Number.isFinite(hour.pm25)) continue
          const p10 = Number.isFinite(hour.pm25_p10) ? hour.pm25_p10 : null
          const p90 = Number.isFinite(hour.pm25_p90) ? hour.pm25_p90 : null
          if (p10 !== null) lo = Math.min(lo, p10)
          if (p90 !== null) hi = Math.max(hi, p90)
          series24h.push({ time: hour.time, p10, p50: hour.pm25, p90 })
        }
        const tier = tierFromPm25(now.pm25)
        setState({
          status: 'ready',
          city: city.name,
          current: now.pm25,
          tier,
          range: { lo, hi },
          series24h,
          updatedAt: tft.generated_at,
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
