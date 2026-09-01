/**
 * globeMarkers — the 3D scene's grid markers share `gridSnapshot.ts`'s
 * `fetchGlobalGridSnapshot()` no-origin ranking with Table/Map. The evenSample
 * fix for the Map-view "green band near the south pole" bug therefore also
 * changed this file's own marker distribution — before, `fetchGlobalMarkers()`
 * silently clustered near the south pole too; nobody noticed because no view
 * rendered the whole globe at once to reveal it (code review Major-3,
 * 2026-09-01). This pins the corrected behavior AND — by asserting the exact
 * returned count — that `fetchGlobalMarkers()` requests `GLOBAL_GRID_SAMPLE_LIMIT`,
 * not an independent hardcoded number (code review Major-1).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const fetchMock = vi.fn()

beforeEach(() => {
  vi.resetModules()
  fetchMock.mockReset()
  globalThis.fetch = fetchMock as unknown as typeof fetch
})

afterEach(() => {
  vi.restoreAllMocks()
})

function okResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response
}

describe('fetchGlobalMarkers — no-origin sampling', () => {
  it('samples exactly GLOBAL_GRID_SAMPLE_LIMIT markers spanning both poles, not a south-pole-clustered prefix', async () => {
    // Arrange — an artifact well past the limit, spanning -90..90 evenly, the
    // same row-major shape the live HF artifact has (verified against the real
    // artifact while diagnosing the Map-view bug: point 0 is lat -90). A plain
    // `.slice(0, limit)` here would have clipped to roughly the first quarter
    // of this range — latitudes -90 to about -45 — and nothing past it.
    const { GLOBAL_GRID_SAMPLE_LIMIT } = await import('./gridSnapshot')
    const n = GLOBAL_GRID_SAMPLE_LIMIT + 15000
    const points = Array.from({ length: n }, (_, i) => ({
      lat: -90 + (i * 180) / (n - 1),
      lon: 0,
      pm25: 10,
      aqi: 42,
    }))
    fetchMock.mockResolvedValueOnce(okResponse({ updated_at: '2026-08-25T11:00:00.000Z', points }))
    const { fetchGlobalMarkers } = await import('./globeMarkers')

    // Act
    const markers = await fetchGlobalMarkers()

    // Assert — exact count pins the shared-constant contract (Major-1): a
    // stray independent hardcoded limit here would make this length assertion
    // fail even though coverage might still look "spread out."
    expect(markers).toHaveLength(GLOBAL_GRID_SAMPLE_LIMIT)
    const lats = markers.map((m) => m.location.lat)
    expect(Math.min(...lats)).toBeLessThanOrEqual(-80)
    expect(Math.max(...lats)).toBeGreaterThanOrEqual(80)
  })

  it('keeps the `grid-${i+1}` identity contiguous from index 1, matching Table/Map row ids', async () => {
    // Arrange
    fetchMock.mockResolvedValueOnce(okResponse({
      updated_at: '2026-08-25T11:00:00.000Z',
      points: [
        { lat: 0, lon: 0, pm25: 10, aqi: 42 },
        { lat: 10, lon: 10, pm25: 20, aqi: 68 },
      ],
    }))
    const { fetchGlobalMarkers } = await import('./globeMarkers')

    // Act
    const markers = await fetchGlobalMarkers()

    // Assert
    expect(markers.map((m) => m.station_id)).toEqual(['grid-1', 'grid-2'])
  })

  it('degrades to an empty array (not a thrown error) when the grid feed is unavailable', async () => {
    // Arrange
    fetchMock.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) } as unknown as Response)
    const { fetchGlobalMarkers } = await import('./globeMarkers')

    // Act
    const markers = await fetchGlobalMarkers()

    // Assert
    expect(markers).toEqual([])
  })
})
