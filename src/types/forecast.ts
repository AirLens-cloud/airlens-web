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

// ── Weather page proxy payloads (Wave W1, 2026-08-26) ───────────────────────
// Passthrough of the Community API Worker's `/api/proxy/open-meteo-weather`
// and `/api/proxy/open-meteo-aq` routes — themselves a thin cache over
// Open-Meteo's own response shape (parallel arrays keyed by field, index-
// aligned to `time`). Every field beyond `time` is optional: the upstream
// can omit one without failing the whole request, and a `wind_direction_10m`
// proxy field is mid-rollout (fail-soft — S3 renders speed-only when absent).
// no-fake-data: an absent field must read as `undefined`/null downstream,
// never a fabricated 0.

export interface OpenMeteoWeatherHourly {
  time: string[]
  temperature_2m?: (number | null)[]
  relative_humidity_2m?: (number | null)[]
  wind_speed_10m?: (number | null)[]
  wind_direction_10m?: (number | null)[]
  weather_code?: (number | null)[]
  apparent_temperature?: (number | null)[]
  precipitation_probability?: (number | null)[]
  cloud_cover?: (number | null)[]
  uv_index?: (number | null)[]
}

export interface OpenMeteoWeatherProxyResponse {
  hourly: OpenMeteoWeatherHourly
}

export interface OpenMeteoAqHourly {
  time: string[]
  pm2_5?: (number | null)[]
}

export interface OpenMeteoAqProxyResponse {
  hourly: OpenMeteoAqHourly
}
