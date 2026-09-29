/**
 * singleReading.integration — W1b commit ②'s actual point: `/today`, the
 * floating capsule, and Home's hero must show the same headline PM2.5
 * number and the same place for the same visitor at the same moment. Unlike
 * every other test in this repo, this file does NOT mock `usePrimaryReading`
 * (or `useTodayGrid`/`useTodayCams`/`useCapsuleData`) — it mocks only the two
 * fetch functions those hooks ultimately call (`fetchGlobalGridSnapshot`,
 * `fetchForecast`), so the real resolver chain (`usePrimaryReading` ->
 * `resolvePrimaryReading`) runs independently in all three surfaces against
 * one shared set of source data. A bug in any one surface's own wiring (the
 * exact class of regression this commit's six tasks were about) would make
 * that surface disagree with the other two here — three separate hand-tuned
 * fixtures, one per surface, could not catch that.
 *
 * W1b commit ③ extends the same guarantee to /today's Conditions surfaces:
 * the hero rail's "PM2.5 now" tile and the Conditions tab's AirQualityLine
 * (both read Open-Meteo's own hourly point before) must show that same number.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent, waitFor, within } from '@testing-library/react'

vi.mock('../api/gridSnapshot', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/gridSnapshot')>()
  // Only the fetch itself is replaced — `DEFAULT_MAX_AGE_HOURS` etc. stay
  // real, since `useTodayCams.ts` imports that constant from this same module.
  return { ...actual, fetchGlobalGridSnapshot: vi.fn() }
})
vi.mock('../lib/today/forecastSource', () => ({ fetchForecast: vi.fn() }))
vi.mock('../hooks/useResolvedLocation', () => ({ useResolvedLocation: vi.fn() }))
vi.mock('../hooks/useWeatherPageData', () => ({ useWeatherPageData: vi.fn() }))
vi.mock('../api/blog', () => ({ fetchBlogFeed: vi.fn() }))
vi.mock('../hooks/useGlobeData', async () => {
  const actual = await vi.importActual<typeof import('../hooks/useGlobeData')>('../hooks/useGlobeData')
  return { ...actual, useDQSSData: vi.fn() }
})

import Today from './Today'
import Home from './Home'
import AqiCapsule from '../components/fluid/capsule/AqiCapsule'
import { fetchGlobalGridSnapshot } from '../api/gridSnapshot'
import { fetchForecast } from '../lib/today/forecastSource'
import { useResolvedLocation } from '../hooks/useResolvedLocation'
import { useWeatherPageData } from '../hooks/useWeatherPageData'
import { fetchBlogFeed } from '../api/blog'
import { useDQSSData } from '../hooks/useGlobeData'
import type { GlobalGridSnapshot } from '../types/data'
import type { ForecastPayload, OpenMeteoWeatherHourly } from '../types/forecast'

// No explicit `ResolvedLocation` annotation — inferring the literal keeps
// `source` typed as the literal `'geolocation'`, which both `location`
// (`ResolvedLocation`, `LocationSource`) and `choice` (`LocationChoice`, a
// narrower union) accept; an explicit annotation would widen it and make
// `choice` (which excludes 'approx'/'default') reject the spread below.
//
// Label deliberately distinct from every CAMS feed-city name this file uses
// ('Seoul' in case 1, 'Busan' in case 2) — with the earlier 'Seoul, KR' the
// visitor's own place and the CAMS feed city read identically, so a bug that
// swapped one for the other on any single surface would not fail here.
const LOCATION = {
  lat: 37.5665,
  lon: 126.978,
  label: 'Suwon, KR',
  source: 'geolocation' as const,
}

function mockLocation() {
  vi.mocked(useResolvedLocation).mockReturnValue({
    location: LOCATION,
    choice: LOCATION,
    approx: { status: 'failed' },
    requesting: false,
    denied: false,
    requestGeolocation: vi.fn(),
    selectCity: vi.fn(),
    clearChoice: vi.fn(),
  })
}

/** A reportable GRID analysis cell right at `LOCATION` — case 1: the
 * analysis wins the headline. */
const GRID_ANALYSIS_READY: GlobalGridSnapshot = {
  pm25: 18.2,
  aqi: 64,
  lat: LOCATION.lat,
  lon: LOCATION.lon,
  source: 'global_grid',
  updatedAt: '2026-09-06T09:00:00Z',
  dqss: 74,
  stale: false,
  plausibility: { verdict: 'reportable', reason: '' },
  nearbyCells: [
    {
      lat: LOCATION.lat,
      lon: LOCATION.lon,
      pm25: 18.2,
      aqi: 64,
      updatedAt: '2026-09-06T09:00:00Z',
      distanceKm: 4,
      plausibility: { verdict: 'reportable', reason: '' },
    },
  ],
}

/** A GRID cell so far past the app's reporting scale that `resolvePrimaryReading`
 * must not let it back the headline — case 2. The 15,867.96 µg/m³ figure is
 * the real Yakutia-fire-belt value `gridPlausibility.ts`'s header comment
 * documents (2026-09-04 measurement) — this is the exact bug this resolver
 * exists to prevent from reaching a reader as-is. */
const GRID_IMPLAUSIBLE: GlobalGridSnapshot = {
  pm25: 15867.96,
  aqi: 500,
  lat: LOCATION.lat,
  lon: LOCATION.lon,
  source: 'global_grid',
  updatedAt: '2026-09-06T09:00:00Z',
  dqss: 40,
  stale: false,
  plausibility: { verdict: 'beyond-scale', reason: 'beyond the top of our reporting scale — we cannot verify this reading' },
  nearbyCells: [
    {
      lat: LOCATION.lat,
      lon: LOCATION.lon,
      pm25: 15867.96,
      aqi: 500,
      updatedAt: '2026-09-06T09:00:00Z',
      distanceKm: 4,
      plausibility: { verdict: 'beyond-scale', reason: 'beyond the top of our reporting scale — we cannot verify this reading' },
    },
  ],
}

function forecastPayload(cityName: string, currentPm25: number): ForecastPayload {
  const base = Date.parse('2026-09-06T06:00:00Z')
  return {
    generated_at: '2026-09-06T06:00:00Z',
    model_version: 'test',
    source: 'open-meteo',
    cities: [
      {
        name: cityName,
        lat: LOCATION.lat,
        lon: LOCATION.lon,
        country_code: 'KR',
        source: 'open-meteo',
        hourly: Array.from({ length: 24 }, (_, i) => ({
          time: new Date(base + i * 3600_000).toISOString(),
          pm25: i === 0 ? currentPm25 : 40 + i,
        })),
      },
    ],
  }
}

// Non-null on purpose: WeatherHero only renders its instrument rail (the
// "PM2.5 now" tile) once the weather section itself is 'ready'. The values are
// chosen to collide with neither case's PM2.5 (18 / 56).
const WEATHER_HOURS = Array.from({ length: 24 }, (_, i) => `2026-09-06T${String(i).padStart(2, '0')}:00`)
const WEATHER_READY: OpenMeteoWeatherHourly = {
  time: WEATHER_HOURS,
  temperature_2m: WEATHER_HOURS.map(() => 23),
  apparent_temperature: WEATHER_HOURS.map(() => 24),
  uv_index: WEATHER_HOURS.map(() => 6),
  weather_code: WEATHER_HOURS.map(() => 0),
}

function mockWeather() {
  vi.mocked(useWeatherPageData).mockReturnValue({
    status: 'ready',
    configured: true,
    weather: WEATHER_READY,
    wind: null,
    mslp: null,
    fetchedAt: Date.now(),
    retry: vi.fn(),
  })
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('reduced-motion'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
  sessionStorage.clear()
  mockLocation()
  mockWeather()
  // Never resolves — HomeStoriesResearch/HomeTrustStrip's own states aren't
  // this file's concern (see Home.test.tsx / HomeStoriesResearch.test.tsx).
  vi.mocked(fetchBlogFeed).mockReturnValue(new Promise(() => {}))
  vi.mocked(useDQSSData).mockReturnValue(null)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.resetAllMocks()
})

/** `.today-answer__meta`'s "{city}{, cc} · {distance} km away · {pm25} µg/m³
 * PM2.5 · ..." line (`TodayAnswer.tsx`) — pulls just the rounded PM2.5
 * integer, scoped to this element so it can't collide with a distance or
 * hour number elsewhere on the page. */
function todayHeadlinePm25(container: HTMLElement): number | null {
  const text = container.querySelector('.today-answer__meta')?.textContent ?? ''
  const m = text.match(/(\d+)\s*µg\/m³\s*PM2\.5/)
  return m ? Number(m[1]) : null
}

/** /today's Conditions-tab surfaces (W1b commit ③): the hero rail's "PM2.5
 * now" tile — found by its label, not position, so the UV tile beside it can
 * never be mistaken for it — and AirQualityLine's "{n} µg/m³ PM2.5" value.
 * Both are rendered from the same `reading` prop `Today.tsx` hands them. */
function todayConditionsReadout(container: HTMLElement): {
  railValue: number | null
  railSub: string | null
  lineValue: number | null
  lineSource: string | null
} {
  const tile = Array.from(container.querySelectorAll('.wx-hero__rail .wx-tile')).find(
    (t) => t.querySelector('.wx-tile__label')?.textContent === 'PM2.5 now',
  )
  const railText = tile?.querySelector('.wx-tile__value')?.textContent
  const lineMatch = container.querySelector('.wx-aq-line__value')?.textContent?.match(/(\d+)\s*µg\/m³\s*PM2\.5/)
  return {
    railValue: railText ? Number(railText) : null,
    railSub: tile?.querySelector('.wx-tile__sub')?.textContent ?? null,
    lineValue: lineMatch ? Number(lineMatch[1]) : null,
    lineSource: container.querySelector('.wx-aq-line__source')?.textContent ?? null,
  }
}

describe('shared headline resolver — /today, the capsule, and Home agree', () => {
  it('shows the same place and the same PM2.5 number on all three surfaces when the GRID analysis is usable', async () => {
    // Arrange — one location, one GRID cell, one CAMS payload; every surface
    // below resolves this independently through the real `usePrimaryReading`.
    vi.mocked(fetchGlobalGridSnapshot).mockResolvedValue(GRID_ANALYSIS_READY)
    vi.mocked(fetchForecast).mockResolvedValue(forecastPayload('Seoul', 30))

    // Act — /today's Insight tab (the only tab that renders the headline).
    window.history.pushState({}, '', '/today?tab=insight')
    const today = render(<Today />)
    await waitFor(() => expect(todayHeadlinePm25(today.container)).toBe(18))

    const capsule = render(<AqiCapsule />)
    await waitFor(() => expect(capsule.container.querySelector('.aq-capsule__value')?.textContent).toBe('18'))
    // Open the panel — the secondary CAMS line and the range/outlook lines
    // (the only places the CAMS feed city may legitimately appear, see the
    // Assert block below) only render once expanded.
    fireEvent.click(within(capsule.container).getByRole('button', { name: /expand for details/i }))

    const home = render(<Home />)
    // `.home-hero__value` is a spring-driven display value (`HomeHero.tsx`'s
    // `valueSpring`/`displayedValue`) that reads 0 for one commit before its
    // own effect jumps it to the real reading — waiting for element presence
    // alone (rather than the settled number) caught the DOM mid-jump here,
    // a test-only race, not a production one (Today/the capsule render their
    // number straight from `reading.pm25`, no local spring state to race).
    await waitFor(() =>
      expect(parseInt(home.container.querySelector('.home-hero__value')?.textContent ?? '', 10)).toBe(18),
    )

    // Assert — the resolved GRID cell (18.2 -> 18) backs the headline
    // everywhere, and every surface names the visitor's own resolved place
    // ("Suwon, KR") for it — never the CAMS feed city ("Seoul"), which only
    // the panel's secondary/outlook lines are allowed to disclose.
    expect(todayHeadlinePm25(today.container)).toBe(18)
    expect(today.container.querySelector('.today-answer__meta')?.textContent).toContain('Suwon, KR')
    expect(today.container.querySelector('.today-answer__meta')?.textContent).not.toContain('Seoul')

    expect(capsule.container.querySelector('.aq-capsule__value')?.textContent).toBe('18')
    expect(capsule.container.querySelector('.aq-capsule__loc')?.textContent).toBe('Suwon, KR')

    expect(parseInt(home.container.querySelector('.home-hero__value')!.textContent!, 10)).toBe(18)
    expect(home.container.querySelector('.home-hero__eyebrow')?.textContent).toBe('Suwon, KR')
    expect(home.container.querySelector('.home-hero__eyebrow')?.textContent).not.toContain('Seoul')

    // The CAMS feed city ("Seoul") surfaces only in the panel's secondary
    // line and its range/outlook lines — Glass-box: it is disclosed, but
    // never folded into the analysis headline's own place/number.
    const sourceLines = capsule.container.querySelectorAll('.aq-capsule-panel__source')
    expect(sourceLines).toHaveLength(2)
    expect(sourceLines[0].textContent).not.toContain('Seoul')
    expect(sourceLines[1].textContent).toContain('Seoul')
    expect(capsule.container.querySelector('.aq-capsule-panel__range')?.textContent).toContain('Seoul')
    // Home's hero splits the same way: the headline's own source line never
    // names the CAMS city, only the secondary line under it does.
    const homeSourceLines = home.container.querySelectorAll('.home-hero__source')
    expect(homeSourceLines).toHaveLength(2)
    expect(homeSourceLines[0].textContent).not.toContain('Seoul')
    expect(homeSourceLines[1].textContent).toContain('Seoul')

    // W1b commit ③ — switch /today to its Conditions tab (every Insight-tab
    // assertion above has already run; the hero rail sits above the tabs and
    // AirQualityLine lives in this one). Both show that same 18, worded as a
    // model analysis (never a measurement) with the same source line Home and
    // the capsule print under it.
    fireEvent.click(within(today.container).getByRole('button', { name: 'Conditions' }))
    const conditions = todayConditionsReadout(today.container)
    const capsuleValue = Number(capsule.container.querySelector('.aq-capsule__value')?.textContent)
    const homeValue = parseInt(home.container.querySelector('.home-hero__value')?.textContent ?? '', 10)
    expect([conditions.railValue, conditions.lineValue, capsuleValue, homeValue]).toEqual([18, 18, 18, 18])
    expect(conditions.railSub).toBe('µg/m³ · model analysis')
    expect(conditions.lineSource).toBe(homeSourceLines[0].textContent)
    expect(conditions.lineSource).toBe(sourceLines[0].textContent)
  })

  it('falls back to the CAMS forecast number and label everywhere when the GRID cell is implausible', async () => {
    // Arrange — the GRID cell resolves (it is not "missing"), but is far
    // past `gridPlausibility.ts`'s reportable scale — `resolvePrimaryReading`
    // must hand every surface to CAMS instead, not just the ones that happen
    // to check for it.
    vi.mocked(fetchGlobalGridSnapshot).mockResolvedValue(GRID_IMPLAUSIBLE)
    vi.mocked(fetchForecast).mockResolvedValue(forecastPayload('Busan', 55.6))

    // Act
    window.history.pushState({}, '', '/today?tab=insight')
    const today = render(<Today />)
    await waitFor(() => expect(todayHeadlinePm25(today.container)).toBe(56))

    const capsule = render(<AqiCapsule />)
    await waitFor(() => expect(capsule.container.querySelector('.aq-capsule__value')?.textContent).toBe('56'))
    fireEvent.click(within(capsule.container).getByRole('button', { name: /expand for details/i }))

    const home = render(<Home />)
    // See the first test's comment — waits for the settled spring value, not
    // just the element's presence.
    await waitFor(() =>
      expect(parseInt(home.container.querySelector('.home-hero__value')?.textContent ?? '', 10)).toBe(56),
    )

    // Assert — the CAMS forecast (55.6 -> 56) backs the headline everywhere,
    // never the 15,868 µg/m³ GRID outlier, and every surface discloses the
    // same forecast city (Busan) it came from.
    expect(todayHeadlinePm25(today.container)).toBe(56)
    expect(today.container.textContent).toContain('[FORECAST]')
    expect(today.container.querySelector('.today-answer__meta')?.textContent).toContain('Busan')

    expect(capsule.container.querySelector('.aq-capsule__value')?.textContent).toBe('56')
    // The capsule's idle row still names the visitor's own place (never the
    // CAMS feed city) — the forecast's own city is disclosed inside the
    // open panel's source line instead (W1b commit ②'s Glass-box split).
    expect(capsule.container.querySelector('.aq-capsule__loc')?.textContent).toBe('Suwon, KR')
    expect(capsule.container.querySelector('.aq-capsule-panel__source')?.textContent).toContain('Busan')

    expect(parseInt(home.container.querySelector('.home-hero__value')!.textContent!, 10)).toBe(56)
    // Here the forecast itself IS the headline (GRID was implausible), so
    // Home's eyebrow (the visitor's own place) must still read "Suwon, KR",
    // not the "Busan" the CAMS feed backs the number with.
    expect(home.container.querySelector('.home-hero__eyebrow')?.textContent).toBe('Suwon, KR')
    expect(home.container.querySelector('.home-hero__source')?.textContent).toContain('Busan')

    // W1b commit ③ — switch /today to its Conditions tab (the Insight-tab
    // assertions above have already run); the hero rail and AirQualityLine
    // show the forecast's 56 too, never the 15,868 µg/m³ GRID outlier, worded
    // as a CAMS forecast.
    fireEvent.click(within(today.container).getByRole('button', { name: 'Conditions' }))
    const conditions = todayConditionsReadout(today.container)
    const capsuleValue = Number(capsule.container.querySelector('.aq-capsule__value')?.textContent)
    const homeValue = parseInt(home.container.querySelector('.home-hero__value')?.textContent ?? '', 10)
    expect([conditions.railValue, conditions.lineValue, capsuleValue, homeValue]).toEqual([56, 56, 56, 56])
    // The tile names the CAMS city (Busan), not the visitor's Suwon it sits under.
    expect(conditions.railSub).toMatch(/^µg\/m³ · CAMS forecast · Busan, KR · \d+ km$/)
    expect(conditions.lineSource).toBe(home.container.querySelector('.home-hero__source')?.textContent)
    expect(today.container.textContent).not.toContain('15868')
  })
})
