// AAA coverage for the Weather page's city catalog: loading adapts the TFT
// mirror's city shape, and filtering matches name or country code
// case-insensitively without mutating the input list.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { filterCities, loadCityCatalog, type WeatherCity } from './cityCatalog'

const FIXTURE: WeatherCity[] = [
  { name: 'Seoul', lat: 37.5665, lon: 126.978, countryCode: 'KR' },
  { name: 'Tokyo', lat: 35.6762, lon: 139.6503, countryCode: 'JP' },
  { name: 'Paris', lat: 48.8566, lon: 2.3522, countryCode: 'FR' },
]

describe('filterCities', () => {
  it('returns every city unchanged when the query is empty', () => {
    const result = filterCities(FIXTURE, '')
    expect(result).toEqual(FIXTURE)
  })

  it('matches by city name, case-insensitively', () => {
    const result = filterCities(FIXTURE, 'seo')
    expect(result.map((c) => c.name)).toEqual(['Seoul'])
  })

  it('matches by country code, case-insensitively', () => {
    const result = filterCities(FIXTURE, 'jp')
    expect(result.map((c) => c.name)).toEqual(['Tokyo'])
  })

  it('returns an empty array when nothing matches', () => {
    const result = filterCities(FIXTURE, 'zzz')
    expect(result).toEqual([])
  })

  it('does not mutate the input array', () => {
    const before = [...FIXTURE]
    filterCities(FIXTURE, 'tokyo')
    expect(FIXTURE).toEqual(before)
  })
})

describe('loadCityCatalog', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('tft.json')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              generated_at: '2026-08-26T00:00:00Z',
              model_version: 'test',
              cities: [
                { name: 'Seoul', lat: 37.5665, lon: 126.978, country_code: 'KR', hourly: [] },
              ],
            }),
          } as unknown as Response
        }
        return { ok: false, status: 404 } as Response
      }),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('adapts the TFT mirror city shape (snake_case -> camelCase)', async () => {
    const cities = await loadCityCatalog()

    expect(cities).toEqual([{ name: 'Seoul', lat: 37.5665, lon: 126.978, countryCode: 'KR' }])
  })
})
