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
    return {
      lat: parsed.lat,
      lon: parsed.lon,
      label: parsed.label,
      source: parsed.source === 'geolocation' ? 'geolocation' : 'search',
    }
  } catch {
    return null
  }
}

function writeStored(choice: LocationChoice | null): void {
  try {
    if (typeof window === 'undefined') return
    if (choice === null) window.localStorage.removeItem(STORAGE_KEY)
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
