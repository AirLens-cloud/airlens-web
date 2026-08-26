/**
 * Forecast payload types — ported subset from AirLens-platform apps/web
 * `src/types/ml.ts`. Honesty rename kept: this is the Open-Meteo CAMS
 * deterministic forecast payload, not a TFT/PINN model output — provenance
 * lives in the `source` field, not the type name.
 */

export interface ForecastHourly {
  time: string
  pm25: number
  /** Uncertainty bounds — absent/null for deterministic sources (Open-Meteo CAMS). */
  pm25_p10?: number | null
  pm25_p90?: number | null
}

export interface ForecastCity {
  name: string
  lat: number
  lon: number
  country_code: string
  /** Provenance — e.g. 'open-meteo' (CAMS, deterministic). */
  source?: string
  hourly: ForecastHourly[]
}

export interface ForecastPayload {
  generated_at: string
  model_version: string
  /** Provenance — 'open-meteo' = CAMS deterministic forecast (no p10/p90 band). */
  source?: string
  cities: ForecastCity[]
}

// ── Weather forecast (Open-Meteo, location-based) ───────────────────────────
// Ported from AirLens-platform apps/web `src/types/weather.ts`.

/** Single hourly forecast data point. */
export interface ForecastDataPoint {
  time: string // ISO 8601 hour string
  pm25: number // predicted PM2.5 µg/m³
  pm25_p10?: number // lower uncertainty bound
  pm25_p90?: number // upper uncertainty bound
  temperature: number // °C
  humidity: number // %
  windSpeed: number // m/s
  weatherCode: number // WMO weather code
}

/** 24-hour weather + PM2.5 forecast response. */
export interface WeatherForecastData {
  lat: number
  lon: number
  timezone: string
  hourly: ForecastDataPoint[]
  fetchedAt: number // Date.now() timestamp for cache freshness
}
