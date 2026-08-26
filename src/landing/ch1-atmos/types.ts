// Domain types for the Ch1 (ATMOS) chapter — kept out of the component/module
// files so they live in one dedicated place (repo rule: no inline type
// declarations). Ported verbatim from AirLens-platform apps/landing-lab
// `src/concepts/atmos/types.ts` (Wave L1, 2026-08-26); import path updated for
// this repo's shallower `src/landing/` nesting.
import type {
  EarthPoints,
  FiresData,
  Pm25Grid,
  TftForecast,
  WindField,
} from '../shared/data/loaders'

// ── Globe / hotspots ─────────────────────────────────────────────────────────
export interface Hotspot {
  name: string
  lat: number
  lon: number
}

// Screen position (0..1, top-left origin) of a hotspot, plus whether it faces the
// camera (near side). Written each frame by HotspotProjector, read by HotspotLeaders.
export interface HotspotScreen {
  name: string
  pm25: number
  x: number
  y: number
  front: boolean
}

// ── ATMOS data orchestration ─────────────────────────────────────────────────
export interface AtmosData {
  points: EarthPoints
  pm25: Pm25Grid
  wind: WindField
  tft: TftForecast
  fires: FiresData
  topo: unknown
}

export type AtmosState =
  | { status: 'loading'; data: null; error: null }
  | { status: 'ready'; data: AtmosData; error: null }
  | { status: 'error'; data: null; error: string }
