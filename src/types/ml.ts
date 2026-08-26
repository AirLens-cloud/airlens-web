/**
 * ML domain types — Globe-consumed subset ported from AirLens-platform
 * apps/web `src/types/ml.ts` (G1 engine landing).
 *
 * Only the city-prediction contract the Globe's PredictionMarkers layer reads
 * is carried over; the SHAP / engine-version / MLResult shapes belong to
 * surfaces this repo does not have yet.
 */

/**
 * A single city PM2.5 prediction (AODtoPM25Model v2). The bands are already
 * re-ordered to p10 ≤ p50 ≤ p90 at the model seam — nothing downstream sorts
 * them again, so a regression stays visible instead of being hidden.
 * `observed_pm25` is a co-located observation where one exists, not a label.
 */
export interface CityPrediction {
  name: string
  lat: number
  lon: number
  timestamp?: string
  predicted_p10: number
  predicted_p50: number
  predicted_p90: number
  /** p90 − p10 (interval width, µg/m³). */
  uncertainty?: number
  /** Epistemic (model) standard deviation — excludes aleatoric, so the band can read narrow. */
  epistemic_std?: number
  /** uncertainty ÷ p50 (normalized interval width). */
  uncertainty_normalized?: number
  /** Co-located observation where one exists. null = no observation, not a prediction label. */
  observed_pm25?: number | null
  model_version?: string
  source?: string
  /**
   * Prediction confidence grade (A–F). A different quantity from sensor DQSS
   * (`dqss_scores.final_score`) — derived from observation freshness, source
   * tier, composition and epistemic disagreement. null for fallback
   * predictions or when it cannot be computed.
   */
  confidence_grade?: string | null
}

/** `grid_latest.json` top-level schema. */
export interface CityPredictionResponse {
  generated_at: string
  model_version: string
  model_available: boolean
  count: number
  predictions: CityPrediction[]
  metadata?: {
    quantiles?: number[]
    unit?: string
    note?: string
    epistemic_uncertainty?: boolean
  }
}
