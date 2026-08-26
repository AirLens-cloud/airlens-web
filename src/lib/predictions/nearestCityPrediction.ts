/**
 * nearestCityPrediction — pick the grid_latest.json prediction row geographically
 * nearest to (lat, lon).
 *
 * Mirrors `lib/today/forecast.ts` `nearestForecastCity`: same equirectangular
 * approximation (cheap, antimeridian-safe, precise enough to rank + gate a
 * coarse distance threshold) and the same honesty contract — beyond
 * `maxDistanceKm` the match is not "this location's" prediction, so the caller
 * degrades to an honest empty state instead of labelling a distant grid point
 * as the user's own.
 */
import type { CityPrediction } from '../../types/ml';

const EARTH_RADIUS_KM = 6371;

/** Same radius as the Today forecast city match (`FORECAST_CITY_MAX_DISTANCE_KM`). */
export const CITY_PREDICTION_MAX_DISTANCE_KM = 300;

export interface NearestCityPredictionMatch {
  prediction: CityPrediction;
  distanceKm: number;
}

export function nearestCityPrediction(
  predictions: CityPrediction[] | null | undefined,
  lat: number | null | undefined,
  lon: number | null | undefined,
  maxDistanceKm: number = CITY_PREDICTION_MAX_DISTANCE_KM,
): NearestCityPredictionMatch | null {
  if (!predictions || predictions.length === 0) return null;
  if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const latRad = (lat * Math.PI) / 180;
  let best: CityPrediction | null = null;
  let bestD = Infinity;
  for (const p of predictions) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
    const dLat = ((p.lat - lat) * Math.PI) / 180;
    const dLon = ((((p.lon - lon + 540) % 360) - 180) * Math.PI) / 180;
    const x = dLon * Math.cos(latRad);
    const d = dLat * dLat + x * x; // monotonic in true distance → sqrt unneeded for ranking
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  if (!best) return null;

  const distanceKm = Math.sqrt(bestD) * EARTH_RADIUS_KM;
  if (distanceKm > maxDistanceKm) return null;
  return { prediction: best, distanceKm };
}
