/**
 * api/registry.ts — live status + last-good retention (AAA).
 *
 * The property under test: a poll that cannot reach a feed does not
 * overwrite what the previous successful poll established (ported from
 * `hooks/useDataHealth.ts`'s "last-good over fabricated-bad" rule).
 * `forecast` is used for this because its probe (`fetchForecast`) has no
 * module-level cache of its own — unlike the grid/fires feeds, a re-run
 * genuinely hits the mocked network again rather than returning stale
 * in-memory state from an unrelated module.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchFeedRegistry, __resetRegistryCache } from './registry'

// Fixtures must be fresh relative to the real clock — every feed's status is
// judged against its freshnessSlaH from `Date.now()`, so a hardcoded past
// date would silently read as `stale` regardless of what a test intends.
const FRESH = new Date(Date.now() - 5 * 60_000).toISOString()

function gridBody() {
  return { updated_at: FRESH, points: [{ lat: 1, lon: 1, pm25: 10 }] }
}
function timelineBody() {
  return {
    variable: 'pm2_5',
    source: 'gefs-aerosols',
    refTime: FRESH,
    generatedAt: FRESH,
    stepHours: 3,
    windowHours: 24,
    resolution: 2,
    frames: [{ validTime: FRESH, leadHours: 3, cycle: '2026080100', file: 'pm25-x.json' }],
  }
}
function firesBody() {
  return { fires: [{ lat: 1, lon: 1 }], refTime: FRESH, count: 1 }
}
function windRecord() {
  return {
    header: { nx: 2, ny: 2, lo1: 0, la1: 90, dx: 180, dy: 180, generatedAt: FRESH, refTime: FRESH },
    data: [0, 0, 0, 0],
  }
}
function forecastBody() {
  return {
    generated_at: FRESH,
    model_version: 'v1',
    cities: [{ name: 'Seoul', lat: 37.5, lon: 127, country_code: 'KR', hourly: [] }],
  }
}

function installFetch(opts: { forecastFails?: boolean } = {}) {
  const spy = vi.fn(async (url: string) => {
    if (opts.forecastFails && url.includes('forecast.json')) {
      return { ok: false, status: 500 } as Response
    }
    if (url.includes('current-pm25-grid.json')) return { ok: true, status: 200, json: async () => gridBody() } as unknown as Response
    if (url.includes('timeline/manifest.json')) return { ok: true, status: 200, json: async () => timelineBody() } as unknown as Response
    if (url.includes('active-fires.json')) return { ok: true, status: 200, json: async () => firesBody() } as unknown as Response
    if (url.includes('wind-surface.json')) return { ok: true, status: 200, json: async () => [windRecord(), windRecord()] } as unknown as Response
    if (url.includes('forecast.json')) return { ok: true, status: 200, json: async () => forecastBody() } as unknown as Response
    return { ok: false, status: 404 } as Response
  })
  vi.stubGlobal('fetch', spy)
  return spy
}

beforeEach(() => {
  vi.unstubAllGlobals()
  __resetRegistryCache()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('fetchFeedRegistry', () => {
  it('derives status/lastSuccess from a live poll, never a code constant', async () => {
    // Arrange
    installFetch()
    // Act
    const registry = await fetchFeedRegistry()
    const forecast = registry.feeds.find((f) => f.id === 'forecast')
    // Assert
    expect(forecast?.status).toBe('ready')
    expect(forecast?.lastSuccess).toBe(FRESH)
    expect(registry.feeds).toHaveLength(5)
  })

  // ATTRIBUTION.md is the SOT this maps against — these assert against that
  // file's researched table rather than re-deriving a license, so a change to
  // one without the other fails here instead of the two silently disagreeing.
  it('resolves each feed\'s license from ATTRIBUTION.md, keyed on its provider', async () => {
    // Arrange
    installFetch()
    // Act
    const registry = await fetchFeedRegistry()
    const byId = Object.fromEntries(registry.feeds.map((f) => [f.id, f]))
    // Assert
    expect(byId['pm25-grid']?.license).toBe('Public Domain (U.S. Government work)')
    expect(byId['pm25-timeline']?.license).toBe('Public Domain (U.S. Government work)')
    expect(byId['fires']?.license).toBe('Public Domain (U.S. Government work)')
    expect(byId['forecast']?.license).toBe('CC BY 4.0')
  })

  it('marks a provider absent from ATTRIBUTION.md as unverified rather than guessing', async () => {
    // Arrange — the wind feed's provider is plain NOAA/NCEP GFS, a distinct
    // product from the GEFS-Aerosols one ATTRIBUTION.md documents. Sharing a
    // licence because both are NOAA would be exactly the kind of guess this
    // registry's own header comment forbids.
    installFetch()
    // Act
    const registry = await fetchFeedRegistry()
    const wind = registry.feeds.find((f) => f.id === 'wind')
    // Assert
    expect(wind?.provider).toBe('NOAA/NCEP GFS')
    expect(wind?.license).toBe('Unverified — not documented in ATTRIBUTION.md')
  })

  it('keeps the last-good state when a later poll cannot reach the feed', async () => {
    // Arrange — first poll succeeds for every feed.
    installFetch()
    const first = await fetchFeedRegistry()
    const firstForecast = first.feeds.find((f) => f.id === 'forecast')
    expect(firstForecast?.status).toBe('ready')

    // Act — second poll: the forecast source is unreachable.
    installFetch({ forecastFails: true })
    const second = await fetchFeedRegistry()
    const secondForecast = second.feeds.find((f) => f.id === 'forecast')

    // Assert — the confirmed timestamp survives; the row is not rewritten
    // to "unavailable" just because this one poll could not refresh it.
    expect(secondForecast?.lastSuccess).toBe(firstForecast?.lastSuccess)
    expect(secondForecast?.status).not.toBe('unavailable')
    expect(secondForecast?.note).toMatch(/could not reach/)
  })

  it('reports unavailable, not a fabricated timestamp, when no poll has ever succeeded', async () => {
    // Arrange — every feed fails from the very first poll.
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 }) as Response))
    // Act
    const registry = await fetchFeedRegistry()
    const forecast = registry.feeds.find((f) => f.id === 'forecast')
    // Assert
    expect(forecast?.status).toBe('unavailable')
    expect(forecast?.lastSuccess).toBeNull()
  })

  // Legal obligation, not a preference: CC BY 4.0 specifies this sentence for
  // Copernicus/CAMS data, and the forecast feed carries it. Asserted verbatim
  // and character-for-character so a well-meaning reword ("Copernicus CAMS
  // data") fails here instead of silently putting the site back out of
  // compliance. It must also survive an unreachable feed, because last-good
  // retention keeps serving the entry after the poll fails.
  const COPERNICUS =
    'Open-Meteo CAMS. Generated using Copernicus Atmosphere Monitoring Service information 2026.'

  it('carries the licence-mandated Copernicus wording on the CAMS feed', async () => {
    // Arrange
    installFetch()
    // Act
    const registry = await fetchFeedRegistry()
    const forecast = registry.feeds.find((f) => f.id === 'forecast')
    // Assert
    expect(forecast?.attribution).toBe(COPERNICUS)
  })

  it('keeps the Copernicus wording when the feed is unreachable', async () => {
    // Arrange — never a successful poll, so the entry is built from the
    // failure path rather than from a probe result.
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 }) as Response))
    // Act
    const registry = await fetchFeedRegistry()
    const forecast = registry.feeds.find((f) => f.id === 'forecast')
    // Assert
    expect(forecast?.status).toBe('unavailable')
    expect(forecast?.attribution).toBe(COPERNICUS)
  })

  it('leaves attribution null where no licence mandates wording', async () => {
    // Guards the opposite failure: filling every row with a plausible
    // attribution sentence would be exactly the fabrication `LICENSE_UNVERIFIED`
    // exists to refuse for the license field.
    // Arrange
    installFetch()
    // Act
    const registry = await fetchFeedRegistry()
    const others = registry.feeds.filter((f) => f.id !== 'forecast')
    // Assert
    expect(others.length).toBeGreaterThan(0)
    expect(others.every((f) => f.attribution === null)).toBe(true)
  })
})
