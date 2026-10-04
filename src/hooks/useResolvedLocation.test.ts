/**
 * useResolvedLocation — AAA tests over the shared `useLocationChoiceStore`.
 * Replaces the deleted `useGeolocation.test.ts` / `useLocationPersonalization.test.ts`
 * (ported cases: geolocation success/denial/timeout-shape, city search,
 * G1 privacy) plus new W1a coverage (loadApprox dedupe/sharing across
 * mounted consumers, denied sharing, selectCity clearing denied).
 *
 * The store is a module-level Zustand singleton (not remounted per test), so
 * each test resets it directly via `.setState()` rather than
 * `vi.resetModules()` + re-import — matching the store's own precedent for
 * hooks that sit on top of it.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useResolvedLocation } from './useResolvedLocation'
import { useLocationChoiceStore } from '../store/locationChoiceStore'
import { SEOUL_DEFAULT } from '../lib/location/resolveLocation'
import type { WeatherCity } from '../lib/cityCatalog'

vi.mock('../lib/geo/approxLocation', () => ({
  getApproxLocation: vi.fn(),
}))

const TOKYO: WeatherCity = { name: 'Tokyo', countryCode: 'JP', lat: 35.6762, lon: 139.6503 }

// jsdom in this repo's vitest config has no working `window.localStorage`
// (`--localstorage-file` not provided) — same reason `locationChoiceStore.test.ts`
// stubs its own in-memory implementation rather than relying on jsdom's.
function createMemoryStorage(): Storage {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size
    },
  }
}

function resetStore(): void {
  useLocationChoiceStore.setState({
    choice: null,
    approx: { status: 'pending' },
    approxRequested: false,
    requesting: false,
    denied: false,
  })
}

beforeEach(async () => {
  Object.defineProperty(window, 'localStorage', { value: createMemoryStorage(), configurable: true })
  Object.defineProperty(window, 'sessionStorage', { value: createMemoryStorage(), configurable: true })
  resetStore()
  const { getApproxLocation } = await import('../lib/geo/approxLocation')
  vi.mocked(getApproxLocation).mockReset()
})

afterEach(() => {
  resetStore()
  vi.unstubAllGlobals()
})

describe('useResolvedLocation', () => {
  it('loadApprox fires once on mount and resolves `location` to the fixed Seoul default on failure', async () => {
    // Arrange
    const { getApproxLocation } = await import('../lib/geo/approxLocation')
    vi.mocked(getApproxLocation).mockResolvedValue(null)
    // Act
    const { result } = renderHook(() => useResolvedLocation())
    // Assert — resolving (no choice, approx pending) until the lookup settles
    expect(result.current.location).toBeNull()
    await waitFor(() => expect(result.current.location).toEqual(SEOUL_DEFAULT))
    expect(getApproxLocation).toHaveBeenCalledTimes(1)
  })

  it('loadApprox is deduped across two consumers mounted together (shared store, one fetch)', async () => {
    // Arrange
    const { getApproxLocation } = await import('../lib/geo/approxLocation')
    vi.mocked(getApproxLocation).mockResolvedValue({ lat: 1, lon: 2, city: 'Testville' })
    // Act — mirrors Home's hero + the floating capsule both mounting the hook
    const first = renderHook(() => useResolvedLocation())
    const second = renderHook(() => useResolvedLocation())
    await waitFor(() => expect(first.result.current.location?.source).toBe('approx'))
    // Assert
    expect(second.result.current.location).toEqual({ lat: 1, lon: 2, label: 'Testville', source: 'approx' })
    expect(getApproxLocation).toHaveBeenCalledTimes(1)
  })

  it('selectCity resolves to a "search" location immediately, ahead of the approx lookup', async () => {
    // Arrange — an approx lookup that never resolves during this test
    const { getApproxLocation } = await import('../lib/geo/approxLocation')
    vi.mocked(getApproxLocation).mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useResolvedLocation())
    // Act
    act(() => result.current.selectCity(TOKYO))
    // Assert
    expect(result.current.location).toEqual({ lat: 35.6762, lon: 139.6503, label: 'Tokyo, JP', source: 'search' })
  })

  it('selectCity clears a prior denied flag', async () => {
    // Arrange
    const { getApproxLocation } = await import('../lib/geo/approxLocation')
    vi.mocked(getApproxLocation).mockResolvedValue(null)
    useLocationChoiceStore.setState({ denied: true })
    const { result } = renderHook(() => useResolvedLocation())
    expect(result.current.denied).toBe(true)
    // Act
    act(() => result.current.selectCity(TOKYO))
    // Assert
    expect(result.current.denied).toBe(false)
  })

  it('denied is shared between two mounted consumers via the same store', async () => {
    // Arrange
    const { getApproxLocation } = await import('../lib/geo/approxLocation')
    vi.mocked(getApproxLocation).mockResolvedValue(null)
    const geolocationMock = {
      getCurrentPosition: (_success: PositionCallback, error?: PositionErrorCallback) => {
        error?.({ code: 1, message: 'denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError)
      },
    }
    vi.stubGlobal('navigator', { ...navigator, geolocation: geolocationMock })
    const first = renderHook(() => useResolvedLocation())
    const second = renderHook(() => useResolvedLocation())
    // Act
    act(() => first.result.current.requestGeolocation())
    // Assert
    await waitFor(() => expect(second.result.current.denied).toBe(true))
  })

  it('requestGeolocation on success resolves a "geolocation" location and never writes the fix to any localStorage key (G1 privacy)', async () => {
    // Arrange
    const { getApproxLocation } = await import('../lib/geo/approxLocation')
    vi.mocked(getApproxLocation).mockResolvedValue(null)
    const FIX_LAT = 37.111222
    const FIX_LON = 127.333444
    const geolocationMock = {
      getCurrentPosition: (success: PositionCallback) => {
        success({ coords: { latitude: FIX_LAT, longitude: FIX_LON } } as GeolocationPosition)
      },
    }
    vi.stubGlobal('navigator', { ...navigator, geolocation: geolocationMock })
    const { result } = renderHook(() => useResolvedLocation())
    // Act
    act(() => result.current.requestGeolocation())
    // Assert
    await waitFor(() =>
      expect(result.current.location).toEqual({ lat: FIX_LAT, lon: FIX_LON, label: 'My location', source: 'geolocation' }),
    )
    expect(result.current.requesting).toBe(false)
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)
      const value = key ? window.localStorage.getItem(key) : null
      if (value === null) continue
      expect(value).not.toContain(String(FIX_LAT))
      expect(value).not.toContain(String(FIX_LON))
    }
  })

  it('requestGeolocation on failure sets denied and clears requesting, without changing location', async () => {
    // Arrange
    const { getApproxLocation } = await import('../lib/geo/approxLocation')
    vi.mocked(getApproxLocation).mockResolvedValue(null)
    const geolocationMock = {
      getCurrentPosition: (_success: PositionCallback, error?: PositionErrorCallback) => {
        error?.({ code: 1, message: 'denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError)
      },
    }
    vi.stubGlobal('navigator', { ...navigator, geolocation: geolocationMock })
    const { result } = renderHook(() => useResolvedLocation())
    // Act
    act(() => result.current.requestGeolocation())
    // Assert
    await waitFor(() => expect(result.current.denied).toBe(true))
    expect(result.current.requesting).toBe(false)
  })

  it('requestGeolocation without navigator.geolocation support sets denied immediately (no crash)', async () => {
    // Arrange
    const { getApproxLocation } = await import('../lib/geo/approxLocation')
    vi.mocked(getApproxLocation).mockResolvedValue(null)
    vi.stubGlobal('navigator', { ...navigator, geolocation: undefined })
    const { result } = renderHook(() => useResolvedLocation())
    // Act
    act(() => result.current.requestGeolocation())
    // Assert
    expect(result.current.denied).toBe(true)
  })

  it('clearChoice drops a chosen city and falls back through the priority chain', async () => {
    // Arrange
    const { getApproxLocation } = await import('../lib/geo/approxLocation')
    vi.mocked(getApproxLocation).mockResolvedValue(null)
    const { result } = renderHook(() => useResolvedLocation())
    act(() => result.current.selectCity(TOKYO))
    expect(result.current.location?.source).toBe('search')
    // Act
    act(() => result.current.clearChoice())
    // Assert
    await waitFor(() => expect(result.current.location).toEqual(SEOUL_DEFAULT))
  })
})
