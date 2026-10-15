// Loader for the bundled TFT forecast mirror (`public/mirror/data/tft.json`).
// Module-level Promise cache: the snapshot is fetched exactly once. A failed
// fetch throws (and is evicted from the cache, so a later call retries) so the
// caller can render an honest empty/error state — never a silent fallback.
//
// Extracted unchanged (MIRROR path and cache semantics) from the loaders of the
// /landing page (removed in 2026-10), once `loadTft` was the only loader still
// read. See docs/DATA-SNAPSHOT.md for the file's provenance.

const MIRROR = '/mirror'
const TFT_URL = `${MIRROR}/data/tft.json`

// ── types ───────────────────────────────────────────────────────────────────
export interface TftHour {
  time: string
  pm25: number
  pm25_p10: number
  pm25_p90: number
}
export interface TftCity {
  name: string
  lat: number
  lon: number
  country_code: string
  hourly: TftHour[]
}
export interface TftForecast {
  generated_at: string
  model_version: string
  cities: TftCity[]
}

// ── cache primitives ────────────────────────────────────────────────────────
const cache = new Map<string, Promise<unknown>>()

function once<T>(key: string, factory: () => Promise<T>): Promise<T> {
  const hit = cache.get(key)
  if (hit) return hit as Promise<T>
  const p = factory().catch((err) => {
    cache.delete(key)
    throw err
  })
  cache.set(key, p)
  return p
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetch ${url} → ${res.status}`)
  return (await res.json()) as T
}

export function loadTft(): Promise<TftForecast> {
  return once('tft', () => fetchJson<TftForecast>(TFT_URL))
}
