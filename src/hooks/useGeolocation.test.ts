// AAA coverage for useGeolocation: default-to-Seoul fallback, denial/error
// handling (never silently guesses a location), user-picked city persistence,
// localStorage failure tolerance (try/catch — private window, etc.), and the
// mount-time IP-approximate fallback (a stored/live user pick always wins
// over it; Seoul is the last resort when the approximate lookup also fails).
//
// NOTE: this repo's jsdom test environment does not implement
// `window.localStorage` at all (`typeof window.localStorage === 'undefined'`,
// unlike `sessionStorage` which works) — a pre-existing environment gap, not
// something this hook can rely on. Every test here installs its own
// in-memory `Storage` stand-in via `Object.defineProperty` and restores the
// original (missing) descriptor afterwards, so the hook's real
// `window.localStorage.getItem/setItem` calls have something to hit.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup, waitFor } from '@testing-library/react'
import { SEOUL_DEFAULT, useGeolocation } from './useGeolocation'

vi.mock('../lib/geo/approxLocation', () => ({ getApproxLocation: vi.fn() }))

import { getApproxLocation } from '../lib/geo/approxLocation'

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

let originalDescriptor: PropertyDescriptor | undefined

beforeEach(() => {
  originalDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')
  Object.defineProperty(window, 'localStorage', { value: createMemoryStorage(), configurable: true })
  vi.unstubAllGlobals()
  // Default: the approximate lookup finds nothing — most tests here are
  // about the localStorage/geolocation paths and shouldn't have to think
  // about the mount-time fetch. `mockReset` also drops call history from
  // the previous test (`vi.restoreAllMocks()` below doesn't, for a bare
  // `vi.fn()` mock with no original implementation to restore) — needed
  // for the "never fetches" call-count assertion below. Tests in the
  // fallback-chain describe block override the resolved value per-case.
  vi.mocked(getApproxLocation).mockReset().mockResolvedValue(null)
})

afterEach(() => {
  cleanup()
  if (originalDescriptor) Object.defineProperty(window, 'localStorage', originalDescriptor)
  else delete (window as { localStorage?: Storage }).localStorage
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('useGeolocation', () => {
  it('defaults to Seoul when nothing is stored', () => {
    const { result } = renderHook(() => useGeolocation())

    expect(result.current.location).toEqual(SEOUL_DEFAULT)
    expect(result.current.denied).toBe(false)
  })

  it('marks the request denied and keeps the default location on permission denial', () => {
    const getCurrentPosition = vi.fn((_success, error) => error({ code: 1, message: 'denied' }))
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } })

    const { result } = renderHook(() => useGeolocation())
    act(() => result.current.requestLocation())

    expect(result.current.denied).toBe(true)
    expect(result.current.location).toEqual(SEOUL_DEFAULT)
  })

  it('marks the request denied (never guesses) when geolocation is unsupported', () => {
    vi.stubGlobal('navigator', {})

    const { result } = renderHook(() => useGeolocation())
    act(() => result.current.requestLocation())

    expect(result.current.denied).toBe(true)
    expect(result.current.location.source).toBe('default')
  })

  it('adopts the resolved coordinates as a user-sourced location on success', () => {
    const getCurrentPosition = vi.fn((success) =>
      success({ coords: { latitude: 51.5074, longitude: -0.1278 } }),
    )
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } })

    const { result } = renderHook(() => useGeolocation())
    act(() => result.current.requestLocation())

    expect(result.current.location).toEqual({
      lat: 51.5074,
      lon: -0.1278,
      source: 'user',
      label: 'My location',
    })
  })

  it('setLocation persists a city-search pick and reloads it on the next mount', () => {
    const { result, unmount } = renderHook(() => useGeolocation())
    act(() => result.current.setLocation({ lat: 48.8566, lon: 2.3522, label: 'Paris' }))
    unmount()

    const { result: reloaded } = renderHook(() => useGeolocation())

    expect(reloaded.current.location).toEqual({ lat: 48.8566, lon: 2.3522, source: 'user', label: 'Paris' })
  })

  it('falls back to Seoul when localStorage throws (private window etc.)', () => {
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: () => {
          throw new Error('storage blocked')
        },
        setItem: () => {
          throw new Error('storage blocked')
        },
      },
      configurable: true,
    })

    const { result } = renderHook(() => useGeolocation())

    expect(result.current.location).toEqual(SEOUL_DEFAULT)
  })
})

describe('useGeolocation — priority chain: user > IP-approx > Seoul', () => {
  it('adopts the IP-approximate location as the default when nothing is stored', async () => {
    // Arrange
    vi.mocked(getApproxLocation).mockResolvedValue({ lat: 35.6762, lon: 139.6503, city: 'Tokyo' })
    // Act
    const { result } = renderHook(() => useGeolocation())
    // Assert
    await waitFor(() =>
      expect(result.current.location).toEqual({
        lat: 35.6762,
        lon: 139.6503,
        source: 'approx',
        label: 'Tokyo (approximate, IP-based)',
      }),
    )
  })

  it('labels an approximate location with no resolved city as "Approximate area"', async () => {
    vi.mocked(getApproxLocation).mockResolvedValue({ lat: 1, lon: 2, city: null })
    const { result } = renderHook(() => useGeolocation())
    await waitFor(() => expect(result.current.location.source).toBe('approx'))
    expect(result.current.location.label).toBe('Approximate area')
  })

  it('stays on Seoul when the approximate lookup also fails', async () => {
    // Arrange — the beforeEach default (resolves null), asserted explicitly here.
    vi.mocked(getApproxLocation).mockResolvedValue(null)
    // Act
    const { result } = renderHook(() => useGeolocation())
    await act(async () => {
      await Promise.resolve()
    })
    // Assert
    expect(result.current.location).toEqual(SEOUL_DEFAULT)
  })

  it('never fetches the approximate location when a user pick is already stored', () => {
    // Arrange
    window.localStorage.setItem(
      'airlens-weather-location',
      JSON.stringify({ lat: 48.8566, lon: 2.3522, source: 'user', label: 'Paris' }),
    )
    // Act
    renderHook(() => useGeolocation())
    // Assert
    expect(getApproxLocation).not.toHaveBeenCalled()
  })

  it('a live user request wins a race against a slower approximate lookup — never clobbered', async () => {
    // Arrange — the approximate fetch never resolves on its own; this test
    // resolves it manually, after the user's own pick has already landed.
    let resolveApprox: (value: { lat: number; lon: number; city: string | null } | null) => void = () => {}
    vi.mocked(getApproxLocation).mockReturnValue(
      new Promise((resolve) => {
        resolveApprox = resolve
      }),
    )
    const getCurrentPosition = vi.fn((success) => success({ coords: { latitude: 51.5074, longitude: -0.1278 } }))
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } })

    // Act — the user's own request resolves synchronously, before the
    // approximate lookup below ever does.
    const { result } = renderHook(() => useGeolocation())
    act(() => result.current.requestLocation())
    expect(result.current.location.source).toBe('user')

    await act(async () => {
      resolveApprox({ lat: 35.6762, lon: 139.6503, city: 'Tokyo' })
      await Promise.resolve()
    })

    // Assert — the slower approximate result never overwrote the live pick.
    expect(result.current.location).toEqual({
      lat: 51.5074,
      lon: -0.1278,
      source: 'user',
      label: 'My location',
    })
  })
})
