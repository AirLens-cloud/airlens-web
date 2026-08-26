// Domain types for the Ch4 (BRIEFING) chapter — kept out of the hook/component
// files per repo convention (no inline type declarations).
import type { Pm25Grid, FiresData, TftForecast } from '../shared/data/loaders'
import type { InkInstrumentKind } from '../../components/home/observatory/InkInstrument'

/** One of the three briefing instruments (methodology cards). */
export interface InstrumentDef {
  idx: string
  kind: InkInstrumentKind
  heading: string
  body: string
  source: string
}

/** The hottest real grid cell this pass — a coordinate label, never a made-up region name. */
export interface PeakCell {
  ug: number
  label: string
}

/**
 * One TFT city's forecast row, shaped for `DawnReport`. `dqss` is `'unknown'`
 * here — the mirror snapshot this chapter reads (`tft.json`) carries no
 * per-hour DQSS grade, and Glass-box doctrine forbids inventing one.
 */
export interface DawnForecastRow {
  city: string
  p50: number
  p10: number | null
  p90: number | null
  dqss: string
}

export interface DawnBriefingData {
  gridCells: number
  peak: PeakCell | null
  firesTotal: number
  forecast: DawnForecastRow | null
  /** Raw feeds, kept in state in case a later pass needs them (e.g. re-deriving `peak`). */
  pm25: Pm25Grid
  fires: FiresData
  tft: TftForecast
}

export type DawnBriefingState =
  | { status: 'loading'; data: null; error: null }
  | { status: 'ready'; data: DawnBriefingData; error: null }
  | { status: 'error'; data: null; error: string }
