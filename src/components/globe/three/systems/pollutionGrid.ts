/**
 * pollutionGrid — spatial-grid pollution proximity query, shared by the CPU
 * (WindParticles.tsx) and GPU (pollutionTexture.ts, P3) particle paths.
 *
 * Extracted so both paths compute the exact same "pollution intensity at
 * (lat, lon)" quantity from the same sources — a second, drifted
 * reimplementation would silently disagree on tint at the CPU/GPU fallback
 * boundary.
 */
import { GLOBE_CONFIG } from '../../../../lib/config/globe';
import type { PollutionSource } from '../../../../types/globe';

const PT = GLOBE_CONFIG.GLOBE_V2.POLLUTION_TINT;
export const POLLUTION_RADIUS_DEG = PT.RADIUS_DEG;
export const POLLUTION_MAX_PM25 = PT.MAX_PM25;
export const POLLUTION_MIN_PM25 = PT.MIN_PM25;
export const FIRE_FRP_TO_PM25_FACTOR = PT.FIRE_FRP_TO_PM25_FACTOR;
export const FIRE_FRP_DEFAULT = PT.FIRE_FRP_DEFAULT;
export const FIRE_PM25_THRESHOLD = PT.FIRE_PM25_THRESHOLD;

const GRID_CELL = POLLUTION_RADIUS_DEG;

export function buildSpatialGrid(sources: PollutionSource[]): Map<string, PollutionSource[]> {
  const grid = new Map<string, PollutionSource[]>();
  for (const src of sources) {
    const key = `${Math.floor(src.lat / GRID_CELL)}:${Math.floor(src.lon / GRID_CELL)}`;
    const bucket = grid.get(key);
    if (bucket) bucket.push(src);
    else grid.set(key, [src]);
  }
  return grid;
}

/** Pollution intensity in [0, 1] at (lat, lon) — max of nearby sources' proximity-weighted intensity. */
export function queryGrid(grid: Map<string, PollutionSource[]>, lat: number, lon: number): number {
  const ci = Math.floor(lat / GRID_CELL);
  const cj = Math.floor(lon / GRID_CELL);
  let pollution = 0;
  for (let di = -1; di <= 1; di++) {
    for (let dj = -1; dj <= 1; dj++) {
      const bucket = grid.get(`${ci + di}:${cj + dj}`);
      if (!bucket) continue;
      for (let si = 0; si < bucket.length; si++) {
        const src = bucket[si];
        const dLat = lat - src.lat;
        const dLon = lon - src.lon;
        const dist = Math.sqrt(dLat * dLat + dLon * dLon);
        if (dist < POLLUTION_RADIUS_DEG) {
          const proximity = 1 - dist / POLLUTION_RADIUS_DEG;
          const intensity = Math.min(src.pm25 / POLLUTION_MAX_PM25, 1);
          pollution = Math.max(pollution, proximity * intensity);
        }
      }
    }
  }
  return pollution;
}
