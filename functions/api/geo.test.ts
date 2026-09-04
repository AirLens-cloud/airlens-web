/**
 * functions/api/geo.ts — IP-approximate location edge route (AAA).
 *
 * `ctx.request.cf` is Cloudflare-injected at the real edge and absent (or
 * empty-stringed) on `wrangler pages dev`'s local mock — both are exercised
 * here as the expected `available:false` path, not an error case.
 */
import { describe, it, expect } from 'vitest'
import { onRequestGet } from './geo'

function requestWithCf(cf?: Record<string, string>): { request: Request & { cf?: Record<string, string> } } {
  const request = new Request('https://example.test/api/geo') as Request & { cf?: Record<string, string> }
  if (cf) request.cf = cf
  return { request }
}

describe('GET /api/geo', () => {
  it('resolves available:true with the request-sourced lat/lon when cf carries a location', () => {
    // Arrange
    const ctx = requestWithCf({ latitude: '37.5665', longitude: '126.9780', city: 'Seoul', country: 'KR' })
    // Act
    const res = onRequestGet(ctx)
    // Assert
    expect(res.status).toBe(200)
    return res.json().then((body) => {
      expect(body).toEqual({
        available: true,
        lat: 37.5665,
        lon: 126.978,
        city: 'Seoul',
        country: 'KR',
        source: 'ip-approx',
      })
    })
  })

  it('resolves available:false (never 0,0) when cf is entirely absent — the wrangler pages dev local mock', () => {
    // Arrange
    const ctx = requestWithCf(undefined)
    // Act
    const res = onRequestGet(ctx)
    // Assert
    return res.json().then((body) => {
      expect(body).toEqual({ available: false })
    })
  })

  it('resolves available:false when cf carries empty-string coordinates (never treats "" as 0)', () => {
    // Arrange — the local dev mock's shape: fields present but empty.
    const ctx = requestWithCf({ latitude: '', longitude: '' })
    // Act
    const res = onRequestGet(ctx)
    // Assert
    return res.json().then((body) => {
      expect(body).toEqual({ available: false })
    })
  })

  it('resolves available:false when only one of lat/lon is present', () => {
    const ctx = requestWithCf({ latitude: '37.5' })
    const res = onRequestGet(ctx)
    return res.json().then((body) => {
      expect(body).toEqual({ available: false })
    })
  })

  it('resolves available:false when a coordinate is non-numeric', () => {
    const ctx = requestWithCf({ latitude: 'not-a-number', longitude: '126.978' })
    const res = onRequestGet(ctx)
    return res.json().then((body) => {
      expect(body).toEqual({ available: false })
    })
  })

  it('reports city/country as null (never fabricated) when cf omits them', () => {
    const ctx = requestWithCf({ latitude: '51.5074', longitude: '-0.1278' })
    const res = onRequestGet(ctx)
    return res.json().then((body) => {
      expect(body).toEqual({ available: true, lat: 51.5074, lon: -0.1278, city: null, country: null, source: 'ip-approx' })
    })
  })

  it('treats an empty city/country string as unresolved, not as a place named ""', () => {
    const ctx = requestWithCf({ latitude: '51.5074', longitude: '-0.1278', city: '', country: '' })
    const res = onRequestGet(ctx)
    return res.json().then((body) => {
      expect(body).toEqual({ available: true, lat: 51.5074, lon: -0.1278, city: null, country: null, source: 'ip-approx' })
    })
  })

  it('is never cached — Cache-Control: no-store on every response, available or not', () => {
    const available = onRequestGet(requestWithCf({ latitude: '1', longitude: '2' }))
    const unavailable = onRequestGet(requestWithCf(undefined))
    expect(available.headers.get('cache-control')).toBe('no-store')
    expect(unavailable.headers.get('cache-control')).toBe('no-store')
  })
})
