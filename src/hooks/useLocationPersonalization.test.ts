// AAA coverage for useLocationPersonalization: no-prompt default, denial /
// unsupported-browser handling (never guesses a location), success write-
// through to the shared store, selectCity's derived label, and the
// independently-resolved `approx` value (never folded into `choice` — see
// the hook's own header for why).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup, waitFor } from '@testing-library/react'
import { useLocationPersonalization } from './useLocationPersonalization'
import { useLocationChoiceStore } from '../store/locationChoiceStore'

vi.mock('../lib/geo/approxLocation', () => ({ getApproxLocation: vi.fn() }))

import { getApproxLocation } from '../lib/geo/approxLocation'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  useLocationChoiceStore.getState().clearChoice()
})

beforeEach(() => {
  useLocationChoiceStore.setState({ choice: null })
  // Default: no approximate location — tests below the "approx" describe
  // block override this per-case.
  vi.mocked(getApproxLocation).mockResolvedValue(null)
})

describe('useLocationPersonalization', () => {
  it('starts with no choice, no prompt fired, and no approx yet (unresolved)', () => {
    const { result } = renderHook(() => useLocationPersonalization())

    expect(result.current.choice).toBeNull()
    expect(result.current.requesting).toBe(false)
    expect(result.current.denied).toBe(false)
    expect(result.current.approx).toBeNull()
  })

  it('marks denied (never guesses a location) when geolocation is unsupported', () => {
    vi.stubGlobal('navigator', {})

    const { result } = renderHook(() => useLocationPersonalization())
    act(() => result.current.requestGeolocation())

    expect(result.current.denied).toBe(true)
    expect(result.current.choice).toBeNull()
  })

  it('marks denied on permission refusal, choice stays null', () => {
    const getCurrentPosition = vi.fn((_success, error) => error({ code: 1, message: 'denied' }))
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } })

    const { result } = renderHook(() => useLocationPersonalization())
    act(() => result.current.requestGeolocation())

    expect(result.current.denied).toBe(true)
    expect(result.current.choice).toBeNull()
  })

  it('writes the resolved coordinates to the shared store as a geolocation choice', () => {
    const getCurrentPosition = vi.fn((success) =>
      success({ coords: { latitude: 51.5074, longitude: -0.1278 } }),
    )
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } })

    const { result } = renderHook(() => useLocationPersonalization())
    act(() => result.current.requestGeolocation())

    expect(result.current.choice).toEqual({
      lat: 51.5074,
      lon: -0.1278,
      label: 'My location',
      source: 'geolocation',
    })
    expect(result.current.denied).toBe(false)
  })

  it('selectCity writes a search-sourced choice with a "City, CC" label', () => {
    const { result } = renderHook(() => useLocationPersonalization())

    act(() => result.current.selectCity({ name: 'Paris', lat: 48.8566, lon: 2.3522, countryCode: 'FR' }))

    expect(result.current.choice).toEqual({
      lat: 48.8566,
      lon: 2.3522,
      label: 'Paris, FR',
      source: 'search',
    })
  })

  it('clearChoice resets back to unpersonalized', () => {
    const { result } = renderHook(() => useLocationPersonalization())
    act(() => result.current.selectCity({ name: 'Paris', lat: 48.8566, lon: 2.3522, countryCode: 'FR' }))
    expect(result.current.choice).not.toBeNull()

    act(() => result.current.clearChoice())

    expect(result.current.choice).toBeNull()
  })

  it('shares one choice across independent hook instances (Home + capsule)', () => {
    const home = renderHook(() => useLocationPersonalization())
    const capsule = renderHook(() => useLocationPersonalization())

    act(() => home.result.current.selectCity({ name: 'Tokyo', lat: 35.6762, lon: 139.6503, countryCode: 'JP' }))

    expect(capsule.result.current.choice).toEqual({
      lat: 35.6762,
      lon: 139.6503,
      label: 'Tokyo, JP',
      source: 'search',
    })
  })
})

describe('useLocationPersonalization — approx', () => {
  it('resolves the approximate location independently of choice', async () => {
    // Arrange
    vi.mocked(getApproxLocation).mockResolvedValue({ lat: 35.6762, lon: 139.6503, city: 'Tokyo' })
    // Act
    const { result } = renderHook(() => useLocationPersonalization())
    // Assert
    await waitFor(() => expect(result.current.approx).toEqual({ lat: 35.6762, lon: 139.6503, city: 'Tokyo' }))
    expect(result.current.choice).toBeNull() // never folded into choice
  })

  it('stays populated after a real choice lands — clearChoice has an immediate fallback', async () => {
    // Arrange
    vi.mocked(getApproxLocation).mockResolvedValue({ lat: 35.6762, lon: 139.6503, city: 'Tokyo' })
    const { result } = renderHook(() => useLocationPersonalization())
    await waitFor(() => expect(result.current.approx).not.toBeNull())
    // Act
    act(() => result.current.selectCity({ name: 'Paris', lat: 48.8566, lon: 2.3522, countryCode: 'FR' }))
    // Assert
    expect(result.current.choice).not.toBeNull()
    expect(result.current.approx).toEqual({ lat: 35.6762, lon: 139.6503, city: 'Tokyo' })
  })
})
