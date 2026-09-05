/**
 * Types for the TimesFM zero-shot + CQR conformal PM2.5 forecast band
 * (`w3-band-v1`), published to the HF live dataset by the AirLens-platform
 * models pipeline (`models/eval/tft/forecast_payload.py` — the schema's
 * source of truth; this repo has no local copy of the contract file, so the
 * shapes below are derived from that builder plus a live probe of the
 * published artifact, not from a checked-in JSON Schema).
 *
 * Every band value is `number | null` end to end — see `api/forecastBand.ts`'s
 * header for why a null must never be coerced to 0.
 */

export const FORECAST_BAND_SCHEMA_VERSION = 'w3-band-v1'

/** The three horizons this repo serves. An h+48 horizon, if the artifact ever
 * ships one, is dropped at the fetcher rather than rendered — product
 * decision, not a schema limitation. */
export const FORECAST_BAND_LEAD_HOURS = [1, 6, 24] as const
export type ForecastBandLeadHours = (typeof FORECAST_BAND_LEAD_HOURS)[number]

export interface ForecastBandHorizon {
  lead_hours: ForecastBandLeadHours
  valid_time: string
  p10: number | null
  p50: number | null
  p90: number | null
}

export interface ForecastBandCity {
  name: string
  horizons: ForecastBandHorizon[]
}

export interface ForecastBandPicpClaim {
  picp80_holdout: number | null
  n_holdout: number
  status: 'ok' | 'provisional' | 'no_holdout_claim'
}

export interface ForecastBandUncertainty {
  method: string | null
  /** Keyed by lead_hours as a string (the source JSON's own key shape). */
  picp80_claim_by_horizon: Record<string, ForecastBandPicpClaim>
  provisional_horizons: number[]
}

/**
 * The document ships `status: "unscored"` (never a fabricated letter grade)
 * until a scorer is wired up for this forecast track — Glass-box §5, same
 * discipline as `dqss-uncertainty-policy.md`.
 */
export interface ForecastBandDqss {
  grade: string | null
  status: string
  reason: string | null
}

export interface ForecastBandResponse {
  schema_version: string
  generated_at: string
  model: string
  issue_time: string
  cities: ForecastBandCity[]
  uncertainty: ForecastBandUncertainty | null
  dqss: ForecastBandDqss | null
}
