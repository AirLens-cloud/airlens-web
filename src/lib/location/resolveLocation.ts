/**
 * resolveLocation — the one priority chain every location-aware surface
 * (Today, Home, the floating AqiCapsule) resolves through: `useResolvedLocation.ts`
 * wraps this over `useLocationChoiceStore`.
 *
 * Priority: a real opt-in choice (geolocation fix or city search) wins.
 * Failing that, the edge's IP-approximate location, once it resolves.
 * Failing that too — or while the approximate lookup is still in flight and
 * nothing has been chosen — `null` ("still resolving") until the approximate
 * lookup either succeeds or fails; only a `failed` approximate lookup (never
 * a merely-`pending` one) falls through to `SEOUL_DEFAULT`. This is what
 * prevents a Seoul flash that then jumps to a real approximate city the
 * moment the lookup lands.
 *
 * Pure and React-free by design — a plain function over
 * `LocationChoice | null` and `ApproxState`, easy to unit test without
 * mounting a hook.
 */
import type { LocationChoice } from '../../store/locationChoiceStore'
import type { ApproxLocation } from '../geo/approxLocation'

export type LocationSource = 'geolocation' | 'search' | 'approx' | 'default'

export interface ResolvedLocation {
  lat: number
  lon: number
  label: string
  source: LocationSource
}

/** The edge's IP-approximate lookup, as a 3-state async result (rather than
 * `ApproxLocation | null`, which cannot distinguish "still in flight" from
 * "resolved to nothing") — the distinction `resolveLocation` needs to avoid
 * showing Seoul for the split second before a real approximate location
 * lands. */
export type ApproxState = { status: 'pending' } | { status: 'ready'; location: ApproxLocation } | { status: 'failed' }

/** Fixed fallback shown — honestly labeled as not the visitor's own — when
 * nothing else resolved: no stored/session choice, and the IP-approximate
 * lookup failed (or is unavailable, e.g. `vite dev`'s missing edge function). */
export const SEOUL_DEFAULT: ResolvedLocation = { lat: 37.5665, lon: 126.978, label: 'Seoul, KR', source: 'default' }

/** Place text while `resolveLocation()` is still `null` — shown with no source
 * badge, so a not-yet-resolved location is never labeled as the default. */
export const LOCATING_LABEL = 'Locating…'

/** One denial notice per resolved source, so every surface can render
 * `DENIED_NOTICE[location.source]` instead of re-deriving per-source copy.
 * `geolocation` is unreachable in practice — a denied/failed geolocation
 * request can never itself be the resolved source, since `useResolvedLocation`
 * only ever sets a `geolocation` choice on success — but the entry stays
 * truthful rather than omitted, matching `LocationSource`'s full domain. */
export const DENIED_NOTICE: Record<LocationSource, string> = {
  default: 'Location permission was not granted — showing the default location (Seoul).',
  approx: 'Location permission was not granted — showing an approximate (IP-based) location instead.',
  search: 'Location permission was not granted — keeping the city you chose.',
  geolocation: 'Location permission was not granted.',
}

/**
 * @param choice The visitor's opt-in pick (geolocation fix or city search),
 * or `null` if none has been made this session/stored.
 * @param approx The edge's IP-approximate lookup's current state.
 * @returns The resolved location, or `null` while still resolving (no
 * choice yet, and the approximate lookup hasn't settled either way).
 */
export function resolveLocation(choice: LocationChoice | null, approx: ApproxState): ResolvedLocation | null {
  if (choice !== null) {
    return { lat: choice.lat, lon: choice.lon, label: choice.label, source: choice.source }
  }
  if (approx.status === 'ready') {
    return {
      lat: approx.location.lat,
      lon: approx.location.lon,
      label: approx.location.city ?? 'Approximate area',
      source: 'approx',
    }
  }
  if (approx.status === 'failed') {
    return SEOUL_DEFAULT
  }
  return null
}
