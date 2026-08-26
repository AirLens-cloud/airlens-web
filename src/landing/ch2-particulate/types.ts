// Domain types for the Ch2 (PARTICULATE) chapter — kept out of the
// component/module files so they live in one dedicated place (repo rule: no
// inline type declarations). Ported verbatim from AirLens-platform
// apps/landing-lab `src/concepts/particulate/types.ts` (Wave L2, 2026-08-26);
// import path updated for this repo's shallower `src/landing/` nesting.
import type { Pm25Grid, TftCity, TftForecast, WindField } from '../shared/data/loaders'

export interface ParticulateData {
  pm25: Pm25Grid
  wind: WindField
  tft: TftForecast
  /** earth-topo.json — coastlines, so the field can be placed on the planet. */
  topo: unknown
}

export type ParticulateState =
  | { status: 'loading'; data: null; error: null }
  | { status: 'ready'; data: ParticulateData; error: null }
  | { status: 'error'; data: null; error: string }

/** A city plus what the live grid says about its air right now. */
export interface Place {
  name: string
  country: string
  lat: number
  lon: number
  /** µg/m³ sampled from the PM2.5 grid at this city's coordinates. */
  pm25: number
  /** m/s, magnitude of the GFS surface wind at this city. */
  windSpeed: number
  forecast: TftCity | null
}

/** The lat/lon rectangle the shader field covers — the "window" onto the air. */
export interface Window {
  lon0: number
  lat0: number
  lonSpan: number
  latSpan: number
}

/** Which field renderer is actually on screen (measured, not assumed). */
export type FieldMode = 'gpu' | 'fallback'
