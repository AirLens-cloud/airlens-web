// Module-level Promise cache for the mirror datasets: a dataset shared by
// several concept sections is fetched exactly once. Every fetch failure throws
// so the caller can render an honest empty/error state (never silent fallback).
//
// Ported verbatim from AirLens-platform apps/landing-lab
// `src/shared/data/loaders.ts` (Wave L0, 2026-08-26). MIRROR path and cache
// semantics unchanged — data lives at `public/mirror/**` in this repo too
// (see docs/DATA-SNAPSHOT.md for provenance).

const MIRROR = '/mirror'
const URL = {
  pm25Bin: `${MIRROR}/data/pm25.bin`,
  pm25Meta: `${MIRROR}/data/pm25.meta.json`,
  wind: `${MIRROR}/data/wind.json`,
  topo: `${MIRROR}/data/earth-topo.json`,
  countries: `${MIRROR}/data/countries-110m.json`,
  fires: `${MIRROR}/data/fires.json`,
  tft: `${MIRROR}/data/tft.json`,
  choropleth: `${MIRROR}/data/policy-registry/choropleth.json`,
  sdid: `${MIRROR}/data/policy-impact/sdid_results.json`,
  earthPointsLow: `${MIRROR}/data/earth-points-low.bin`,
  earthPointsMedium: `${MIRROR}/data/earth-points-medium.bin`,
} as const

// ── types ───────────────────────────────────────────────────────────────────
export interface Pm25Meta {
  nLat: number
  nLon: number
  latMin: number
  lonMin: number
  dLat: number
  dLon: number
  cap: number
  encoding: 'sqrt'
  timestamp: number
}

export interface Pm25Grid {
  meta: Pm25Meta
  data: Uint8Array
  decodeByte: (b: number) => number
  sampleAt: (lat: number, lon: number) => number
}

export interface WindHeader {
  nx: number
  ny: number
  lo1: number
  la1: number
  dx: number
  dy: number
  refTime?: string
  forecastTime?: number
}

export interface WindField {
  header: WindHeader
  u: Float32Array
  v: Float32Array
  sample: (lat: number, lon: number) => [number, number]
}

// [lat, lon, frp, brightness]
export type FireRow = [number, number, number, number]
export interface FiresData {
  refTime: string | null
  total: number
  kept: number
  rows: FireRow[]
}

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

export interface ChoroplethCountry {
  name: string
  region: string
  totalPolicies: number
  pm25AnnualRatio: number
  [k: string]: unknown
}
export interface ChoroplethData {
  metric: string
  countries: Record<string, ChoroplethCountry>
}

export interface SdidData {
  sdid: {
    att: number
    se: number
    ci_95: [number, number]
    p_value: number
    significant: string
    unit_weights: Record<string, number>
  }
  [k: string]: unknown
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

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetch ${url} → ${res.status}`)
  return new Uint8Array(await res.arrayBuffer())
}

const wrapLon = (lon: number) => (((lon + 180) % 360) + 360) % 360 - 180
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)

// ── PM2.5 grid (sqrt-encoded Uint8 raster) ──────────────────────────────────
export function loadPm25(): Promise<Pm25Grid> {
  return once('pm25', async () => {
    const [meta, data] = await Promise.all([
      fetchJson<Pm25Meta>(URL.pm25Meta),
      fetchBytes(URL.pm25Bin),
    ])
    const decodeByte = (b: number) => {
      const t = b / 255
      return t * t * meta.cap
    }
    const decodeIdx = (latIdx: number, lonIdx: number) =>
      decodeByte(data[latIdx * meta.nLon + lonIdx] ?? 0)
    const sampleAt = (lat: number, lon: number) => {
      const fx = (wrapLon(lon) - meta.lonMin) / meta.dLon
      const fy = (clamp(lat, -90, 90) - meta.latMin) / meta.dLat
      const x0 = Math.floor(fx)
      const y0 = clamp(Math.floor(fy), 0, meta.nLat - 1)
      const y1 = clamp(y0 + 1, 0, meta.nLat - 1)
      const c0 = ((x0 % meta.nLon) + meta.nLon) % meta.nLon
      const c1 = (c0 + 1) % meta.nLon
      const tx = fx - x0
      const ty = fy - y0
      const top = decodeIdx(y0, c0) * (1 - tx) + decodeIdx(y0, c1) * tx
      const bot = decodeIdx(y1, c0) * (1 - tx) + decodeIdx(y1, c1) * tx
      return top * (1 - ty) + bot * ty
    }
    return { meta, data, decodeByte, sampleAt }
  })
}

// ── GFS wind [u, v] ─────────────────────────────────────────────────────────
export function loadWind(): Promise<WindField> {
  return once('wind', async () => {
    const recs = await fetchJson<Array<{ header: WindHeader; data: number[] }>>(URL.wind)
    if (!Array.isArray(recs) || recs.length < 2) throw new Error('wind.json: expected [u, v] records')
    const header = recs[0].header
    const u = Float32Array.from(recs[0].data)
    const v = Float32Array.from(recs[1].data)
    const { nx, ny, lo1, la1, dx, dy } = header
    const at = (r: number, c: number, arr: Float32Array) => arr[r * nx + c] ?? 0
    const sample = (lat: number, lon: number): [number, number] => {
      // rows run from la1 southward (lat decreasing); cols from lo1 east, wrapping.
      const fx = (wrapLon(lon) - lo1) / dx
      const fy = (la1 - clamp(lat, la1 - (ny - 1) * dy, la1)) / dy
      const x0 = Math.floor(fx)
      const c0 = ((x0 % nx) + nx) % nx
      const c1 = (c0 + 1) % nx
      const r0 = clamp(Math.floor(fy), 0, ny - 1)
      const r1 = clamp(r0 + 1, 0, ny - 1)
      const tx = fx - x0
      const ty = fy - Math.floor(fy)
      const lerp2 = (arr: Float32Array) => {
        const top = at(r0, c0, arr) * (1 - tx) + at(r0, c1, arr) * tx
        const bot = at(r1, c0, arr) * (1 - tx) + at(r1, c1, arr) * tx
        return top * (1 - ty) + bot * ty
      }
      return [lerp2(u), lerp2(v)]
    }
    return { header, u, v, sample }
  })
}

// ── passthrough datasets ────────────────────────────────────────────────────
export function loadTopo(): Promise<unknown> {
  return once('topo', () => fetchJson<unknown>(URL.topo))
}
export function loadCountries(): Promise<unknown> {
  return once('countries', () => fetchJson<unknown>(URL.countries))
}
export function loadFires(): Promise<FiresData> {
  return once('fires', () => fetchJson<FiresData>(URL.fires))
}
export function loadTft(): Promise<TftForecast> {
  return once('tft', () => fetchJson<TftForecast>(URL.tft))
}
export function loadChoropleth(): Promise<ChoroplethData> {
  return once('choropleth', () => fetchJson<ChoroplethData>(URL.choropleth))
}
export function loadSdid(): Promise<SdidData> {
  return once('sdid', () => fetchJson<SdidData>(URL.sdid))
}

// Earth point cloud: contiguous little-endian vec4<f32> records [x, y, z, intensity].
// xyz already sit on a sphere of radius ≈1.02; intensity (0..1) encodes land texture.
export interface EarthPoints {
  count: number
  positions: Float32Array // length count*3
  intensity: Float32Array // length count
}
export function loadEarthPoints(lod: 'low' | 'medium'): Promise<EarthPoints> {
  return once(`earth-${lod}`, async () => {
    const bytes = await fetchBytes(lod === 'low' ? URL.earthPointsLow : URL.earthPointsMedium)
    const f32 = new Float32Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 4))
    const count = Math.floor(f32.length / 4)
    const positions = new Float32Array(count * 3)
    const intensity = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      positions[i * 3] = f32[i * 4]
      positions[i * 3 + 1] = f32[i * 4 + 1]
      positions[i * 3 + 2] = f32[i * 4 + 2]
      intensity[i] = f32[i * 4 + 3]
    }
    return { count, positions, intensity }
  })
}
