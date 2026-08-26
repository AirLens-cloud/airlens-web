// Pure math for the AIRSHED concept: a local equirectangular-approximation plane
// centered on Seoul City Hall, a deterministic PRNG for building massing (no
// Math.random — the massing must render identically on every load), and the
// PM2.5 → color/height ramps. No `three` import here on purpose: this module
// is shared by the data hook (plain arrays) and the scene (three vectors),
// and keeping it three-free means a future non-3D consumer (the table, the
// HUD) can import it without pulling the render engine into its chunk.
//
// Ported verbatim from AirLens-platform apps/landing-lab
// `src/concepts/seoul/projection.ts` (Wave L3, 2026-08-26).

export const SEOUL_CENTER = { lat: 37.5665, lon: 126.978 }

const KM_PER_DEG_LAT = 111.32
const DEG2RAD = Math.PI / 180

/**
 * lon/lat → local plane [x, z] in kilometers, x = east, z = south. Good enough
 * at Seoul's ~0.35° span (equirectangular error is sub-meter here) — this is
 * navigational geometry, not a claim of geodetic precision.
 */
export function projectLocalKm(lat: number, lon: number): [number, number] {
  const cosLat0 = Math.cos(SEOUL_CENTER.lat * DEG2RAD)
  const x = (lon - SEOUL_CENTER.lon) * KM_PER_DEG_LAT * cosLat0
  const z = (lat - SEOUL_CENTER.lat) * KM_PER_DEG_LAT
  return [x, z]
}

/** Great-circle distance in km (haversine) — used for the honest "nearest forecast city" gap. */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const p1 = lat1 * DEG2RAD
  const p2 = lat2 * DEG2RAD
  const dp = (lat2 - lat1) * DEG2RAD
  const dl = (lon2 - lon1) * DEG2RAD
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

/** FNV-1a-ish string hash → uint32. Deterministic across sessions and platforms. */
export function hashSeed(input: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Mulberry32 PRNG — deterministic, seeded. Returns a `() => number in [0,1)` generator. */
export function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

/** pm25 (µg/m³) → a 3-stop color ramp, clean → warm → hot. Breakpoints follow the WHO
 *  guideline (15) and the sensitive-group threshold (35.5) from the shared ontology. */
export function pmToColor(pm: number, clean: string, warm: string, hot: string): string {
  const v = clamp(pm, 0, 150)
  const [c0, c1, mix] = v <= 35.5 ? [clean, warm, v / 35.5] : [warm, hot, (v - 35.5) / (150 - 35.5)]
  const [r0, g0, b0] = hexToRgb(c0)
  const [r1, g1, b1] = hexToRgb(c1)
  const t = clamp(mix, 0, 1)
  return rgbToHex(lerp(r0, r1, t), lerp(g0, g1, t), lerp(b0, b1, t))
}

/** pm25 (µg/m³) → extrusion height in scene km. A floor keeps every district a
 *  visible slab even at pm25 ≈ 0; the ceiling matches the grid's own cap (150). */
export function pmToHeight(pm: number): number {
  const HEIGHT_FLOOR_KM = 0.05
  const HEIGHT_RANGE_KM = 1.15
  return HEIGHT_FLOOR_KM + (clamp(pm, 0, 150) / 150) * HEIGHT_RANGE_KM
}
