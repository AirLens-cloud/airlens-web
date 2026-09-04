/**
 * Forecast source — HF-first (cron-refreshed) with static fallback. Ported
 * verbatim from AirLens-platform apps/web `src/lib/today/forecastSource.ts`.
 *
 * The 24h PM2.5 forecast is server-collected upstream (GitHub Actions cron
 * fetches the Open-Meteo CAMS PM2.5 forecast into the HF live-data repo). The
 * browser never calls Open-Meteo directly (Server-Collect, Client-Display).
 */
import type { ForecastPayload } from '../../types/forecast'
import { HF_LIVE_BASE } from '../config/dataSources'

const FORECAST_SOURCES: string[] = [
  // 1. HF live-data repo — cron refreshes the CAMS forecast every 6h
  `${HF_LIVE_BASE}/aq-data/forecast.json`,
  // 2. Static fallback — bundled cams_forecast.json, a verbatim mirror of
  //    source 1 refreshed on every build by scripts/prefetch-fallback-data.mjs
  //    (may lag by up to one build/deploy cycle if HF was briefly unreachable
  //    at build time — not a hand-curated "city seed").
  '/data/predictions/cams_forecast.json',
]

const FETCH_TIMEOUT_MS = 5000

/**
 * Fetch the forecast payload, cascading through FORECAST_SOURCES until one
 * returns a non-empty `cities` array. Returns null when every source fails —
 * the caller then renders an honest "unavailable" state, never fake data.
 */
export async function fetchForecast(): Promise<ForecastPayload | null> {
  for (const src of FORECAST_SOURCES) {
    if (!src || src.includes('undefined')) continue
    try {
      const res = await fetch(src, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
      if (!res.ok) continue
      // A missing static fallback file used to come back 200 + index.html
      // (the SPA catch-all in public/_redirects) — `functions/data/[[path]].ts`
      // now 404s that server-side; this guard is defense-in-depth for hosts
      // that don't run that Function (e.g. `vite preview`).
      const contentType = res.headers?.get('content-type') ?? ''
      if (contentType.includes('text/html')) continue
      const json = (await res.json()) as ForecastPayload
      if (json?.cities?.length) return json
    } catch {
      continue
    }
  }
  return null
}
