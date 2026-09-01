/**
 * api/gridSnapshot.ts — HF/static grid adapter (AAA). Ported verbatim from
 * AirLens-platform apps/web `src/api/gridSnapshot.test.ts`.
 *
 * Verifies the 1:1 port of the retired Edge Fn's pure computation —
 * haversine ranking, finite-value filtering, 48h staleness — plus the
 * HF → static fallback cascade and the empty-artifact reject path.
 * Glass-box: no synthetic p10/p90 asserted anywhere here.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const fetchMock = vi.fn()

beforeEach(() => {
  vi.resetModules()
  fetchMock.mockReset()
  globalThis.fetch = fetchMock as unknown as typeof fetch
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-25T12:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function okResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response
}

function failResponse(status = 503): Response {
  return { ok: false, status, json: async () => ({ error: 'unavailable' }) } as unknown as Response
}

describe('fetchGlobalGridSnapshot — HF → static adapter', () => {
  it('ranks points by haversine distance from the given origin (closest first)', async () => {
    // Arrange — Seoul origin, a near point (itself), a mid-distance point, a far one.
    fetchMock.mockResolvedValueOnce(okResponse({
      updated_at: '2026-08-25T11:00:00.000Z', // 1h ago — fresh
      points: [
        { lat: 37.5, lon: 127.0, pm25: 12 },
        { lat: 35.1, lon: 129.0, pm25: 40 },
        { lat: 40.7, lon: -74.0, pm25: 90 },
      ],
    }))
    const { fetchGlobalGridSnapshot } = await import('./gridSnapshot')

    // Act
    // radiusKm raised past the default 600km — otherwise the NYC point
    // (~11,000km away) is correctly excluded by the same cutoff the Edge Fn
    // used, and this test wants to assert full 3-point ranking order.
    const result = await fetchGlobalGridSnapshot({ lat: 37.5, lon: 127.0, limit: 3, radiusKm: 20000 })

    // Assert
    expect(result.nearbyCells.map((c) => c.lat)).toEqual([37.5, 35.1, 40.7])
    expect(result.pm25).toBe(12)
    // pm25ToAqi: EPA pre-2024 band [0,50,0,12] → pm 12 sits exactly at AQI 50.
    // (Was 15 under the retired non-standard round(pm25 * 1.25) — B0 Truth Kernel.)
    expect(result.aqi).toBe(50)
    expect(result.grade).toBe('Good') // 12 <= 15
    expect(result.stale).toBe(false)
    expect(result.dqss).toBeUndefined() // no synthetic quality score
  })

  it('filters out points missing finite lat/lon/pm25 before ranking', async () => {
    // Arrange — 2 valid points (one via `pm25`, one via `value` fallback), 2 invalid.
    fetchMock.mockResolvedValueOnce(okResponse({
      updated_at: '2026-08-25T11:00:00.000Z',
      points: [
        { lat: 10, lon: 20, pm25: 5 },
        { lat: 'oops', lon: 20, pm25: 5 },
        { lat: 10, lon: 20 },
        { lat: 10, lon: 20, value: 8 },
      ],
    }))
    const { fetchGlobalGridSnapshot } = await import('./gridSnapshot')

    // Act
    const result = await fetchGlobalGridSnapshot({ limit: 10 })

    // Assert
    expect(result.nearbyCells).toHaveLength(2)
    expect(result.nearbyCells.map((c) => c.pm25).sort((a, b) => a - b)).toEqual([5, 8])
  })

  it('excludes points beyond the default 600km radius when an origin is given', async () => {
    // Arrange — one point at the origin, one ~11,000km away (NYC from Seoul).
    fetchMock.mockResolvedValueOnce(okResponse({
      updated_at: '2026-08-25T11:00:00.000Z',
      points: [
        { lat: 37.5, lon: 127.0, pm25: 12 },
        { lat: 40.7, lon: -74.0, pm25: 90 },
      ],
    }))
    const { fetchGlobalGridSnapshot } = await import('./gridSnapshot')

    // Act
    const result = await fetchGlobalGridSnapshot({ lat: 37.5, lon: 127.0, limit: 10 })

    // Assert — matches the retired Edge Fn's default radiusKm=600 cutoff.
    expect(result.nearbyCells).toHaveLength(1)
    expect(result.nearbyCells[0].pm25).toBe(12)
  })

  it('flags stale when the source updatedAt is older than 48h', async () => {
    // Arrange — 50h old artifact.
    fetchMock.mockResolvedValueOnce(okResponse({
      updated_at: '2026-08-23T10:00:00.000Z',
      points: [{ lat: 0, lon: 0, pm25: 20 }],
    }))
    const { fetchGlobalGridSnapshot } = await import('./gridSnapshot')

    // Act
    const result = await fetchGlobalGridSnapshot({})

    // Assert
    expect(result.stale).toBe(true)
  })

  it('falls back to the bundled static path when the HF fetch fails', async () => {
    // Arrange — HF miss, static hit.
    fetchMock
      .mockResolvedValueOnce(failResponse(404))
      .mockResolvedValueOnce(okResponse({
        updated_at: '2026-08-25T11:30:00.000Z',
        points: [{ lat: 1, lon: 1, pm25: 30 }],
      }))
    const { fetchGlobalGridSnapshot } = await import('./gridSnapshot')

    // Act
    const result = await fetchGlobalGridSnapshot({})

    // Assert
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[0][0])).toContain('huggingface.co')
    expect(String(fetchMock.mock.calls[1][0])).toBe('/data/current-pm25-grid.json')
    expect(result.pm25).toBe(30)
  })

  it('rejects when both sources are unreachable', async () => {
    // Arrange
    fetchMock.mockResolvedValue(failResponse(503))
    const { fetchGlobalGridSnapshot } = await import('./gridSnapshot')

    // Act + Assert
    await expect(fetchGlobalGridSnapshot({})).rejects.toThrow()
    expect(fetchMock).toHaveBeenCalledTimes(2) // HF then static, both exhausted
  })

  it('rejects when the source artifact has no usable points (empty points case)', async () => {
    // Arrange — well-formed artifact, zero points.
    fetchMock.mockResolvedValueOnce(okResponse({
      updated_at: '2026-08-25T11:00:00.000Z',
      points: [],
    }))
    const { fetchGlobalGridSnapshot } = await import('./gridSnapshot')

    // Act + Assert
    await expect(fetchGlobalGridSnapshot({})).rejects.toThrow()
  })

  it('spreads a no-origin sample across the full artifact instead of just its first rows', async () => {
    // Arrange — 181 points sweeping every latitude row (-90..90, matching the
    // live artifact's own row-major enumeration: this repro is what a plain
    // `.slice(0, limit)` on `points` would clip to "the first ~14 rows near
    // the south pole" (globe-views Map-view bug report, verified against the
    // real HF artifact: point 0 is lat -90, 360 points per row).
    const points = Array.from({ length: 181 }, (_, i) => ({ lat: -90 + i, lon: 0, pm25: 10 }))
    fetchMock.mockResolvedValueOnce(okResponse({ updated_at: '2026-08-25T11:00:00.000Z', points }))
    const { fetchGlobalGridSnapshot } = await import('./gridSnapshot')

    // Act — no lat/lon origin, same shape Table/Map/the 3D grid markers request.
    const result = await fetchGlobalGridSnapshot({ limit: 10 })

    // Assert — both poles are represented, not just the low end of the array.
    const lats = result.nearbyCells.map((c) => c.lat)
    expect(result.nearbyCells).toHaveLength(10)
    expect(Math.min(...lats)).toBeLessThanOrEqual(-80)
    expect(Math.max(...lats)).toBeGreaterThanOrEqual(80)
  })

  it('still ranks origin-based lookups closest-first, unaffected by the no-origin sampling change', async () => {
    // Arrange — same latitude sweep, but with a real origin this time.
    const points = Array.from({ length: 181 }, (_, i) => ({ lat: -90 + i, lon: 0, pm25: 10 }))
    fetchMock.mockResolvedValueOnce(okResponse({ updated_at: '2026-08-25T11:00:00.000Z', points }))
    const { fetchGlobalGridSnapshot } = await import('./gridSnapshot')

    // Act
    const result = await fetchGlobalGridSnapshot({ lat: 0, lon: 0, limit: 3, radiusKm: 20000 })

    // Assert — the equator-ish rows come first, exactly as haversine ranking demands.
    expect(result.nearbyCells.map((c) => c.lat)).toEqual([0, -1, 1])
  })

  it('accepts the legacy `cells` key when `points` is absent', async () => {
    // Arrange — older harvester export shape.
    fetchMock.mockResolvedValueOnce(okResponse({
      generated_at: '2026-08-25T11:00:00.000Z',
      cells: [{ lat: 2, lon: 2, pm25: 50 }],
    }))
    const { fetchGlobalGridSnapshot } = await import('./gridSnapshot')

    // Act
    const result = await fetchGlobalGridSnapshot({})

    // Assert
    expect(result.pm25).toBe(50)
    expect(result.grade).toBe('Unhealthy') // 35 < 50 <= 75
  })
})
