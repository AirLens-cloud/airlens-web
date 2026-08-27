/**
 * predictions — city PM2.5 predictions (AODtoPM25Model v2).
 *
 * Ported from AirLens-platform apps/web `src/api/predictions.ts`. The source
 * read a bundled `public/data/predictions/grid_latest.json` that a Supabase
 * sync job wrote; here the artifact is read from the HF live dataset first
 * (`ml-data/predictions/grid_latest.json`) with the bundled copy as fallback,
 * matching this repo's cascade convention.
 *
 * Only finite rows pass (NaN coordinate/value = drop). The bands are NOT
 * re-sorted here — the model seam already guarantees p10 ≤ p50 ≤ p90, and
 * re-sorting downstream would hide a regression rather than surface it.
 *
 * The publishing job (`ml-predict`) is currently disabled upstream, so the
 * artifact can be stale. `generated_at` is returned verbatim so callers can
 * render an honest staleness label instead of presenting old values as live.
 */
import { HF_LIVE_BASE } from '../lib/config/dataSources'
import type { CityPrediction, CityPredictionResponse } from '../types/ml'

const HF_OBJECT_PATH = 'ml-data/predictions/grid_latest.json'
const STATIC_PATH = '/data/predictions/grid_latest.json'
const FETCH_TIMEOUT_MS = 5000

function isFiniteNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function finiteRows(rows: CityPrediction[]): CityPrediction[] {
  return rows.filter(
    (p): p is CityPrediction =>
      isFiniteNum(p?.lat) &&
      isFiniteNum(p?.lon) &&
      isFiniteNum(p?.predicted_p10) &&
      isFiniteNum(p?.predicted_p50) &&
      isFiniteNum(p?.predicted_p90),
  )
}

/**
 * A fetch/parse failure is NOT the same fact as a successful response with
 * zero rows — the former is "unavailable right now", the latter "no coverage
 * here". Callers that must render an honest Error state (vs. an honest Empty
 * state) use this variant; `fetchCityPredictions` collapses both to `[]`.
 */
export type CityPredictionsResult =
  | { ok: true; data: CityPrediction[]; generatedAt: string | null }
  | { ok: false }

async function readManifest(url: string): Promise<Partial<CityPredictionResponse> | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    if (!res.ok) return null
    return (await res.json()) as Partial<CityPredictionResponse>
  } catch {
    return null
  }
}

export async function fetchCityPredictionsResult(): Promise<CityPredictionsResult> {
  const json =
    (await readManifest(`${HF_LIVE_BASE}/${HF_OBJECT_PATH}`)) ?? (await readManifest(STATIC_PATH))
  if (!json) return { ok: false }
  return {
    ok: true,
    data: finiteRows(json.predictions ?? []),
    generatedAt: typeof json.generated_at === 'string' ? json.generated_at : null,
  }
}

/** Finite predictions only. `[]` on failure (data-independent load). */
export async function fetchCityPredictions(): Promise<CityPrediction[]> {
  const result = await fetchCityPredictionsResult()
  return result.ok ? result.data : []
}
