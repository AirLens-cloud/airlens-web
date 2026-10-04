// useTodayGrid — nearest-cell resolution + the coordinate-tagged stale-result
// guard (AAA), same pattern `useCapsuleData.test.ts` already covers for its
// own `ResolvedFor` state.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useTodayGrid } from './useTodayGrid'
import type { GlobalGridSnapshot } from '../types/data'

vi.mock('../api/gridSnapshot', () => ({
  fetchGlobalGridSnapshot: vi.fn(),
}))

import { fetchGlobalGridSnapshot } from '../api/gridSnapshot'

afterEach(() => {
  vi.resetAllMocks()
})

function snapshot(pm25: number, distanceKm = 1): GlobalGridSnapshot {
  return {
    pm25,
    aqi: 50,
    lat: 37.5,
    lon: 127,
    source: 'global_grid',
    updatedAt: '2026-08-26T00:00:00Z',
    stale: false,
    nearbyCells: [
      { lat: 37.5, lon: 127, pm25, aqi: 50, updatedAt: '2026-08-26T00:00:00Z', distanceKm },
    ],
  }
}

describe('useTodayGrid', () => {
  it('stays loading while lat/lon are null and never fetches', () => {
    // Arrange + Act
    const { result } = renderHook(() => useTodayGrid(null, null))
    // Assert
    expect(result.current.status).toBe('loading')
    expect(fetchGlobalGridSnapshot).not.toHaveBeenCalled()
  })

  it('resolves to ready with the fetched cell', async () => {
    // Arrange
    vi.mocked(fetchGlobalGridSnapshot).mockResolvedValue(snapshot(20, 3.4))
    // Act
    const { result } = renderHook(() => useTodayGrid(37.5, 127))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    // Assert
    if (result.current.status !== 'ready') throw new Error('expected ready')
    expect(result.current.pm25).toBe(20)
    expect(result.current.distanceKm).toBe(3.4)
  })

  it('resolves to missing (never fabricated) when the fetch rejects', async () => {
    // Arrange
    vi.mocked(fetchGlobalGridSnapshot).mockRejectedValue(new Error('network'))
    // Act
    const { result } = renderHook(() => useTodayGrid(37.5, 127))
    // Assert
    await waitFor(() => expect(result.current.status).toBe('missing'))
  })

  it('resets to loading the instant coordinates change, before the new fetch resolves', async () => {
    // Arrange — first point resolves to ready.
    vi.mocked(fetchGlobalGridSnapshot).mockResolvedValueOnce(snapshot(20))
    const { result, rerender } = renderHook(({ lat, lon }: { lat: number; lon: number }) => useTodayGrid(lat, lon), {
      initialProps: { lat: 37.5, lon: 127 },
    })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    if (result.current.status !== 'ready') throw new Error('expected ready')
    expect(result.current.pm25).toBe(20)

    // Act — coordinates move to a new point; leave the new fetch pending so
    // the assertion below cannot be satisfied by a fetch that already landed.
    let resolveSecond: (snap: GlobalGridSnapshot) => void = () => {}
    vi.mocked(fetchGlobalGridSnapshot).mockImplementationOnce(
      () => new Promise((resolve) => { resolveSecond = resolve }),
    )
    rerender({ lat: 10, lon: 10 })

    // Assert — loading immediately, never the stale first point's reading
    // sitting under the new coordinates.
    expect(result.current.status).toBe('loading')

    // Cleanup — resolve the pending fetch so the hook settles.
    resolveSecond(snapshot(5))
    await waitFor(() => expect(result.current.status).toBe('ready'))
  })
})
