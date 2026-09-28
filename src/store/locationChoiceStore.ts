/**
 * Location choice store — the single source of truth for where every
 * location-aware surface (Today, Home, the floating AqiCapsule) thinks the
 * visitor is. `useResolvedLocation.ts` wraps this store; `resolveLocation.ts`
 * turns its `choice`/`approx` pair into one `ResolvedLocation`.
 *
 * `choice` is the visitor's own opt-in pick (a geolocation fix or a
 * city-search pick) — shared between every surface so personalizing on one
 * page personalizes the rest without a second prompt. It starts `null` and
 * stays `null` until a real request/pick; `approx` (the edge's IP-
 * approximate location) and `requesting`/`denied` (in-flight/outcome of a
 * geolocation request) are tracked alongside it so `resolveLocation()` has
 * everything it needs in one place.
 *
 * No account system — persistence is `localStorage` only, never sent to a
 * server. A private window or blocked storage just means the fallback
 * reappears next visit.
 *
 * G1 (2026-09-05, user decision): a `source: 'geolocation'` choice — a real
 * GPS/Wi-Fi fix, not something the visitor typed — is never written to
 * disk. It lives in memory for the rest of this tab's session only; a
 * reload lands on whatever's actually on disk — the honest fallback/
 * approximate reading if nothing was ever persisted, or an earlier
 * `search` pick if one is — and the visitor re-clicks "Use my location"/
 * "See air quality near me" to personalize with geolocation again. The
 * decision is specifically about not writing a GPS/Wi-Fi fix to disk, not
 * about erasing an unrelated explicit choice the visitor already made —
 * `writeStored` treats a geolocation choice as a true no-op, never
 * touching an existing key. A `source: 'search'` choice keeps the prior
 * "personalize once, stays personalized" behavior — a typed-in city has no
 * extra privacy cost beyond what's already visible in the UI.
 */
import { create } from 'zustand'
import { getApproxLocation } from '../lib/geo/approxLocation'
import type { ApproxState } from '../lib/location/resolveLocation'

export type LocationChoiceSource = 'geolocation' | 'search'

export interface LocationChoice {
  lat: number
  lon: number
  label: string
  source: LocationChoiceSource
}

interface LocationChoiceState {
  choice: LocationChoice | null
  setChoice: (choice: LocationChoice) => void
  clearChoice: () => void
  approx: ApproxState
  /** Internal re-entrancy guard for `loadApprox()` — flips to `true`
   * synchronously the instant a load starts, before `getApproxLocation()`
   * resolves, so two consumers mounting in the same commit (e.g. Home's
   * hero and the floating capsule) never both kick off a fetch. Not part
   * of `useResolvedLocation()`'s returned surface. */
  approxRequested: boolean
  loadApprox: () => void
  requesting: boolean
  setRequesting: (requesting: boolean) => void
  denied: boolean
  setDenied: (denied: boolean) => void
}

const STORAGE_KEY = 'airlens-location-choice'

// Pre-W1a `useGeolocation` (now removed — see `useResolvedLocation.ts`)
// persisted every chosen location, INCLUDING a precise device GPS fix
// labeled 'My location', to this key. Only a real city-search pick is
// worth carrying forward into the new key; see `migrateLegacyLocation`
// below for the full migration rule.
const LEGACY_STORAGE_KEY = 'airlens-weather-location'
// The "<Name>, <CC>" format Today's old `handleSelectCity` wrote:
// `${city.name}, ${city.countryCode}` — a 2-letter ISO country code.
const CITY_SEARCH_LABEL_RE = /^.+, [A-Z]{2}$/

interface LegacyLocation {
  lat: number
  lon: number
  source: string
  label: string
}

function parseLegacy(raw: string): LegacyLocation | null {
  const parsed = JSON.parse(raw) as Partial<LegacyLocation>
  if (
    typeof parsed.lat !== 'number' ||
    typeof parsed.lon !== 'number' ||
    !Number.isFinite(parsed.lat) ||
    !Number.isFinite(parsed.lon) ||
    typeof parsed.label !== 'string' ||
    typeof parsed.source !== 'string'
  ) {
    return null
  }
  return { lat: parsed.lat, lon: parsed.lon, label: parsed.label, source: parsed.source }
}

function newKeyHasValidRecord(): boolean {
  try {
    if (typeof window === 'undefined') return false
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return false
    const parsed = JSON.parse(raw) as Partial<LocationChoice>
    return (
      typeof parsed.lat === 'number' &&
      typeof parsed.lon === 'number' &&
      Number.isFinite(parsed.lat) &&
      Number.isFinite(parsed.lon) &&
      typeof parsed.label === 'string'
    )
  } catch {
    return false
  }
}

/**
 * One-time migration from the pre-W1a `airlens-weather-location` key. Only
 * a real city-search pick (source `'user'`, a "<Name>, <CC>" label, never
 * the `'My location'` geolocation label) is migrated — a device GPS fix is
 * exactly what G1 forbids persisting, and `'default'`/`'approx'` were never
 * a chosen pick to begin with. If the new key already holds a valid record,
 * it always wins and the legacy one is discarded untouched. Either way the
 * legacy key is deleted afterwards, so this runs at most once per browser.
 */
function migrateLegacyLocation(): void {
  let legacyRaw: string | null
  try {
    if (typeof window === 'undefined') return
    legacyRaw = window.localStorage.getItem(LEGACY_STORAGE_KEY)
  } catch {
    return
  }
  if (legacyRaw === null) return

  try {
    if (!newKeyHasValidRecord()) {
      const legacy = parseLegacy(legacyRaw)
      if (
        legacy &&
        legacy.source === 'user' &&
        legacy.label !== 'My location' &&
        CITY_SEARCH_LABEL_RE.test(legacy.label)
      ) {
        writeStored({ lat: legacy.lat, lon: legacy.lon, label: legacy.label, source: 'search' })
      }
    }
  } catch {
    // Malformed legacy payload — nothing worth migrating.
  } finally {
    try {
      window.localStorage.removeItem(LEGACY_STORAGE_KEY)
    } catch {
      // Storage denied/unavailable — best-effort cleanup only.
    }
  }
}

function readStored(): LocationChoice | null {
  migrateLegacyLocation()
  try {
    if (typeof window === 'undefined') return null
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<LocationChoice>
    if (
      typeof parsed.lat !== 'number' ||
      typeof parsed.lon !== 'number' ||
      !Number.isFinite(parsed.lat) ||
      !Number.isFinite(parsed.lon) ||
      typeof parsed.label !== 'string'
    ) {
      return null
    }
    // A stored `geolocation` record should never exist going forward —
    // `writeStored` below deliberately skips persisting one. Seeing one
    // here means it's a leftover from before that guard shipped (Home's
    // "See air quality near me" CTA has written these since PR #41/#61,
    // pre-dating this store's G1 no-persist rule) — discard it and clean
    // the stale key rather than resurrecting a coordinate policy says
    // shouldn't survive a reload.
    if (parsed.source === 'geolocation') {
      writeStored(null)
      return null
    }
    return {
      lat: parsed.lat,
      lon: parsed.lon,
      label: parsed.label,
      source: 'search',
    }
  } catch {
    return null
  }
}

function writeStored(choice: LocationChoice | null): void {
  try {
    if (typeof window === 'undefined') return
    // Geolocation is session-only (see the header comment) — the decision
    // is specifically about not writing a GPS/Wi-Fi fix to disk, NOT about
    // clearing whatever else is already there. A true no-op: an existing
    // persisted search pick (e.g. the visitor searched "Seoul" earlier,
    // then also tried "Use my location" this session) is left exactly as
    // it was — it's the visitor's own explicit choice, this store has no
    // standing to erase it just because a different, unrelated pick also
    // happened. Only `choice === null` (an explicit `clearChoice()`) still
    // removes the key.
    if (choice !== null && choice.source === 'geolocation') return
    if (choice === null) window.localStorage.removeItem(STORAGE_KEY)
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(choice))
  } catch {
    // Storage denied/unavailable — in-memory state still works this session.
  }
}

export const useLocationChoiceStore = create<LocationChoiceState>((set, get) => ({
  choice: readStored(),
  setChoice: (choice) => {
    writeStored(choice)
    set({ choice })
  },
  clearChoice: () => {
    writeStored(null)
    set({ choice: null })
  },
  approx: { status: 'pending' },
  approxRequested: false,
  loadApprox: () => {
    if (get().approxRequested) return
    set({ approxRequested: true })
    getApproxLocation().then((location) => {
      set({ approx: location !== null ? { status: 'ready', location } : { status: 'failed' } })
    })
  },
  requesting: false,
  setRequesting: (requesting) => set({ requesting }),
  denied: false,
  setDenied: (denied) => set({ denied }),
}))
