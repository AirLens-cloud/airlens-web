/**
 * Location choice store — the visitor's opt-in "this is roughly where I am"
 * pick, shared between the Home hero and the floating AqiCapsule (mounted
 * independently, on different pages, by `FluidChrome`) so personalizing on
 * one surface personalizes the other without a second prompt.
 *
 * Deliberately separate from `useGeolocation` (`hooks/useGeolocation.ts`,
 * `/today`'s own location state): that hook defaults to Seoul the moment the
 * page mounts, which is right for a weather reading (any coordinate works)
 * but wrong here — the AQI capsule/hero must keep showing the honest global
 * "thickest air" fallback until the visitor actually opts in, never a silent
 * default city. `choice` starts `null` and stays `null` until a real
 * request/pick.
 *
 * No account system — persistence is `localStorage` only, never sent to a
 * server. A private window or blocked storage just means the fallback
 * reappears next visit, same failure mode as `useGeolocation`.
 *
 * G1 (2026-09-05, user decision): a `source: 'geolocation'` choice — a real
 * GPS/Wi-Fi fix, not something the visitor typed — is never written to
 * disk. It lives in memory for the rest of this tab's session only; a
 * reload falls back to the honest fallback/approximate reading, and the
 * visitor re-clicks "Use my location"/"See air quality near me" to
 * personalize again. A `source: 'search'` choice keeps the prior
 * "personalize once, stays personalized" behavior — a typed-in city has no
 * extra privacy cost beyond what's already visible in the UI.
 */
import { create } from 'zustand'

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
}

const STORAGE_KEY = 'airlens-location-choice'

function readStored(): LocationChoice | null {
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
    // Geolocation is session-only (see the header comment) — never written
    // to disk. Clearing any existing key here (rather than leaving an
    // older search pick in place untouched) matches the documented reload
    // behavior: after a geolocation pick, a reload lands on the honest
    // fallback/approximate reading, not a stale prior choice.
    if (choice === null || choice.source === 'geolocation') window.localStorage.removeItem(STORAGE_KEY)
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(choice))
  } catch {
    // Storage denied/unavailable — in-memory state still works this session.
  }
}

export const useLocationChoiceStore = create<LocationChoiceState>((set) => ({
  choice: readStored(),
  setChoice: (choice) => {
    writeStored(choice)
    set({ choice })
  },
  clearChoice: () => {
    writeStored(null)
    set({ choice: null })
  },
}))
