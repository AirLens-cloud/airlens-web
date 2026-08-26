// fetchWindField level→path mapping (AAA). Ported verbatim from
// AirLens-platform apps/web `src/api/weather.test.ts`.
//
// These tests pin two properties: each level reads its own file (no
// cross-level fallback), and a level with no data returns null rather than
// substituting surface.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchWindField } from './weather'

const HEADER = {
  nx: 4, ny: 2, lo1: -180, la1: 90, dx: 90, dy: 90,
  refTime: '2026-07-13T06:00:00Z',
  generatedAt: '2026-07-13T09:00:00Z',
  level: '850hPa',
  resolution: 1,
}

function gfsBody(level: string) {
  const header = { ...HEADER, level }
  const data = [1, 2, 3, 4, 5, 6, 7, 8]
  return [{ header, data }, { header, data }]
}

/** Serve only the URLs listed; everything else 404s. */
function mockFetch(available: Record<string, unknown>) {
  const spy = vi.fn(async (url: string) => {
    const hit = Object.entries(available).find(([path]) => url.includes(path))
    if (!hit) return { ok: false, status: 404 } as Response
    return { ok: true, status: 200, json: async () => hit[1] } as unknown as Response
  })
  vi.stubGlobal('fetch', spy)
  return spy
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('fetchWindField', () => {
  it('reads the 850hPa file when 850hPa is requested', async () => {
    const spy = mockFetch({ 'wind-850hpa.json': gfsBody('850hPa') })

    const field = await fetchWindField('850hPa')

    expect(field).not.toBeNull()
    expect(field!.meta?.level).toBe('850hPa')
    expect(spy.mock.calls.every(([url]) => !String(url).includes('wind-surface'))).toBe(true)
  })

  it('returns null for 850hPa rather than falling back to surface', async () => {
    // Surface data exists; 850hPa does not. Substituting it would be a lie.
    const spy = mockFetch({ 'wind-surface.json': gfsBody('surface') })

    const field = await fetchWindField('850hPa')

    expect(field).toBeNull()
    expect(spy.mock.calls.every(([url]) => !String(url).includes('wind-surface'))).toBe(true)
  })

  it('returns null without any request for levels we never collect', async () => {
    const spy = mockFetch({})

    const field = await fetchWindField('500hPa')

    expect(field).toBeNull()
    expect(spy).not.toHaveBeenCalled()
  })

  it('resolves from the HF live-data repo (1순위) before the static fallback', async () => {
    const spy = mockFetch({
      'huggingface.co/datasets/Robeedau/airlens-live/resolve/main/wind-data/wind-surface.json': gfsBody('surface'),
    })

    const field = await fetchWindField('surface')

    expect(field).not.toBeNull()
    expect(field!.meta?.level).toBe('surface')
    expect(spy.mock.calls.some(([url]) => String(url).includes('huggingface.co'))).toBe(true)
  })

  it('falls back to the committed static file when the HF live-data repo is unavailable', async () => {
    mockFetch({ '/data/weather/current/wind-surface.json': gfsBody('surface') })

    const field = await fetchWindField('surface')

    expect(field).not.toBeNull()
    expect(field!.meta?.level).toBe('surface')
  })

  it('returns null instead of an empty field when nothing resolves', async () => {
    mockFetch({})

    const field = await fetchWindField('surface')

    // A silent zero wind field renders as "calm everywhere" — indistinguishable
    // from real calm.
    expect(field).toBeNull()
  })
})
