/**
 * Weather-code bucketing — ported verbatim from AirLens-platform apps/web
 * `src/lib/today/weatherCondition.ts` (single source for both the sky-phase
 * resolver and any UI condition label).
 */

export const WEATHER_CONDITIONS = [
  'clear',
  'cloudy',
  'fog',
  'drizzle',
  'rain',
  'snow',
  'thunder',
] as const

export type WeatherCondition = (typeof WEATHER_CONDITIONS)[number]

/**
 * WMO weather_code (Open-Meteo) -> AirLens weather-condition bucket.
 * Unknown/out-of-range/absent -> 'clear' (honest fallback — never fabricate
 * a thunderstorm).
 */
export function weatherCodeToCondition(code: number | null | undefined): WeatherCondition {
  if (code == null) return 'clear'
  if (code === 0 || code === 1) return 'clear'
  if (code === 2 || code === 3) return 'cloudy'
  if (code === 45 || code === 48) return 'fog'
  if (code >= 51 && code <= 57) return 'drizzle'
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'
  if (code >= 95 && code <= 99) return 'thunder'
  return 'clear'
}

/** Plain-English label — this repo has no i18n yet (see WfDataState). */
export const WEATHER_CONDITION_LABEL: Record<WeatherCondition, string> = {
  clear: 'Clear',
  cloudy: 'Cloudy',
  fog: 'Fog',
  drizzle: 'Drizzle',
  rain: 'Rain',
  snow: 'Snow',
  thunder: 'Thunderstorm',
}
