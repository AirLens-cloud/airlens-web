/**
 * City catalog for the Weather page's location search. Reuses the bundled
 * TFT forecast mirror's city list (`loadTft()`, `src/landing/shared/data/loaders.ts`)
 * — the same 50-city set already fetched for the AqiCapsule — rather than
 * shipping a second city dataset.
 */
import { loadTft } from '../landing/shared/data/loaders'
import type { TftCity } from '../landing/shared/data/loaders'

export interface WeatherCity {
  name: string
  lat: number
  lon: number
  countryCode: string
}

/** Throws on failure (mirrors `loadTft`'s own contract) — caller decides the fallback. */
export async function loadCityCatalog(): Promise<WeatherCity[]> {
  const tft = await loadTft()
  return tft.cities.map(
    (c: TftCity): WeatherCity => ({
      name: c.name,
      lat: c.lat,
      lon: c.lon,
      countryCode: c.country_code,
    }),
  )
}

/** Case-insensitive substring match against city name or country code. Empty query = no filter. */
export function filterCities(cities: WeatherCity[], query: string): WeatherCity[] {
  const q = query.trim().toLowerCase()
  if (!q) return cities
  return cities.filter((c) => c.name.toLowerCase().includes(q) || c.countryCode.toLowerCase().includes(q))
}
