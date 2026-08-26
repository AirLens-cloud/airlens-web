// Globe coordinate convention — MUST match the ETL point-cloud generator that
// produced public/mirror/data/earth-points-*.bin so hotspots, wind, and the
// PM2.5 texture align with the point cloud:
//   phi = 90 - lat,  theta = lon + 180
//   x = -r·sinφ·cosθ,  y = r·cosφ,  z = r·sinφ·sinθ
//
// Ported verbatim from AirLens-platform apps/landing-lab
// `src/concepts/atmos/globeCoords.ts` (Wave L1, 2026-08-26).
import type { Hotspot } from './types'

const DEG = Math.PI / 180

export const GLOBE_R = 1.0

export function latLonToGlobe(lat: number, lon: number, r = GLOBE_R): [number, number, number] {
  const phi = (90 - lat) * DEG
  const theta = (lon + 180) * DEG
  const sp = Math.sin(phi)
  return [-r * sp * Math.cos(theta), r * Math.cos(phi), r * sp * Math.sin(theta)]
}

// Euler {x,y} that rotates the globe group so (lat,lon) faces the +Z camera.
export function rotationToFace(lat: number, lon: number): { x: number; y: number } {
  const [dx, dy, dz] = latLonToGlobe(lat, lon, 1)
  return { x: Math.atan2(dy, Math.hypot(dx, dz)), y: -Math.atan2(dx, dz) }
}

// PM2.5 hotspot cities. Only coordinates are fixed — the µg/m³ value is sampled
// live from the loaded grid (see AtmosScene), so it follows the data, never hardcoded.
export const HOTSPOTS: Hotspot[] = [
  { name: 'Delhi', lat: 28.61, lon: 77.21 },
  { name: 'Lahore', lat: 31.55, lon: 74.34 },
  { name: 'Beijing', lat: 39.9, lon: 116.4 },
]
