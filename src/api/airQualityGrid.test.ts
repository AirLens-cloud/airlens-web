/**
 * api/airQualityGrid.ts — fetchAQGrid fallback chain (AAA).
 *
 * Adapted from AirLens-platform apps/web `src/api/airQualityGrid.test.ts` —
 * the Supabase Edge Function on-demand step has no backend in this repo, so
 * the chain under test is HF (storage) → CDN (pm25/pm10 only) → static.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const fetchMock = vi.fn()

beforeEach(() => {
  vi.resetModules()
  fetchMock.mockReset()
  globalThis.fetch = fetchMock as unknown as typeof fetch
  vi.unstubAllEnvs()
})

function okResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response
}
function notFoundResponse(): Response {
  return { ok: false, status: 404, json: async () => ({}) } as unknown as Response
}

const CDN_GRID = {
  variable: 'pm2_5',
  resolution: 5,
  timestamp: 1755500400000, // fixed source generatedAt — must survive parsing untouched
  nLat: 2,
  nLon: 2,
  latMin: -90,
  lonMin: -180,
  dLat: 90,
  dLon: 180,
  points: [
    { lat: -90, lon: -180, value: 5 },
    { lat: -90, lon: 0, value: 6 },
    { lat: 0, lon: -180, value: 7 },
    { lat: 0, lon: 0, value: 8 },
  ],
  source: 'NOAA GEFS-Aerosols',
};

describe('fetchAQGrid — chain order (HF storage → CDN → static)', () => {
  it('tries the CDN when the HF storage fetch misses', async () => {
    // Arrange
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('mac-data/data/web/v1')) return okResponse(CDN_GRID)
      if (String(url).includes('huggingface.co/datasets/Robeedau/airlens-live')) return notFoundResponse()
      return notFoundResponse()
    })
    const { fetchAQGrid } = await import('./airQualityGrid')

    // Act
    const result = await fetchAQGrid('pm25')

    // Assert
    expect(result).not.toBeNull()
    expect(result!.nLat).toBe(2)
    const calledUrls = fetchMock.mock.calls.map((c: unknown[]) => String(c[0]))
    expect(calledUrls.some((u) => u.includes('aq-data/current-pm25-grid.json'))).toBe(true)
    expect(calledUrls.some((u) => u.includes('mac-data/data/web/v1/current-pm25-grid.json'))).toBe(true)
  });

  it('falls through to static when HF storage and CDN both fail', async () => {
    // Arrange
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('mac-data/data/web/v1')) return notFoundResponse()
      if (String(url).includes('huggingface.co/datasets/Robeedau/airlens-live')) return notFoundResponse()
      if (String(url).includes('/data/current-pm25-grid.json')) return okResponse(CDN_GRID)
      return notFoundResponse()
    })
    const { fetchAQGrid } = await import('./airQualityGrid')

    // Act
    const result = await fetchAQGrid('pm25')

    // Assert
    expect(result).not.toBeNull()
    const calledUrls = fetchMock.mock.calls.map((c: unknown[]) => String(c[0]))
    expect(calledUrls.some((u) => u.includes('mac-data/data/web/v1'))).toBe(true)
    expect(calledUrls.some((u) => u.includes('/data/current-pm25-grid.json'))).toBe(true)
  });

  it('preserves the CDN payload timestamp exactly — never substitutes "now"', async () => {
    // Arrange
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('mac-data/data/web/v1')) return okResponse(CDN_GRID)
      if (String(url).includes('huggingface.co/datasets/Robeedau/airlens-live')) return notFoundResponse()
      return notFoundResponse()
    })
    const { fetchAQGrid } = await import('./airQualityGrid')

    // Act
    const result = await fetchAQGrid('pm25')

    // Assert
    expect(result!.timestamp).toBe(1755500400000)
  });

  it('never attempts a CDN request for an overlay with no cdnPath (o3)', async () => {
    // Arrange — o3 has no cdnPath (GEFS-Aerosols doesn't produce gases, only pm25/pm10)
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('huggingface.co/datasets/Robeedau/airlens-live')) return notFoundResponse()
      if (String(url).includes('/data/current-o3-grid.json')) {
        return okResponse({ ...CDN_GRID, variable: 'ozone' })
      }
      return notFoundResponse()
    })
    const { fetchAQGrid } = await import('./airQualityGrid')

    // Act
    const result = await fetchAQGrid('o3')

    // Assert
    expect(result).not.toBeNull()
    const calledUrls = fetchMock.mock.calls.map((c: unknown[]) => String(c[0]))
    expect(calledUrls.some((u) => u.includes('mac-data/data/web/v1'))).toBe(false)
  });

  it('returns null when every source in the chain fails', async () => {
    // Arrange
    fetchMock.mockResolvedValue(notFoundResponse())
    const { fetchAQGrid } = await import('./airQualityGrid')

    // Act
    const result = await fetchAQGrid('pm25')

    // Assert
    expect(result).toBeNull()
  });
});

/**
 * fetchAQGrid — weather/marine/pollen fallback timestamp.
 *
 * The live ETL for these feeds stamps `refTime`/`collected_at` as ISO
 * strings; a stale 3h-old grid must not read as "just now".
 */
describe('fetchAQGrid — weather/marine/pollen fallback timestamp', () => {
  it('extracts refTime from the weather-grid payload (temp overlay)', async () => {
    // Arrange
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('huggingface.co/datasets/Robeedau/airlens-live')) {
        return okResponse({
          step: 10,
          refTime: '2026-08-18T21:00:00Z',
          points: [
            { lat: 0, lon: 0, temp: 20 },
            { lat: 0, lon: 10, temp: 21 },
            { lat: 10, lon: 0, temp: 19 },
            { lat: 10, lon: 10, temp: 22 },
          ],
        })
      }
      return notFoundResponse()
    })
    const { fetchAQGrid } = await import('./airQualityGrid')

    // Act
    const result = await fetchAQGrid('temp')

    // Assert
    expect(result).not.toBeNull()
    expect(result!.timestamp).toBe(Date.parse('2026-08-18T21:00:00Z'))
  });

  it('returns null (never Date.now()) when the weather-grid payload has no timestamp field', async () => {
    // Arrange
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('huggingface.co/datasets/Robeedau/airlens-live')) {
        return okResponse({
          step: 10,
          points: [
            { lat: 0, lon: 0, temp: 20 },
            { lat: 0, lon: 10, temp: 21 },
            { lat: 10, lon: 0, temp: 19 },
            { lat: 10, lon: 10, temp: 22 },
          ],
        })
      }
      return notFoundResponse()
    })
    const { fetchAQGrid } = await import('./airQualityGrid')

    // Act
    const result = await fetchAQGrid('temp')

    // Assert — honest "unknown", not a fabricated "now"
    expect(result).not.toBeNull()
    expect(result!.timestamp).toBeNull()
  });

  it('extracts collected_at from the marine-data payload (sst overlay)', async () => {
    // Arrange
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('huggingface.co/datasets/Robeedau/airlens-live')) {
        return okResponse({
          step: 5,
          collected_at: '2026-08-18T22:30:00Z',
          points: [
            { lat: 0, lon: 0, sst: 25 },
            { lat: 0, lon: 5, sst: 26 },
            { lat: 5, lon: 0, sst: 24 },
            { lat: 5, lon: 5, sst: 27 },
          ],
        })
      }
      return notFoundResponse()
    })
    const { fetchAQGrid } = await import('./airQualityGrid')

    // Act
    const result = await fetchAQGrid('sst')

    // Assert
    expect(result).not.toBeNull()
    expect(result!.timestamp).toBe(Date.parse('2026-08-18T22:30:00Z'))
  });

  it('extracts refTime from the pollen-grid payload (pollen_grass overlay)', async () => {
    // Arrange
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('huggingface.co/datasets/Robeedau/airlens-live')) {
        return okResponse({
          step: 2,
          refTime: '2026-08-18T23:00:00Z',
          collected_at: '2026-08-18T23:00:00Z',
          points: [
            { lat: 40, lon: 0, grass: 10 },
            { lat: 40, lon: 2, grass: 12 },
            { lat: 42, lon: 0, grass: 8 },
            { lat: 42, lon: 2, grass: 9 },
          ],
        })
      }
      return notFoundResponse()
    })
    const { fetchAQGrid } = await import('./airQualityGrid')

    // Act
    const result = await fetchAQGrid('pollen_grass')

    // Assert
    expect(result).not.toBeNull()
    expect(result!.timestamp).toBe(Date.parse('2026-08-18T23:00:00Z'))
  });
});
