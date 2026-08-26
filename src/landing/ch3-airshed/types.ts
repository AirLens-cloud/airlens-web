// Domain types for the Ch3 (AIRSHED) chapter — kept out of the
// component/module files so they live in one dedicated place (repo rule: no
// inline type declarations). Ported from AirLens-platform apps/landing-lab
// `src/concepts/seoul/types.ts` (Wave L3, 2026-08-26); import path updated for
// this repo's shallower `src/landing/` nesting, and the `shap: ShapSeoul`
// field is dropped from `SeoulData` — this port excludes `ShapPanel`
// (approved decision D3), so nothing here reads it.
import type { Pm25Grid, TftForecast, WindField } from '../shared/data/loaders'
import type { SeoulDistricts } from './geo'

// ── Per-district derived state ───────────────────────────────────────────────
export interface DistrictInfo {
  code: string
  name: string
  nameEng: string
  centroid: { lat: number; lon: number }
  /** µg/m³, sampled from the 1° PM2.5 grid at the district centroid — never per-district measured. */
  pm25: number
  /** SEOUL.pmClean → pmWarm → pmHot ramp, interpolated from pm25. */
  colorHex: string
  /** Extrusion height in scene units (km-scale), derived from pm25. */
  height: number
  /** Local plane [x, z] km, centered on Seoul City Hall (37.5665, 126.978). */
  localCentroid: [number, number]
  /** Outer ring(s) of the polygon projected to local plane km, one array per ring. */
  ringsLocal: [number, number][][]
  /** Deterministic seed for procedural building massing (hash of code — never Math.random). */
  seed: number
}

export interface ForecastGap {
  /** Nearest TFT-covered city to Seoul, however far — honesty requires naming it. */
  nearestCity: string
  nearestCountry: string
  distanceKm: number
}

export interface SeoulData {
  districts: DistrictInfo[]
  wind: WindField
  pm25: Pm25Grid
  tft: TftForecast
  raw: SeoulDistricts
  forecastGap: ForecastGap
  /** Mean PM2.5 across all 25 district centroids — drives the haze thickness. */
  meanPm25: number
}

export type SeoulState =
  | { status: 'loading'; data: null; error: null }
  | { status: 'ready'; data: SeoulData; error: null }
  | { status: 'error'; data: null; error: string }
