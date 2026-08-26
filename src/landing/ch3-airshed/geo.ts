// Seoul municipality boundaries — the one dataset this chapter needs that the
// PARTICULATE/ATMOS chapters have no use for, so it lives here rather than in
// `shared/data/loaders.ts`. Boundary source: KOSTAT 2013 via
// github.com/southkorea/seoul-maps (public government data), simplified —
// committed at `public/geo/seoul-districts.json` with the attribution embedded
// as a GeoJSON foreign member. Navigational geometry only: the chapter
// renders honest labels about what the shapes are (district boundaries +
// procedural massing), never "real buildings".
//
// Ported from AirLens-platform apps/landing-lab `src/shared/geo/seoul.ts`
// (Wave L3, 2026-08-26); the SHAP-explanation loader/types (`loadShapSeoul`,
// `ShapSeoul`, `ShapFeatureRow`) are dropped — this port excludes `ShapPanel`
// (approved decision D3), so nothing here needs them.

export interface SeoulDistrictProps {
  code: string
  name: string
  name_eng: string
  base_year: string
}

export interface SeoulDistrictFeature {
  type: 'Feature'
  properties: SeoulDistrictProps
  geometry: {
    type: 'Polygon' | 'MultiPolygon'
    coordinates: number[][][] | number[][][][]
  }
}

export interface SeoulDistricts {
  type: 'FeatureCollection'
  attribution?: string
  features: SeoulDistrictFeature[]
}

let districtsPromise: Promise<SeoulDistricts> | null = null

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} → ${res.status}`)
  return (await res.json()) as T
}

export function loadSeoulDistricts(): Promise<SeoulDistricts> {
  districtsPromise ??= fetchJson<SeoulDistricts>('/geo/seoul-districts.json').catch((err) => {
    districtsPromise = null
    throw err
  })
  return districtsPromise
}

/** Flat [lon, lat] ring iterator over Polygon/MultiPolygon outer rings. */
export function outerRings(f: SeoulDistrictFeature): number[][][] {
  return f.geometry.type === 'Polygon'
    ? [(f.geometry.coordinates as number[][][])[0]]
    : (f.geometry.coordinates as number[][][][]).map((poly) => poly[0])
}

/** Area-weighted centroid of a feature's outer rings (good enough for labels/sampling). */
export function featureCentroid(f: SeoulDistrictFeature): { lat: number; lon: number } {
  let sumLat = 0
  let sumLon = 0
  let n = 0
  for (const ring of outerRings(f)) {
    for (const [lon, lat] of ring) {
      sumLon += lon
      sumLat += lat
      n++
    }
  }
  return n === 0 ? { lat: 37.5665, lon: 126.978 } : { lat: sumLat / n, lon: sumLon / n }
}
