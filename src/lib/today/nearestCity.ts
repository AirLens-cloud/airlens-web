/**
 * Nearest-city lookup for the CAMS forecast payload. `fetchForecast()`
 * returns every city in the feed (Home picks the "thickest air" one
 * regardless of viewer location); Today is location-specific, so it needs
 * the city nearest the viewer's chosen coordinates instead.
 */
import type { ForecastCity } from '../../types/forecast'

/** Great-circle distance in km. Exported for callers that need a raw
 * point-to-point distance (e.g. the capsule's "NEAREST TO YOU · N KM" label)
 * rather than a nearest-of-many lookup. */
export function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const r = 6371
  const dLat = ((bLat - aLat) * Math.PI) / 180
  const dLon = ((bLon - aLon) * Math.PI) / 180
  const lat1 = (aLat * Math.PI) / 180
  const lat2 = (bLat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return r * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

export interface NearestCityResult {
  city: ForecastCity
  distanceKm: number
}

/** Nearest city in the payload to (lat, lon), or null for an empty list. */
export function pickNearestCity(cities: ForecastCity[], lat: number, lon: number): NearestCityResult | null {
  let best: NearestCityResult | null = null
  for (const city of cities) {
    const distanceKm = haversineKm(lat, lon, city.lat, city.lon)
    if (best === null || distanceKm < best.distanceKm) best = { city, distanceKm }
  }
  return best
}
