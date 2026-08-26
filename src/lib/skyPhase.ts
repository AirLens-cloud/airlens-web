/**
 * Sky-phase logic for the Weather page's sky-glass hero backdrop (S1, F2).
 *
 * Ported (subset) from AirLens-platform apps/web `src/lib/skyPhase.ts`. Only
 * `skyPhaseForWeatherAt` is needed here — the Weather page always resolves
 * phase for a *named place* (the viewed city, possibly remote), never the
 * viewer's own clock, so the viewer-clock variant (`skyPhaseForWeather` in
 * the source) is not ported (no unused code).
 *
 * The gradient *values* live in `src/styles/weather.css` as `--sky-grad-<phase>`
 * tokens — this module is the phase-key contract only, not a duplicate color
 * source.
 */
import { weatherCodeToCondition } from './weatherCondition'

/** Phase keys — each must have a matching `--sky-grad-<key>` token in weather.css. */
export const SKY_PHASES = {
  // time-of-day (clear sky)
  dawn: true,
  morning: true,
  noon: true,
  dusk: true,
  night: true,
  // weather conditions (non-clear)
  cloudy: true,
  fog: true,
  drizzle: true,
  rain: true,
  snow: true,
  thunder: true,
} as const

export type SkyPhase = keyof typeof SKY_PHASES

function timeOfDayPhase(hour: number): SkyPhase {
  if (hour < 6) return 'dawn'
  if (hour < 11) return 'morning'
  if (hour < 16) return 'noon'
  if (hour < 19) return 'dusk'
  return 'night'
}

/**
 * Time-of-day phase at a longitude, from mean solar time (UTC + lon/15h).
 *
 * A page about a remote city rendered from the viewer's browser would
 * otherwise paint the viewer's own sky. Solar time is computed geometry, not
 * a measurement we lack — the hourly payload carries no timezone offset —
 * and ignoring political timezones/DST is well inside tolerance for picking
 * 1 of 5 clear-sky gradients.
 */
export function skyPhaseAtLongitude(lon: number, date: Date = new Date()): SkyPhase {
  const solarHours = date.getUTCHours() + date.getUTCMinutes() / 60 + lon / 15
  // Wrap into [0,24) — lon/15 spans +-12h so the sum can fall outside.
  const h = ((solarHours % 24) + 24) % 24
  return timeOfDayPhase(h)
}

/**
 * `skyPhaseForWeather` for a named place: a real (non-clear) condition wins
 * outright, and a clear sky resolves against that place's solar time.
 */
export function skyPhaseForWeatherAt(
  weatherCode: number | null | undefined,
  lon: number,
  date: Date = new Date(),
): SkyPhase {
  const condition = weatherCodeToCondition(weatherCode)
  return condition === 'clear' ? skyPhaseAtLongitude(lon, date) : condition
}
