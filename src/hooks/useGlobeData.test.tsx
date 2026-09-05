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

describe('useDQSSData — HF-live-primary, bundled-fallback cascade', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('reads data_quality.json from the HF live dataset first and carries its declared provenance', async () => {
    // Arrange
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        meta: { source: 'measured' },
        stations: [{ station_id: 's1', lat: 37.5, lon: 127, final_score: 91 }],
      }),
    })
    global.fetch = fetchMock as unknown as typeof fetch
    const { useDQSSData } = await import('./useGlobeData')

    // Act
    const { result } = renderHook(() => useDQSSData())
    await waitFor(() => expect(result.current?.stations.length).toBe(1))

    // Assert
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toContain('aq-data/data_quality.json')
    expect(result.current?.provenance).toBe('measured')
  })

  it('falls back to the bundled static copy when the HF live fetch fails', async () => {
    // Arrange
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          meta: { source: 'seed' },
          stations: [{ station_id: 's2', lat: 10, lon: 10, final_score: 50 }],
        }),
      })
    global.fetch = fetchMock as unknown as typeof fetch
    const { useDQSSData } = await import('./useGlobeData')

    // Act
    const { result } = renderHook(() => useDQSSData())
    await waitFor(() => expect(result.current?.stations.length).toBe(1))

    // Assert
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1][0]).toBe('/data/data_quality.json')
    expect(result.current?.provenance).toBe('seed')
  })

  it('resolves to an empty, honest-degraded cache when both the HF and bundled fetches fail', async () => {
    // Arrange
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'))
    global.fetch = fetchMock as unknown as typeof fetch
    const { useDQSSData } = await import('./useGlobeData')

    // Act
    const { result } = renderHook(() => useDQSSData())
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

    // Assert
    expect(result.current?.stations).toEqual([])
    expect(result.current?.provenance).toBeNull()
  })

  it('carries "partial" as its own honest provenance — not conflated with "measured" or dropped to null', async () => {
    // Arrange — the live pipeline publishes meta.source:"partial" when some
    // DQSS components (freshness/completeness/stability/residual) are
    // measured but others (e.g. consistency, no cross-source pair) are not.
    // 2026-09-05 policy: this reads as its own provenance, distinct from a
    // full 'measured' score and from the honest-empty null case — the badge
    // still shows a grade, tagged PARTIAL, rather than hiding it entirely.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        meta: {
          source: 'partial',
          inputs: {
            freshness: 'measured',
            completeness: 'measured',
            consistency: 'unavailable-no-cross-source-pair',
            stability: 'measured',
            residual: 'measured',
          },
          measured_weight_range: [80.0, 80.0],
        },
        stations: [{ station_id: 's3', lat: 1, lon: 1, final_score: 66.7 }],
      }),
    })
    global.fetch = fetchMock as unknown as typeof fetch
    const { useDQSSData } = await import('./useGlobeData')

    // Act
    const { result } = renderHook(() => useDQSSData())
    await waitFor(() => expect(result.current?.stations.length).toBe(1))

    // Assert
    expect(result.current?.provenance).toBe('partial')
    expect(result.current?.partialDetail).toEqual({ measured: 4, total: 5, measuredWeightMax: 80 })
  })

  it('still degrades to null provenance for an unrecognized meta.source (e.g. "withheld")', async () => {
    // Arrange — only 'seed' | 'measured' | 'partial' are known provenance
    // values; anything else must not be promoted to a trusted or partial score.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        meta: { source: 'withheld' },
        stations: [{ station_id: 's4', lat: 2, lon: 2, final_score: 40 }],
      }),
    })
    global.fetch = fetchMock as unknown as typeof fetch
    const { useDQSSData } = await import('./useGlobeData')

    // Act
    const { result } = renderHook(() => useDQSSData())
    await waitFor(() => expect(result.current?.stations.length).toBe(1))

    // Assert
    expect(result.current?.provenance).toBeNull()
    expect(result.current?.partialDetail).toBeNull()
  })

  it('omits partialDetail when "partial" is declared but meta.inputs/measured_weight_range are missing — no fabricated numbers', async () => {
    // Arrange — a producer could declare source:"partial" without yet
    // publishing the component breakdown. The tag alone must still be safe
    // to render (card falls back to PARTIAL-tag-only, no detail line).
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        meta: { source: 'partial' },
        stations: [{ station_id: 's5', lat: 3, lon: 3, final_score: 55 }],
      }),
    })
    global.fetch = fetchMock as unknown as typeof fetch
    const { useDQSSData } = await import('./useGlobeData')

    // Act
    const { result } = renderHook(() => useDQSSData())
    await waitFor(() => expect(result.current?.stations.length).toBe(1))

    // Assert
    expect(result.current?.provenance).toBe('partial')
    expect(result.current?.partialDetail).toBeNull()
  })
})
