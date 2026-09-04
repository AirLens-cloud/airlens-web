/**
 * approxLocation.ts — client fetch for the edge's IP-approximate location
 * (AAA). Mirrors `src/api/gridSnapshot.test.ts`'s mock style: plain objects
 * cast as `Response`, `okResponse` carrying no `.headers` at all (the
 * approx source's own `res.headers?.get(...)` optional chaining exists for
 * exactly this shape) and a dedicated `htmlResponse()` for the `vite dev`
 * SPA-catch-all trap `functions/data/[[path]].ts`'s header guard exists for
 * on the data side.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const SESSION_KEY = 'airlens-approx-location'
const fetchMock = vi.fn()

function okResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response
}

function htmlResponse(): Response {
  return {
    ok: true,
    status: 200,
    headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? 'text/html; charset=utf-8' : null) },
    json: async () => {
      throw new SyntaxError('Unexpected token < in JSON at position 0')
    },
  } as unknown as Response
}

function failResponse(status = 503): Response {
  return { ok: false, status, json: async () => ({ error: 'unavailable' }) } as unknown as Response
}

beforeEach(() => {
  vi.resetModules()
  fetchMock.mockReset()
  globalThis.fetch = fetchMock as unknown as typeof fetch
  window.sessionStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  window.sessionStorage.clear()
})

describe('getApproxLocation', () => {
  it('resolves the coordinates from a real available:true response', async () => {
    // Arrange
    fetchMock.mockResolvedValueOnce(okResponse({ available: true, lat: 37.5665, lon: 126.978, city: 'Seoul' }))
    const { getApproxLocation } = await import('./approxLocation')
    // Act
    const result = await getApproxLocation()
    // Assert
    expect(result).toEqual({ lat: 37.5665, lon: 126.978, city: 'Seoul' })
  })

  it('resolves null (never throws) when the edge reports available:false', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ available: false }))
    const { getApproxLocation } = await import('./approxLocation')
    const result = await getApproxLocation()
    expect(result).toBeNull()
  })

  it('resolves null when the response is text/html — the vite dev SPA-catch-all trap', async () => {
    fetchMock.mockResolvedValueOnce(htmlResponse())
    const { getApproxLocation } = await import('./approxLocation')
    const result = await getApproxLocation()
    expect(result).toBeNull()
  })

  it('resolves null on a non-2xx response', async () => {
    fetchMock.mockResolvedValueOnce(failResponse(500))
    const { getApproxLocation } = await import('./approxLocation')
    const result = await getApproxLocation()
    expect(result).toBeNull()
  })

  it('resolves null (never throws) when fetch itself rejects', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'))
    const { getApproxLocation } = await import('./approxLocation')
    const result = await getApproxLocation()
    expect(result).toBeNull()
  })

  it('resolves city:null when the edge omits it (never fabricated)', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ available: true, lat: 1, lon: 2 }))
    const { getApproxLocation } = await import('./approxLocation')
    const result = await getApproxLocation()
    expect(result).toEqual({ lat: 1, lon: 2, city: null })
  })

  it('fetches at most once per tab session — a second call reuses the cached result, no second fetch', async () => {
    // Arrange
    fetchMock.mockResolvedValueOnce(okResponse({ available: true, lat: 1, lon: 2, city: 'X' }))
    const { getApproxLocation } = await import('./approxLocation')
    // Act
    const first = await getApproxLocation()
    const second = await getApproxLocation()
    // Assert
    expect(first).toEqual({ lat: 1, lon: 2, city: 'X' })
    expect(second).toEqual({ lat: 1, lon: 2, city: 'X' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('dedupes concurrent callers into a single in-flight fetch', async () => {
    // Arrange
    fetchMock.mockResolvedValueOnce(okResponse({ available: true, lat: 3, lon: 4, city: 'Y' }))
    const { getApproxLocation } = await import('./approxLocation')
    // Act — two callers before either resolves.
    const [a, b] = await Promise.all([getApproxLocation(), getApproxLocation()])
    // Assert
    expect(a).toEqual({ lat: 3, lon: 4, city: 'Y' })
    expect(b).toEqual({ lat: 3, lon: 4, city: 'Y' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('never persists to localStorage — a fresh network read every new tab session, only the session cache', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ available: true, lat: 1, lon: 2, city: 'X' }))
    const { getApproxLocation } = await import('./approxLocation')
    await getApproxLocation()
    expect(window.sessionStorage.getItem(SESSION_KEY)).not.toBeNull()
  })
})
