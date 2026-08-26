// AAA (Arrange-Act-Assert) coverage for the Weather page's proxy client:
// - not-configured (no COMMUNITY_API_BASE) skips the request entirely
// - a non-ok/failed response degrades to null (fail-soft), never a fabricated payload
// - a successful response is passed through verbatim
// - the weather-grid MSLP lookup finds the nearest cell and falls back across candidates
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const dataSources = vi.hoisted(() => ({ COMMUNITY_API_BASE: '', HF_LIVE_BASE: 'https://hf.example/live' }))
vi.mock('../lib/config/dataSources', () => dataSources)

import { fetchAqHourly, fetchWeatherGridMslp, fetchWeatherHourly } from './weatherProxy'

function mockFetch(responder: (url: string) => Response | Promise<Response>) {
  const spy = vi.fn(async (url: string) => responder(url))
  vi.stubGlobal('fetch', spy)
  return spy
}

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response
}

beforeEach(() => {
  vi.unstubAllGlobals()
  dataSources.COMMUNITY_API_BASE = ''
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('fetchWeatherHourly', () => {
  it('skips the request entirely when the proxy base is not configured', async () => {
    const spy = mockFetch(() => jsonResponse({ hourly: { time: ['2026-08-26T00:00'] } }))

    const hourly = await fetchWeatherHourly(37.5665, 126.978)

    expect(hourly).toBeNull()
    expect(spy).not.toHaveBeenCalled()
  })

  it('returns the hourly payload verbatim on a successful response', async () => {
    dataSources.COMMUNITY_API_BASE = 'https://api.example'
    const payload = { hourly: { time: ['2026-08-26T00:00'], temperature_2m: [21.4] } }
    mockFetch(() => jsonResponse(payload))

    const hourly = await fetchWeatherHourly(37.5665, 126.978)

    expect(hourly).toEqual(payload.hourly)
  })

  it('degrades to null on a non-ok response — never a fabricated payload', async () => {
    dataSources.COMMUNITY_API_BASE = 'https://api.example'
    mockFetch(() => jsonResponse(null, false, 503))

    const hourly = await fetchWeatherHourly(37.5665, 126.978)

    expect(hourly).toBeNull()
  })

  it('degrades to null when the request throws (network error)', async () => {
    dataSources.COMMUNITY_API_BASE = 'https://api.example'
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down') }))

    const hourly = await fetchWeatherHourly(37.5665, 126.978)

    expect(hourly).toBeNull()
  })
})

describe('fetchAqHourly', () => {
  it('skips the request entirely when the proxy base is not configured', async () => {
    const spy = mockFetch(() => jsonResponse({ hourly: { time: [], pm2_5: [] } }))

    const hourly = await fetchAqHourly(37.5665, 126.978)

    expect(hourly).toBeNull()
    expect(spy).not.toHaveBeenCalled()
  })

  it('returns the pm2_5 series verbatim on a successful response', async () => {
    dataSources.COMMUNITY_API_BASE = 'https://api.example'
    const payload = { hourly: { time: ['2026-08-26T00:00'], pm2_5: [12.3] } }
    mockFetch(() => jsonResponse(payload))

    const hourly = await fetchAqHourly(37.5665, 126.978)

    expect(hourly).toEqual(payload.hourly)
  })
})

describe('fetchWeatherGridMslp', () => {
  it('returns the nearest cell by lat/lon among several candidates', async () => {
    const artifact = {
      refTime: '2026-08-26T09:00:00Z',
      points: [
        { lat: 30, lon: 120, mslp: 1005 },
        { lat: 40, lon: 130, mslp: 1012 },
        { lat: 37.5, lon: 126.978, mslp: 1013.2 },
      ],
    }
    mockFetch((url) => (url.includes('hf.example') ? jsonResponse(artifact) : jsonResponse(null, false, 404)))

    const result = await fetchWeatherGridMslp(37.5665, 126.978)

    expect(result).toEqual({ mslp: 1013.2, refTime: '2026-08-26T09:00:00Z' })
  })

  it('falls back to the static path when the HF live-data repo is unavailable', async () => {
    const artifact = { refTime: '2026-08-26T09:00:00Z', points: [{ lat: 37.5, lon: 127, mslp: 1010 }] }
    mockFetch((url) =>
      url.includes('hf.example') ? jsonResponse(null, false, 404) : jsonResponse(artifact),
    )

    const result = await fetchWeatherGridMslp(37.5665, 126.978)

    expect(result).toEqual({ mslp: 1010, refTime: '2026-08-26T09:00:00Z' })
  })

  it('returns null rather than a fabricated pressure when nothing resolves', async () => {
    mockFetch(() => jsonResponse(null, false, 404))

    const result = await fetchWeatherGridMslp(37.5665, 126.978)

    expect(result).toBeNull()
  })

  it('ignores points with non-finite coordinates or pressure', async () => {
    const artifact = {
      refTime: null,
      points: [
        { lat: Number.NaN, lon: 127, mslp: 1010 },
        { lat: 37.5, lon: 127, mslp: null },
      ],
    }
    mockFetch(() => jsonResponse(artifact))

    const result = await fetchWeatherGridMslp(37.5665, 126.978)

    expect(result).toBeNull()
  })
})
