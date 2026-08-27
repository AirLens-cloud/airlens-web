/**
 * api/countrySeries.ts — the observed panel and its published interval (AAA).
 *
 * The property under test throughout: p10/p90 are carried only when the feed
 * published them. The monorepo's trend chart derived a band by multiplying the
 * mean (× 0.8 / × 1.25); reintroducing anything of that shape here is the one
 * regression these tests exist to catch.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchCountrySeries, fetchCountryCoverage } from './countrySeries'

function seriesBody(over: Record<string, unknown> = {}) {
  return {
    country: 'KR',
    yearRange: [2016, 2019],
    series: [
      { year: 2016, pm25Mean: 26.1, p10: 12.4, p90: 41.9, stationCount: 480, sources: ['acag_v6'] },
      { year: 2017, pm25Mean: 25.2, p10: null, p90: null, stationCount: 502, sources: ['acag_v6'] },
    ],
    sourcesUsed: ['acag_v6', 'openaq'],
    totalStations: 512,
    policy: { treatment_year: 2018, policy_name: 'Fine Dust Act' },
    generatedAt: '2026-08-26T00:00:00Z',
    ...over,
  }
}

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

describe('fetchCountrySeries', () => {
  it('maps the published panel onto the CountryPanel contract', async () => {
    // Arrange
    const spy = mockFetch({ 'by_country/KR.json': seriesBody() })
    // Act
    const panel = await fetchCountrySeries('kr', { countryName: 'South Korea', flag: '🇰🇷' })
    // Assert
    expect(String(spy.mock.calls[0][0])).toContain('insights-data/by_country/KR.json')
    expect(panel?.countryCode).toBe('KR')
    expect(panel?.countryName).toBe('South Korea')
    expect(panel?.treatmentYear).toBe(2018)
    expect(panel?.policyName).toBe('Fine Dust Act')
    expect(panel?.totalStations).toBe(512)
    expect(panel?.sourcesUsed).toEqual(['acag_v6', 'openaq'])
  })

  it('carries a published interval verbatim and leaves an unpublished one null', async () => {
    // Arrange — 2016 has a measured band, 2017 does not.
    mockFetch({ 'by_country/KR.json': seriesBody() })
    // Act
    const panel = await fetchCountrySeries('KR')
    // Assert — no band is ever derived from the mean.
    expect(panel?.points[0]).toMatchObject({ year: 2016, pm25: 26.1, p10: 12.4, p90: 41.9 })
    expect(panel?.points[1]).toMatchObject({ year: 2017, pm25: 25.2, p10: null, p90: null })
  })

  it('drops a year with no usable mean rather than zero-filling it', async () => {
    // Arrange
    mockFetch({
      'by_country/KR.json': seriesBody({
        series: [
          { year: 2016, pm25Mean: 26.1 },
          { year: 2017, pm25Mean: null },
          { year: null, pm25Mean: 20.0 },
        ],
      }),
    })
    // Act
    const panel = await fetchCountrySeries('KR')
    // Assert
    expect(panel?.points.map((p) => p.year)).toEqual([2016])
  })

  it('collapses a repeated year to one point, keeping the last', async () => {
    // Arrange — two rows stamped 2016 is a publisher bug, but the panel is read
    // downstream as a year-indexed sequence: the trend band walks adjacent
    // years, so a repeat breaks contiguity and strands the earlier point, which
    // the caption then calls "a year with no adjacent year" — untrue of a
    // duplicate. Defining the behaviour here beats letting it fall out of a
    // rendering loop.
    mockFetch({
      'by_country/KR.json': seriesBody({
        series: [
          { year: 2016, pm25Mean: 26.1, p10: 12, p90: 40 },
          { year: 2016, pm25Mean: 25.0, p10: 11, p90: 39 },
          { year: 2017, pm25Mean: 24.0, p10: 10, p90: 38 },
        ],
      }),
    })
    // Act
    const panel = await fetchCountrySeries('KR')
    // Assert
    expect(panel?.points.map((p) => p.year)).toEqual([2016, 2017])
    expect(panel?.points[0].pm25).toBe(25.0)
  })

  it('sorts years ascending regardless of published order', async () => {
    mockFetch({
      'by_country/KR.json': seriesBody({
        series: [{ year: 2019, pm25Mean: 21.4 }, { year: 2016, pm25Mean: 26.1 }],
      }),
    })
    const panel = await fetchCountrySeries('KR')
    expect(panel?.points.map((p) => p.year)).toEqual([2016, 2019])
  })

  it('returns null when the file exists but no year survives', async () => {
    // Arrange — an empty chart would read as a flat series that was measured.
    mockFetch({ 'by_country/KR.json': seriesBody({ series: [] }) })
    // Act / Assert
    await expect(fetchCountrySeries('KR')).resolves.toBeNull()
  })

  it('returns null for a country with no published panel', async () => {
    // Arrange — 404 is the feed saying this country has no panel.
    mockFetch({})
    // Act / Assert
    await expect(fetchCountrySeries('ZZ')).resolves.toBeNull()
  })

  it('THROWS on a server error instead of reporting the panel as absent', async () => {
    // Arrange — a 502 says nothing about whether a panel exists.
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 502 }) as Response))
    // Act / Assert — null here would draw an empty chart for a country that has data.
    await expect(fetchCountrySeries('KR')).rejects.toThrow(/502/)
  })

  it('THROWS when the network call itself fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    await expect(fetchCountrySeries('KR')).rejects.toThrow(/offline/)
  })

  it('rejects a malformed country code without fetching', async () => {
    const spy = mockFetch({ 'by_country/KR.json': seriesBody() })
    await expect(fetchCountrySeries('../secrets')).resolves.toBeNull()
    expect(spy).not.toHaveBeenCalled()
  })

  it('defaults the metadata fields the index owns to null', async () => {
    mockFetch({ 'by_country/KR.json': seriesBody({ policy: undefined, totalStations: null }) })
    const panel = await fetchCountrySeries('KR')
    expect(panel?.countryName).toBeNull()
    expect(panel?.flag).toBeNull()
    expect(panel?.treatmentYear).toBeNull()
    expect(panel?.policyName).toBeNull()
    expect(panel?.totalStations).toBeNull()
  })
})

describe('fetchCountryCoverage', () => {
  it('returns the coverage rows from the insights index', async () => {
    // Arrange
    const rows = [{ code: 'KR', yearRange: [2016, 2019], years: 4, totalStations: 512, sourcesUsed: ['acag_v6'] }]
    mockFetch({ 'insights-data/index.json': { countries: rows } })
    // Act / Assert
    await expect(fetchCountryCoverage()).resolves.toEqual(rows)
  })

  it('returns an empty list — never throws — when the index is missing', async () => {
    mockFetch({})
    await expect(fetchCountryCoverage()).resolves.toEqual([])
  })
})
