// useTodayCams — regression tests (AAA) for the hasLocation-keyed effect
// (header comment in useTodayCams.ts): a lat/lon change mid-fetch must not
// cancel the in-flight fetch nor leave `payload` stuck at 'loading', and
// React.StrictMode's mount/unmount/mount must still settle to 'ready'.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { useTodayCams } from './useTodayCams'
import type { ForecastPayload } from '../types/forecast'

vi.mock('../lib/today/forecastSource', () => ({
  fetchForecast: vi.fn(),
}))

import { fetchForecast } from '../lib/today/forecastSource'

afterEach(() => {
  vi.resetAllMocks()
})

// Each city sits exactly on its matching point so nearest-city resolution is
// unambiguous regardless of Earth-curvature rounding.
const POINT_A = { lat: 37.5665, lon: 126.978 } // Seoul
const POINT_B = { lat: 35.1796, lon: 129.0756 } // Busan

function payload(overrides: Partial<ForecastPayload> = {}): ForecastPayload {
  return {
    generated_at: '2026-08-26T00:00:00Z',
    model_version: 'v1',
    cities: [
      {
        name: 'CityA',
        lat: POINT_A.lat,
        lon: POINT_A.lon,
        country_code: 'KR',
        hourly: [{ time: '2026-08-26T00:00:00Z', pm25: 10 }],
      },
      {
        name: 'CityB',
        lat: POINT_B.lat,
        lon: POINT_B.lon,
        country_code: 'KR',
        hourly: [{ time: '2026-08-26T00:00:00Z', pm25: 30 }],
      },
    ],
    ...overrides,
  }
}

describe('useTodayCams', () => {
  it('stays loading and never fetches while lat/lon are null', () => {
    // Arrange + Act
    const { result } = renderHook(() => useTodayCams(null, null))
    // Assert
    expect(result.current.status).toBe('loading')
    expect(fetchForecast).not.toHaveBeenCalled()
  })

  it('resolves to the NEW point\'s nearest city when lat/lon changes before the pending fetch resolves, fetching only once', async () => {
    // Arrange — the fetch itself carries no location, so it stays in flight
    // across the rerender below; resolving it later must not "cancel" and
    // must not leave `payload` stuck at 'loading' (the header-comment bug).
    let resolveFetch: (p: ForecastPayload) => void = () => {}
    vi.mocked(fetchForecast).mockImplementation(
      () => new Promise((resolve) => { resolveFetch = resolve }),
    )
    const { result, rerender } = renderHook(
      ({ lat, lon }: { lat: number; lon: number }) => useTodayCams(lat, lon),
      { initialProps: { lat: POINT_A.lat, lon: POINT_A.lon } },
    )
    expect(result.current.status).toBe('loading')

    // Act — move to point B (still a resolved location, so `hasLocation`
    // does not flip and the effect must not re-fire) before the in-flight
    // fetch resolves, then resolve it.
    rerender({ lat: POINT_B.lat, lon: POINT_B.lon })
    resolveFetch(payload())
    await waitFor(() => expect(result.current.status).toBe('ready'))

    // Assert
    if (result.current.status !== 'ready') throw new Error('expected ready')
    expect(result.current.cityName).toBe('CityB')
    expect(result.current.current).toBe(30)
    expect(fetchForecast).toHaveBeenCalledTimes(1)
  })

  it('resolves to ready when StrictMode tears the effect down and re-mounts it while the first fetch is in flight', async () => {
    // Arrange — StrictMode must be the OUTERMOST element for React 19's dev
    // double-invoke to fire: a `wrapper` component that renders <StrictMode>
    // nests it under a function-component fiber, and then the effect runs
    // exactly once (no cleanup, no re-mount) — which made the earlier
    // wrapper-based version of this test pass even against the buggy hook.
    // RTL's `reactStrictMode` option puts StrictMode outermost.
    vi.mocked(fetchForecast).mockResolvedValue(payload())
    const lifecycle: string[] = []

    // Act
    const { result } = renderHook(
      () => {
        // Probe effect, sibling of the hook under test in the same component:
        // records whether StrictMode really did mount -> cleanup -> re-mount.
        useEffect(() => {
          lifecycle.push('setup')
          return () => { lifecycle.push('cleanup') }
        }, [])
        return useTodayCams(POINT_A.lat, POINT_A.lon)
      },
      { reactStrictMode: true },
    )
    await waitFor(() => expect(result.current.status).toBe('ready'))

    // Assert — precondition first: if this fails the test has gone vacuous
    // again (StrictMode did not double-invoke), not the hook.
    expect(lifecycle).toEqual(['setup', 'cleanup', 'setup'])
    if (result.current.status !== 'ready') throw new Error('expected ready')
    expect(result.current.cityName).toBe('CityA')
  })
})
