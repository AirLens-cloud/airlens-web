// useCapsuleData — maps the live forecast feed onto the shape
// AqiCapsule/CapsulePanel need: the nearest feed city's current reading,
// today's expected range, a 24h series, and a 3-way (never fabricated)
// alert signal, for a caller-resolved location (W1a — `useResolvedLocation`
// resolves *where*; this hook only resolves *what the feed says there*).
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
import { pickNearestCity } from '../../../lib/today/nearestCity'
import { tierFromPm25, detectAlert, summarizeWindow24h } from '../../../lib/reading/tier'
import type { AqiTier } from '../../wireframe/AqiDot'
import type { ResolvedLocation } from '../../../lib/location/resolveLocation'
import type { CapsuleAlert, CapsuleRange, CapsuleSeriesPoint } from '../../../lib/reading/tier'

// Moved to `lib/reading/tier.ts` (W1b commit ①) so `resolvePrimaryReading.ts`
// can share the same tier cuts without importing this hook module.
// Re-exported here, unchanged, so this file's existing importers (the
// capsule component tree, `useTodayCams.ts`, `lib/home/whyNow.ts`, etc.)
// keep compiling against this path.
export { tierFromPm25 } from '../../../lib/reading/tier'
export type { CapsuleAlert, CapsuleRange, CapsuleSeriesPoint } from '../../../lib/reading/tier'

export interface CapsuleDataReady {
  status: 'ready'
  city: string
  /** Featured city's coordinates and ISO country code — already present on
   * `ForecastCity` (the fetch this hook already makes), just not previously
   * surfaced. Added for the Home hero's "explore on the Globe" deep link
   * and location context; not a new fetch or a forked data path. */
  lat: number
  lon: number
  countryCode: string
  current: number
  tier: AqiTier
  /** null when the source publishes no p10/p90 — a deterministic forecast has
   * no band, and a lo===hi "range" would read as one measured at zero width. */
  range: CapsuleRange | null
  /** Current-hour uncertainty bound, straight off `hourly[0]` — distinct from
   * `range` (a 24h min/max envelope). Null under the same "source publishes
   * none" condition; never derived from `range`. */
  p10: number | null
  p90: number | null
  series24h: CapsuleSeriesPoint[]
  updatedAt: string
  alert: CapsuleAlert
}

export type CapsuleDataState = { status: 'loading' } | CapsuleDataReady | { status: 'missing' }

/**
 * @param location The resolved location (`useResolvedLocation`'s
 * `location`) to find the nearest feed city for — same `pickNearestCity`
 * lookup `useTodayCams` already uses for Today's location-specific reading,
 * so this adds no new fetch or scoring logic of its own. `null` means the
 * location hasn't resolved yet (still loading, no choice/approx settled) —
 * this hook returns its own loading state without fetching, rather than
 * falling back to any feed-wide pick.
 */
/** A resolved state plus the point it was resolved for. The point travels
 * with the result so a state left over from the previous point can be told
 * apart from one that answers the current one — see the read below. */
interface ResolvedFor {
  state: CapsuleDataState
  lat: number | null
  lon: number | null
}

export function useCapsuleData(location: ResolvedLocation | null): CapsuleDataState {
  const [resolved, setResolved] = useState<ResolvedFor>({ state: { status: 'loading' }, lat: null, lon: null })
  const lat = location?.lat ?? null
  const lon = location?.lon ?? null

  useEffect(() => {
    // Not resolved yet — no fetch, and the read below already reports
    // `loading` for a lat/lon mismatch (initial state is lat:null/lon:null).
    if (lat === null || lon === null) return
    let alive = true
    const setState = (state: CapsuleDataState) => setResolved({ state, lat, lon })
    fetchForecast()
      .then((forecast) => {
        if (!alive) return
        const city = forecast ? (pickNearestCity(forecast.cities, lat, lon)?.city ?? null) : null
        const now = city?.hourly[0]
        if (!forecast || !city || !now || !Number.isFinite(now.pm25)) {
          setState({ status: 'missing' })
          return
        }
        // `summarizeWindow24h` (moved to `lib/reading/tier.ts`, W1b commit ①)
        // builds `series24h` and widens the lo/hi band from any hour that
        // actually publishes p10/p90 — `range` stays null (never lo===hi)
        // when no hour in the window carries one.
        const { series24h, range } = summarizeWindow24h(city.hourly, now.pm25)
        const tier = tierFromPm25(now.pm25)
        setState({
          status: 'ready',
          city: city.name,
          lat: city.lat,
          lon: city.lon,
          countryCode: city.country_code,
          current: now.pm25,
          tier,
          range,
          p10: Number.isFinite(now.pm25_p10) ? (now.pm25_p10 as number) : null,
          p90: Number.isFinite(now.pm25_p90) ? (now.pm25_p90 as number) : null,
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
  }, [lat, lon])

  // A result for a different point is not this point's answer — report
  // loading until the fetch for the current one lands (or, if `location`
  // is `null`, forever loading — the initial state's lat/lon are both
  // `null` too, so this also covers "never resolved yet" for free).
  // Without this, the city resolved for the previous point would sit under
  // the caller's already-updated location label, reading "~ Riyadh ·
  // APPROXIMATE (IP-BASED)" — exactly the mislabel this chain exists to
  // remove.
  if (resolved.lat !== lat || resolved.lon !== lon) return { status: 'loading' }
  return resolved.state
}
