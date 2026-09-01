/**
 * useGlobeGridSnapshot() must request the exact same sample size
 * `fetchGlobalMarkers()` does (`api/globeMarkers.ts` — pinned from that
 * file's own side in `api/globeMarkers.test.ts`). Both rank the shared grid
 * artifact with no origin, so a cell's array index is the identity the 3D
 * scene, Table, and Map all key selection off of (`grid-${i+1}`). Two
 * independently hardcoded limits is exactly the silent-regression shape code
 * review flagged: only one drifting desyncs that identity with no type error
 * and no visible symptom until a click selects the wrong row (code review
 * Major-1, 2026-09-01).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, cleanup, waitFor } from '@testing-library/react'
import { clearResourceCache } from '../lib/resourceCache'

const fetchGlobalGridSnapshotMock = vi.fn()
vi.mock('../api/gridSnapshot', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/gridSnapshot')>()
  return { ...actual, fetchGlobalGridSnapshot: (...args: unknown[]) => fetchGlobalGridSnapshotMock(...args) }
})

beforeEach(() => {
  clearResourceCache()
  fetchGlobalGridSnapshotMock.mockReset()
  fetchGlobalGridSnapshotMock.mockResolvedValue({
    pm25: 0,
    aqi: 0,
    grade: null,
    lat: 0,
    lon: 0,
    source: 'global_grid',
    updatedAt: '2026-08-25T11:00:00Z',
    nearbyCells: [],
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('useGlobeGridSnapshot', () => {
  it('requests the shared GLOBAL_GRID_SAMPLE_LIMIT — the same cap fetchGlobalMarkers() uses', async () => {
    // Arrange
    const { GLOBAL_GRID_SAMPLE_LIMIT } = await import('../api/gridSnapshot')
    const { useGlobeGridSnapshot } = await import('./useGlobeData')

    // Act
    renderHook(() => useGlobeGridSnapshot())
    await waitFor(() => expect(fetchGlobalGridSnapshotMock).toHaveBeenCalled())

    // Assert
    expect(fetchGlobalGridSnapshotMock).toHaveBeenCalledWith({ limit: GLOBAL_GRID_SAMPLE_LIMIT })
  })
})
