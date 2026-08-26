// AAA coverage for useGeolocation: default-to-Seoul fallback, denial/error
// handling (never silently guesses a location), user-picked city persistence,
// and localStorage failure tolerance (try/catch — private window, etc.).
//
// NOTE: this repo's jsdom test environment does not implement
// `window.localStorage` at all (`typeof window.localStorage === 'undefined'`,
// unlike `sessionStorage` which works) — a pre-existing environment gap, not
// something this hook can rely on. Every test here installs its own
// in-memory `Storage` stand-in via `Object.defineProperty` and restores the
// original (missing) descriptor afterwards, so the hook's real
// `window.localStorage.getItem/setItem` calls have something to hit.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { SEOUL_DEFAULT, useGeolocation } from './useGeolocation'

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
