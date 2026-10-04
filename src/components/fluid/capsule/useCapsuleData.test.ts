import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { tierFromPm25, useCapsuleData } from './useCapsuleData'
import type { ForecastPayload } from '../../../types/forecast'
import type { ResolvedLocation } from '../../../lib/location/resolveLocation'

vi.mock('../../../lib/today/forecastSource', () => ({
  fetchForecast: vi.fn(),
}))

import { fetchForecast } from '../../../lib/today/forecastSource'

afterEach(() => {
  vi.resetAllMocks()
})

/** A resolved location that always sits nearest to the single-city fixtures
 * below (their one city is always named "Seoul" at the same coordinates) —
 * `useCapsuleData` no longer accepts a bare `{lat, lon}`, only a full
 * `ResolvedLocation` (W1a). The exact `source`/`label` are irrelevant to
 * these tests; `search` is just a valid, arbitrary choice. */
const SEOUL_LOCATION: ResolvedLocation = { lat: 37.5, lon: 127, label: 'Seoul, KR', source: 'search' }

/** Band-carrying source (a TFT-style publish). `band: false` models the live
 * deterministic feed (Open-Meteo CAMS), which omits p10/p90 entirely. */
function forecast(
  hourly: Array<{ pm25: number; pm25_p10?: number; pm25_p90?: number }>,
  band = true,
): ForecastPayload {
  return {
    generated_at: '2026-08-26T00:00:00Z',
    model_version: 'test',
    cities: [
      {
        name: 'Seoul',
        lat: 37.5,
        lon: 127,
        country_code: 'KR',
        hourly: hourly.map((h, i) => ({
          time: `2026-08-26T${String(i).padStart(2, '0')}:00:00Z`,
          pm25: h.pm25,
          ...(band
            ? {
                pm25_p10: h.pm25_p10 ?? h.pm25 - 5,
                pm25_p90: h.pm25_p90 ?? h.pm25 + 5,
              }
            : {}),
        })),
      },
    ],
  }
}

describe('tierFromPm25', () => {
  it('classifies boundary values into 6 tiers', () => {
    expect(tierFromPm25(10)).toBe('good')
    expect(tierFromPm25(20)).toBe('moderate')
    expect(tierFromPm25(50)).toBe('usg')
    expect(tierFromPm25(70)).toBe('unhealthy')
    expect(tierFromPm25(100)).toBe('very-unhealthy')
    expect(tierFromPm25(200)).toBe('hazardous')
  })
})

describe('useCapsuleData', () => {
  it('location=null never fetches and stays loading (still resolving, per useResolvedLocation)', () => {
    // Act
    const { result } = renderHook(() => useCapsuleData(null))
    // Assert
    expect(result.current.status).toBe('loading')
    expect(fetchForecast).not.toHaveBeenCalled()
  })

  it('maps a ready band-carrying forecast to capsule current/range/series', async () => {
    // Arrange
    vi.mocked(fetchForecast).mockResolvedValue(
      forecast(Array.from({ length: 24 }, (_, i) => ({ pm25: 20 + i }))),
    )
    // Act
    const { result } = renderHook(() => useCapsuleData(SEOUL_LOCATION))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    // Assert
    if (result.current.status !== 'ready') throw new Error('expected ready')
    expect(result.current.city).toBe('Seoul')
    expect(result.current.lat).toBe(37.5)
    expect(result.current.lon).toBe(127)
    expect(result.current.countryCode).toBe('KR')
    expect(result.current.current).toBe(20)
    expect(result.current.tier).toBe('moderate')
    expect(result.current.series24h).toHaveLength(24)
    expect(result.current.range).toEqual({ lo: 15, hi: 48 }) // p10 hour 0, p90 hour 23
  })

  it('reports range=null (never lo===hi) when the source publishes no p10/p90', async () => {
    // Arrange — the live deterministic feed: pm25 only, no band on any hour.
    vi.mocked(fetchForecast).mockResolvedValue(
      forecast(
        Array.from({ length: 24 }, (_, i) => ({ pm25: 20 + i })),
        false,
      ),
    )
    // Act
    const { result } = renderHook(() => useCapsuleData(SEOUL_LOCATION))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    // Assert
    if (result.current.status !== 'ready') throw new Error('expected ready')
    expect(result.current.range).toBeNull()
    expect(result.current.current).toBe(20)
    expect(result.current.series24h).toHaveLength(24)
    expect(result.current.series24h[0].p10).toBeNull()
    expect(result.current.series24h[0].p90).toBeNull()
  })

  it('resolves to missing (never fabricated) when the fetch fails', async () => {
    // Arrange
    vi.mocked(fetchForecast).mockRejectedValue(new Error('network'))
    // Act
    const { result } = renderHook(() => useCapsuleData(SEOUL_LOCATION))
    // Assert
    await waitFor(() => expect(result.current.status).toBe('missing'))
  })

  it('resolves to missing when every forecast source fails (null payload)', async () => {
    vi.mocked(fetchForecast).mockResolvedValue(null)
    const { result } = renderHook(() => useCapsuleData(SEOUL_LOCATION))
    await waitFor(() => expect(result.current.status).toBe('missing'))
  })

  it('resolves to missing when the feed has no cities', async () => {
    vi.mocked(fetchForecast).mockResolvedValue({ generated_at: 'x', model_version: 'x', cities: [] })
    const { result } = renderHook(() => useCapsuleData(SEOUL_LOCATION))
    await waitFor(() => expect(result.current.status).toBe('missing'))
  })

  it('flags alert=worsening when a later hour crosses into a worse tier', async () => {
    // Arrange: starts good (10), spikes to moderate-plus (40) within 24h
    const hourly = Array.from({ length: 24 }, (_, i) => ({ pm25: i === 10 ? 40 : 10 }))
    vi.mocked(fetchForecast).mockResolvedValue(forecast(hourly))
    // Act
    const { result } = renderHook(() => useCapsuleData(SEOUL_LOCATION))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    // Assert
    if (result.current.status !== 'ready') throw new Error('expected ready')
    expect(result.current.alert).toBe('worsening')
  })

  it('flags alert=steady when the tier never worsens in the next 24h', async () => {
    const hourly = Array.from({ length: 24 }, () => ({ pm25: 10 }))
    vi.mocked(fetchForecast).mockResolvedValue(forecast(hourly))
    const { result } = renderHook(() => useCapsuleData(SEOUL_LOCATION))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    if (result.current.status !== 'ready') throw new Error('expected ready')
    expect(result.current.alert).toBe('steady')
  })

  it('flags alert=unknown (3-way, never a guessed worsening/steady) with a single-hour series', async () => {
    vi.mocked(fetchForecast).mockResolvedValue(forecast([{ pm25: 10 }]))
    const { result } = renderHook(() => useCapsuleData(SEOUL_LOCATION))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    if (result.current.status !== 'ready') throw new Error('expected ready')
    expect(result.current.alert).toBe('unknown')
  })

  it('exposes the current-hour p10/p90 bound (distinct from the 24h range envelope)', async () => {
    // Arrange
    vi.mocked(fetchForecast).mockResolvedValue(
      forecast(Array.from({ length: 24 }, (_, i) => ({ pm25: 20 + i, pm25_p10: 20 + i - 2, pm25_p90: 20 + i + 2 }))),
    )
    // Act
    const { result } = renderHook(() => useCapsuleData(SEOUL_LOCATION))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    // Assert
    if (result.current.status !== 'ready') throw new Error('expected ready')
    expect(result.current.p10).toBe(18)
    expect(result.current.p90).toBe(22)
  })

  it('reports p10=null/p90=null (never derived from range) when the source publishes no band', async () => {
    vi.mocked(fetchForecast).mockResolvedValue(
      forecast(Array.from({ length: 24 }, (_, i) => ({ pm25: 20 + i })), false),
    )
    const { result } = renderHook(() => useCapsuleData(SEOUL_LOCATION))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    if (result.current.status !== 'ready') throw new Error('expected ready')
    expect(result.current.p10).toBeNull()
    expect(result.current.p90).toBeNull()
  })

  it('resolves to the nearest city to the given location, among several', async () => {
    // Arrange — two cities: Seoul (near the resolved point) and Riyadh (far).
    const payload: ForecastPayload = {
      generated_at: '2026-08-26T00:00:00Z',
      model_version: 'test',
      cities: [
        {
          name: 'Riyadh',
          lat: 24.7,
          lon: 46.7,
          country_code: 'SA',
          hourly: [{ time: '2026-08-26T00:00:00Z', pm25: 247 }],
        },
        {
          name: 'Seoul',
          lat: 37.5,
          lon: 127,
          country_code: 'KR',
          hourly: [{ time: '2026-08-26T00:00:00Z', pm25: 20 }],
        },
      ],
    }
    vi.mocked(fetchForecast).mockResolvedValue(payload)
    // Act — a resolved location near Seoul.
    const { result } = renderHook(() =>
      useCapsuleData({ lat: 37.6, lon: 127.1, label: 'Seoul, KR', source: 'search' }),
    )
    await waitFor(() => expect(result.current.status).toBe('ready'))
    // Assert
    if (result.current.status !== 'ready') throw new Error('expected ready')
    expect(result.current.city).toBe('Seoul')
  })

  it('resets to loading when the resolved location changes, so the old city never sits under a new location label', async () => {
    // Arrange — the near-Riyadh point resolves first, then a near-Seoul
    // point arrives. Without the reset, Riyadh would stay on screen while
    // the caller already reads a different city's location label.
    const payload: ForecastPayload = {
      generated_at: '2026-08-26T00:00:00Z',
      model_version: 'test',
      cities: [
        {
          name: 'Riyadh',
          lat: 24.7,
          lon: 46.7,
          country_code: 'SA',
          hourly: [{ time: '2026-08-26T00:00:00Z', pm25: 247 }],
        },
        {
          name: 'Seoul',
          lat: 37.5,
          lon: 127,
          country_code: 'KR',
          hourly: [{ time: '2026-08-26T00:00:00Z', pm25: 20 }],
        },
      ],
    }
    vi.mocked(fetchForecast).mockResolvedValue(payload)
    const RIYADH_LOCATION: ResolvedLocation = { lat: 24.8, lon: 46.8, label: 'Riyadh, SA', source: 'search' }
    const SEOUL_LOCATION_NEAR: ResolvedLocation = { lat: 37.6, lon: 127.1, label: 'Seoul, KR', source: 'search' }
    const { result, rerender } = renderHook(
      ({ location }: { location: ResolvedLocation | null }) => useCapsuleData(location),
      { initialProps: { location: RIYADH_LOCATION as ResolvedLocation | null } },
    )
    await waitFor(() => expect(result.current.status).toBe('ready'))
    if (result.current.status !== 'ready') throw new Error('expected ready')
    expect(result.current.city).toBe('Riyadh')
    // Act
    rerender({ location: SEOUL_LOCATION_NEAR })
    // Assert — loading first (no stale Riyadh under the new label), then Seoul.
    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('ready'))
    if (result.current.status !== 'ready') throw new Error('expected ready')
    expect(result.current.city).toBe('Seoul')
  })
})
