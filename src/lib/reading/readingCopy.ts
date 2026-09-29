/**
 * readingCopy — the source-disclosure lines every headline surface (Home
 * hero, the floating capsule's panel) prints under a `PrimaryReadingReady`.
 * One place so the two surfaces can never word the same reading differently.
 */
import { DEFAULT_MAX_AGE_HOURS } from '../../api/gridSnapshot'
import type { PrimaryReadingReady, PrimaryReadingSecondary } from './resolvePrimaryReading'

/** The sources an `'unavailable'` reading tried — the `source` line of the
 * `WfDataState` every headline surface shows in place of a number. */
export const PRIMARY_READING_SOURCES = 'GEFS-Aerosols grid analysis or Open-Meteo CAMS forecast (via HF live-data)'

function distanceSuffix(distanceKm: number | null): string {
  return distanceKm != null ? ` · ${Math.round(distanceKm)} km` : ''
}

/** Where the headline number comes from. An analysis is never worded as a
 * measurement (DESIGN.md §8). */
export function readingSourceLine(reading: PrimaryReadingReady): string {
  if (reading.source === 'analysis') {
    return `Model analysis, nearest grid cell${distanceSuffix(reading.place.distanceKm)}`
  }
  const cc = reading.place.countryCode ? `, ${reading.place.countryCode}` : ''
  return `CAMS forecast for ${reading.place.label}${cc}${distanceSuffix(reading.place.distanceKm)}`
}

/** The CAMS city-forecast line under an analysis headline — its own value,
 * which city it is for, how far that city is, and whether it is stale, so it
 * is never read as the analysis number's own uncertainty (Glass-box). */
export function secondaryForecastLine(secondary: PrimaryReadingSecondary): string {
  const stale = secondary.stale === true ? ' · stale' : ''
  return `City forecast (CAMS) · ${secondary.cityName}, ${secondary.countryCode}${distanceSuffix(
    secondary.distanceKm,
  )} · ${Math.round(secondary.pm25)} µg/m³${stale}`
}

/** What a stale headline says in place of tier-based health advice — advice
 * on a days-old number would read as current guidance. */
export function staleReadingNote(reading: PrimaryReadingReady): string {
  return reading.ageMs === null
    ? 'Stale — its publish time is unknown, so it may not reflect the air now.'
    : `Stale — published more than ${DEFAULT_MAX_AGE_HOURS}h ago, so it may not reflect the air now.`
}
