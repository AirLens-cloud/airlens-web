// Page-level smoke coverage for the /today briefing surface (Weather
// Storyboard v3, Wave 2A): tab default/switch, the /weather->/today
// redirect shim's `?tab=conditions` param, the pre-Wave-2A `?tab=decision`
// name's back-compat mapping to Insight, the tier-mapped Answer sentence,
// the GOOGLE cell's honest "not connected" void (never silently agreeing),
// and a partial render when one source fails while the other still
// resolves.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent, act } from '@testing-library/react'

vi.mock('../hooks/useResolvedLocation', () => ({ useResolvedLocation: vi.fn() }))
vi.mock('../hooks/useWeatherPageData', () => ({ useWeatherPageData: vi.fn() }))
vi.mock('../hooks/useTodayGrid', () => ({ useTodayGrid: vi.fn() }))
vi.mock('../hooks/useTodayCams', () => ({ useTodayCams: vi.fn() }))

import { useResolvedLocation } from '../hooks/useResolvedLocation'
import { useWeatherPageData } from '../hooks/useWeatherPageData'
import { useTodayGrid } from '../hooks/useTodayGrid'
import { useTodayCams } from '../hooks/useTodayCams'
import Today from './Today'
import type { TodayGridState } from '../hooks/useTodayGrid'
import type { TodayCamsState } from '../hooks/useTodayCams'
import type { OpenMeteoWeatherHourly } from '../types/forecast'

const SEOUL = { lat: 37.5665, lon: 126.978, source: 'default' as const, label: 'Seoul, KR' }

function mockGeo(overrides: Partial<ReturnType<typeof useResolvedLocation>> = {}) {
  vi.mocked(useResolvedLocation).mockReturnValue({
    location: SEOUL,
    choice: null,
    approx: { status: 'failed' },
    requesting: false,
    denied: false,
    requestGeolocation: vi.fn(),
    selectCity: vi.fn(),
    clearChoice: vi.fn(),
    ...overrides,
  })
}

function mockWeather(overrides: Partial<ReturnType<typeof useWeatherPageData>> = {}) {
  vi.mocked(useWeatherPageData).mockReturnValue({
    status: 'ready',
    configured: true,
    weather: null,
    wind: null,
    mslp: null,
    fetchedAt: Date.now(),
    retry: vi.fn(),
    ...overrides,
  })
}

function mockGrid(state: TodayGridState) {
  vi.mocked(useTodayGrid).mockReturnValue(state)
}

function mockCams(state: TodayCamsState) {
  vi.mocked(useTodayCams).mockReturnValue(state)
}

/** A ready `TodayCamsState` with sane defaults (`stale: false`) — spreadable
 * per test so each only names what it cares about. */
function camsReady(overrides: Partial<Extract<TodayCamsState, { status: 'ready' }>> = {}): TodayCamsState {
  return {
    status: 'ready',
    cityName: 'Seoul',
    countryCode: 'KR',
    distanceKm: 1,
    current: 22,
    tier: 'good',
    series24h: [{ time: '2026-08-26T00:00:00Z', p10: null, p50: 22, p90: null }],
    updatedAt: '2026-08-26T00:00:00Z',
    stale: false,
    ...overrides,
  }
}

/** Insight-tab content (HUD/Answer/Why/WhatNext/Evidence) only renders once
 * the Insight tab is selected — Conditions is the default (Wave 2A). Tests
 * that assert on that content open directly on `?tab=insight`. */
function openOnInsightTab() {
  window.history.pushState({}, '', '/today?tab=insight')
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('reduced-motion'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.resetAllMocks()
  window.history.pushState({}, '', '/today')
})

describe('Today page', () => {
  it('renders the Conditions tab by default', () => {
    // Arrange
    mockGeo()
    mockWeather()
    mockGrid({ status: 'missing' })
    mockCams({ status: 'missing' })
    // Act
    const { container } = render(<Today />)
    // Assert
    expect(container.querySelector('.today-conditions')).not.toBeNull()
    expect(container.querySelector('.today-decision')).toBeNull()
  })

  it('opens on the Conditions tab when ?tab=conditions is present (the /weather redirect shim)', () => {
    // Arrange
    window.history.pushState({}, '', '/today?tab=conditions')
    mockGeo()
    mockWeather()
    mockGrid({ status: 'missing' })
    mockCams({ status: 'missing' })
    // Act
    const { container } = render(<Today />)
    // Assert
    expect(container.querySelector('.today-conditions')).not.toBeNull()
    expect(container.querySelector('.today-decision')).toBeNull()
  })

  it('opens on the Insight tab when ?tab=decision is present (back-compat for the tab\'s pre-Wave-2A name)', () => {
    // Arrange
    window.history.pushState({}, '', '/today?tab=decision')
    mockGeo()
    mockWeather()
    mockGrid({ status: 'missing' })
    mockCams({ status: 'missing' })
    // Act
    const { container } = render(<Today />)
    // Assert
    expect(container.querySelector('.today-decision')).not.toBeNull()
    expect(container.querySelector('.today-conditions')).toBeNull()
  })

  it('switches from Conditions to Insight on tab click', () => {
    // Arrange
    mockGeo()
    mockWeather()
    mockGrid({ status: 'missing' })
    mockCams({ status: 'missing' })
    const { getByText, container } = render(<Today />)
    // Act
    fireEvent.click(getByText('Insight'))
    // Assert
    expect(container.querySelector('.today-decision')).not.toBeNull()
    expect(container.querySelector('.today-conditions')).toBeNull()
  })

  it('renders the tier-mapped Answer sentence for a moderate GRID reading', () => {
    // Arrange
    openOnInsightTab()
    mockGeo()
    mockWeather()
    mockGrid({ status: 'ready', pm25: 20, updatedAt: '2026-08-26T00:00:00Z', stale: false, distanceKm: 1 })
    mockCams({ status: 'missing' })
    // Act
    const { getByText } = render(<Today />)
    // Assert — tierFromPm25(20) === 'moderate' -> ANSWER_SENTENCE.moderate
    expect(getByText('Air is acceptable — most people can go about their day outside.')).toBeTruthy()
  })

  it('wraps the µg/m³ unit in a `.unit` span inside the Answer meta line — its ancestor is `.t-micro` (uppercase), which would otherwise render µ (U+00B5) as Greek capital Mu ("MG/M³", a 1000x unit misread jsdom cannot itself catch since text-transform is a CSS render effect, not a DOM text change)', () => {
    // Arrange
    openOnInsightTab()
    mockGeo()
    mockWeather()
    mockGrid({ status: 'ready', pm25: 20, updatedAt: '2026-08-26T00:00:00Z', stale: false, distanceKm: 1 })
    mockCams({ status: 'missing' })
    // Act
    const { container } = render(<Today />)
    // Assert
    const unitEl = container.querySelector('.today-answer__meta .unit')
    expect(unitEl?.textContent).toBe('µg/m³')
  })

  it('wraps the µg/m³ unit in `.unit` spans inside the Evidence GRID/CAMS/AGREEMENT cells (also `.t-micro`)', () => {
    // Arrange
    openOnInsightTab()
    mockGeo()
    mockWeather()
    mockGrid({ status: 'ready', pm25: 20, updatedAt: '2026-08-26T00:00:00Z', stale: false, distanceKm: 1 })
    mockCams(camsReady())
    // Act
    const { container } = render(<Today />)
    // Assert — GRID + CAMS + AGREEMENT cells each carry one `.unit` span.
    const units = container.querySelectorAll('.today-evidence__cells .unit')
    expect(units.length).toBe(3)
    for (const el of units) {
      expect(el.textContent).toBe('µg/m³')
    }
  })

  it('always renders the GOOGLE cell as an honest "not connected" void — never a source that silently agreed', () => {
    // Arrange
    openOnInsightTab()
    mockGeo()
    mockWeather()
    mockGrid({ status: 'ready', pm25: 20, updatedAt: '2026-08-26T00:00:00Z', stale: false, distanceKm: 1 })
    mockCams(camsReady({ series24h: [] }))
    // Act
    const { getByText } = render(<Today />)
    // Assert
    expect(getByText(/Not connected — connector not built/)).toBeTruthy()
  })

  it('renders a partial view when GRID fails but CAMS succeeds — GRID states its own absence, CAMS still renders', () => {
    // Arrange
    openOnInsightTab()
    mockGeo()
    mockWeather()
    mockGrid({ status: 'missing' })
    mockCams(camsReady())
    // Act
    const { getByText, container } = render(<Today />)
    // Assert
    expect(getByText('No grid coverage for this location.')).toBeTruthy()
    expect(container.querySelector('[data-source="cams"] .today-cell__value')).not.toBeNull()
  })

  it('renders the Evidence AGREEMENT cell honestly when only one source resolved', () => {
    // Arrange
    openOnInsightTab()
    mockGeo()
    mockWeather()
    mockGrid({ status: 'ready', pm25: 20, updatedAt: '2026-08-26T00:00:00Z', stale: false, distanceKm: 1 })
    mockCams({ status: 'missing' })
    // Act
    const { getByText } = render(<Today />)
    // Assert
    expect(getByText('Not enough sources to compare.')).toBeTruthy()
  })

  it('renders a stale CAMS-primary reading as stale — GRID missing, CAMS is the only (stale) source, so "ready" would be dishonest', () => {
    // Arrange — GRID absent so CAMS becomes the primary reading; its payload
    // carries `stale: true` (e.g. the "may be stale" static forecast fallback).
    openOnInsightTab()
    mockGeo()
    mockWeather()
    mockGrid({ status: 'missing' })
    mockCams(camsReady({ stale: true }))
    // Act
    const { container } = render(<Today />)
    // Assert — HUD dot reflects stale status, and the Evidence/Why CAMS cells
    // both say so, mirroring the existing GRID stale pattern.
    expect(container.querySelector('.gobs-live-dot.is-stale')).not.toBeNull()
    expect(container.querySelector('.gobs-live-dot.is-ready')).toBeNull()
    const camsWhySub = container.querySelector('[data-source="cams"] .today-cell__sub')
    expect(camsWhySub?.textContent).toMatch(/^stale · forecast/)
    const camsEvidence = container.querySelectorAll('.today-evidence__cells .today-cell')[1]
    expect(camsEvidence?.textContent).toMatch(/· stale/)
  })

  it('renders a fresh CAMS-primary reading as ready — GRID missing, CAMS stale:false', () => {
    // Arrange — "fresh" needs a clock near the fixture's 2026-08-26 generation
    // time: since W1b ④ staleness is also judged against the ticking clock,
    // so on the real clock this fixture would (correctly) read as stale.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-26T01:00:00Z'))
    try {
      openOnInsightTab()
      mockGeo()
      mockWeather()
      mockGrid({ status: 'missing' })
      mockCams(camsReady({ stale: false }))
      // Act
      const { container } = render(<Today />)
      // Assert
      expect(container.querySelector('.gobs-live-dot.is-ready')).not.toBeNull()
      const camsWhySub = container.querySelector('[data-source="cams"] .today-cell__sub')
      expect(camsWhySub?.textContent).not.toMatch(/^stale/)
    } finally {
      vi.useRealTimers()
    }
  })

  it('renders the distance to the primary source next to its city name when known', () => {
    // Arrange
    openOnInsightTab()
    mockGeo()
    mockWeather()
    mockGrid({ status: 'ready', pm25: 20, updatedAt: '2026-08-26T00:00:00Z', stale: false, distanceKm: 12.4 })
    mockCams({ status: 'missing' })
    // Act
    const { container } = render(<Today />)
    // Assert
    expect(container.querySelector('.today-answer__meta')?.textContent).toContain('12 km away')
  })

  it('omits the distance suffix when the primary source has no distanceKm', () => {
    // Arrange — CAMS becomes primary via `nearestCity` returning no match
    // (distanceKm null is only reachable through the hook's own contract, but
    // Today.tsx's fallback of `null` for an unresolved primary must not print
    // "null km away" or similar).
    openOnInsightTab()
    mockGeo()
    mockWeather()
    mockGrid({ status: 'missing' })
    mockCams({ status: 'missing' })
    // Act
    const { container } = render(<Today />)
    // Assert
    expect(container.querySelector('.today-answer__meta')?.textContent).not.toContain('km away')
  })

  it('shows an honest "single source" confidence line — never a fixed "/2" — when only one of GRID/CAMS resolved', () => {
    // Arrange
    openOnInsightTab()
    mockGeo()
    mockWeather()
    mockGrid({ status: 'ready', pm25: 20, updatedAt: '2026-08-26T00:00:00Z', stale: false, distanceKm: 1 })
    mockCams({ status: 'missing' })
    // Act
    const { getByText, queryByText } = render(<Today />)
    // Assert
    expect(getByText(/Single source — no cross-check available/)).toBeTruthy()
    expect(queryByText(/\/2 sources agree/)).toBeNull()
  })

  it('shows the resolved-count denominator (not a fixed "/2") when both GRID and CAMS resolve and agree', () => {
    // Arrange — both PM2.5 readings land in the same tier (good, <=12).
    openOnInsightTab()
    mockGeo()
    mockWeather()
    mockGrid({ status: 'ready', pm25: 8, updatedAt: '2026-08-26T00:00:00Z', stale: false, distanceKm: 1 })
    mockCams(camsReady({ current: 9, tier: 'good' }))
    // Act
    const { getByText } = render(<Today />)
    // Assert
    expect(getByText(/2\/2 sources agree on tier/)).toBeTruthy()
  })

  it('shows a real DQSS score in TrustLine as its grade badge when the GRID reading carries one', () => {
    // Arrange
    mockGeo()
    mockWeather()
    mockGrid({ status: 'ready', pm25: 20, updatedAt: '2026-08-26T00:00:00Z', stale: false, distanceKm: 1, dqss: 82 })
    mockCams({ status: 'missing' })
    // Act
    const { container } = render(<Today />)
    // Assert
    const trustLine = container.querySelector('[data-testid="trust-line"]')
    // 82 is an A (≥ 80) — the badge, not the raw "82/100" (F53).
    expect(trustLine?.querySelector('.dqss-badge')?.getAttribute('data-dqss')).toBe('A')
    expect(trustLine?.textContent).not.toMatch(/82\/100/)
    // GRID publishes no uncertainty band regardless of DQSS presence.
    expect(trustLine?.textContent).toMatch(/not published/)
  })

  it('withholds DQSS honestly (with a reason) when the GRID reading carries none', () => {
    // Arrange
    mockGeo()
    mockWeather()
    mockGrid({ status: 'ready', pm25: 20, updatedAt: '2026-08-26T00:00:00Z', stale: false, distanceKm: 1 })
    mockCams({ status: 'missing' })
    // Act
    const { container } = render(<Today />)
    // Assert
    const trustLine = container.querySelector('[data-testid="trust-line"]')
    expect(trustLine?.textContent).toMatch(/DQSS.*withheld/)
  })

  it('shows a real p10/p90 band in TrustLine when CAMS is primary and publishes one', () => {
    // Arrange — GRID missing, so CAMS becomes primary.
    mockGeo()
    mockWeather()
    mockGrid({ status: 'missing' })
    mockCams(
      camsReady({
        series24h: [{ time: '2026-08-26T00:00:00Z', p10: 18, p50: 22, p90: 26 }],
      }),
    )
    // Act
    const { container } = render(<Today />)
    // Assert
    const trustLine = container.querySelector('[data-testid="trust-line"]')
    expect(trustLine?.textContent).toMatch(/18\.0–26\.0/)
    // Forecast source publishes no DQSS regardless of the uncertainty band.
    expect(trustLine?.textContent).toMatch(/withheld/)
  })

  it('renders no TrustLine when neither GRID nor CAMS resolves a reading', () => {
    // Arrange
    mockGeo()
    mockWeather()
    mockGrid({ status: 'missing' })
    mockCams({ status: 'missing' })
    // Act
    const { container } = render(<Today />)
    // Assert
    expect(container.querySelector('[data-testid="trust-line"]')).toBeNull()
  })
})

/**
 * The live artifact ships 1° cells in the thousands of µg/m³ over boreal fire
 * plumes (max 15,867.96 at 65°N 116°E, measured 2026-09-04). GRID is the
 * preferred source, so without a plausibility check such a cell would win the
 * headline outright and tell a reader their local air was 15,868 µg/m³.
 *
 * The contract these tests pin is narrow and worth stating: the value is
 * never altered or hidden, it just stops being allowed to decide anything.
 */
describe('Today — an unverifiable GRID cell', () => {
  const BEYOND_SCALE = {
    status: 'ready' as const,
    pm25: 15867.96,
    updatedAt: '2026-08-26T00:00:00Z',
    stale: false,
    distanceKm: 12,
    plausibility: { verdict: 'beyond-scale' as const, reason: 'beyond the top of our reporting scale — we cannot verify this reading' },
  }

  it('hands the headline to CAMS instead of reporting thousands of µg/m³', () => {
    // Arrange
    openOnInsightTab()
    mockGeo()
    mockWeather()
    mockGrid(BEYOND_SCALE)
    mockCams(camsReady({ current: 20, tier: 'good' }))

    // Act
    const { container } = render(<Today />)
    const answer = container.querySelector('.today-answer')

    // Assert — the CAMS reading carries the answer, and the impossible figure
    // is nowhere in the sentence a reader acts on.
    expect(answer?.textContent).toContain('20')
    expect(answer?.textContent).not.toContain('15868')
  })

  it('still shows the real number, with the reason, in the WHY panel', () => {
    // Arrange
    openOnInsightTab()
    mockGeo()
    mockWeather()
    mockGrid(BEYOND_SCALE)
    mockCams(camsReady({ current: 20, tier: 'good' }))

    // Act
    const { container } = render(<Today />)
    const gridCell = container.querySelector('.today-cell[data-source="grid"]')

    // Assert — suppressing the figure would erase the evidence that the model
    // produced it. Both the number and the reason have to be present.
    expect(gridCell?.textContent).toContain('15868')
    expect(gridCell?.textContent).toContain('cannot verify')
  })

  it('stops claiming the sources agree or disagree', () => {
    // Arrange — a 15,848 µg/m³ "disagreement" is not a comparison anyone can use.
    openOnInsightTab()
    mockGeo()
    mockWeather()
    mockGrid(BEYOND_SCALE)
    mockCams(camsReady({ current: 20, tier: 'good' }))

    // Act
    const { container } = render(<Today />)
    const agreement = container.querySelector('[data-testid="today-evidence-agreement"]')

    // Assert
    expect(agreement?.textContent).toContain('Not enough sources to compare')
    expect(agreement?.textContent).not.toContain('15848')
  })

  it('reaches no verdict at all when CAMS cannot stand in', () => {
    // Arrange — nothing left to fall back to.
    openOnInsightTab()
    mockGeo()
    mockWeather()
    mockGrid(BEYOND_SCALE)
    mockCams({ status: 'missing' })

    // Act
    const { container } = render(<Today />)

    // Assert — an honest blank beats a hazardous-tier verdict built on a
    // number we just said we cannot verify.
    expect(container.querySelector('.today-answer')?.textContent ?? '').not.toContain('15868')
    expect(container.querySelector('[data-testid="trust-line"]')).toBeNull()
  })

  it('leaves a reportable GRID cell in charge — no regression for ordinary air', () => {
    // Arrange
    openOnInsightTab()
    mockGeo()
    mockWeather()
    mockGrid({ ...BEYOND_SCALE, pm25: 12, plausibility: { verdict: 'reportable', reason: '' } })
    mockCams(camsReady({ current: 20, tier: 'good' }))

    // Act
    const { container } = render(<Today />)

    // Assert — GRID is still preferred over CAMS when it is sound.
    expect(container.querySelector('.today-answer')?.textContent).toContain('12')
  })
})

/**
 * W1b commit ③ — the Conditions surfaces (the hero rail's "PM2.5 now" tile
 * and the Conditions tab's AirQualityLine) used to read Open-Meteo's own
 * hourly PM2.5 point, a third number next to the headline resolver's. They
 * now render the resolved primary reading. The numbers below are chosen so
 * no other figure on the page can be mistaken for them: the GRID analysis
 * (42.4) and the CAMS city forecast (21) sit in different tiers, and the
 * weather fixture's own numbers (23 degrees, UV 6) collide with neither.
 */
describe('Today — Conditions surfaces show the shared primary PM2.5 reading', () => {
  const HOURS = Array.from({ length: 24 }, (_, i) => `2026-09-06T${String(i).padStart(2, '0')}:00`)
  const WEATHER_READY: OpenMeteoWeatherHourly = {
    time: HOURS,
    temperature_2m: HOURS.map(() => 23),
    apparent_temperature: HOURS.map(() => 24),
    uv_index: HOURS.map(() => 6),
    weather_code: HOURS.map(() => 0),
  }
  const GRID_ANALYSIS = {
    status: 'ready' as const,
    pm25: 42.4,
    updatedAt: '2026-08-26T00:00:00Z',
    stale: false,
    distanceKm: 3,
  }

  /** The hero rail's "PM2.5 now" tile — found by its label, not by position,
   * so the UV tile beside it can never be mistaken for it. */
  function pm25NowTile(container: HTMLElement): HTMLElement | null {
    const tiles = container.querySelectorAll<HTMLElement>('.wx-hero__rail .wx-tile')
    return Array.from(tiles).find((t) => t.querySelector('.wx-tile__label')?.textContent === 'PM2.5 now') ?? null
  }

  function airQualitySection(container: HTMLElement): HTMLElement | null {
    return container.querySelector<HTMLElement>('section[aria-label="Air quality"]')
  }

  /** Integer in "{n} µg/m³ PM2.5" — the Answer meta line's and the AirQualityLine's shared phrasing. */
  function headlineNumber(text: string | null | undefined): number | null {
    const m = (text ?? '').match(/(\d+)\s*µg\/m³\s*PM2\.5/)
    return m ? Number(m[1]) : null
  }

  it('hero rail tile shows the resolved analysis PM2.5 with its own tier dot and a "model analysis" caption', () => {
    // Arrange — analysis 42.4 (usg) beats the CAMS city forecast 21 (moderate).
    mockGeo()
    mockWeather({ weather: WEATHER_READY })
    mockGrid(GRID_ANALYSIS)
    mockCams(camsReady({ current: 21, tier: 'moderate' }))
    // Act
    const { container } = render(<Today />)
    // Assert
    const tile = pm25NowTile(container)
    expect(tile?.querySelector('.wx-tile__value')?.textContent).toBe('42')
    expect(tile?.querySelector('.aqi-dot')?.getAttribute('data-tier')).toBe('usg')
    expect(tile?.querySelector('.wx-tile__sub')?.textContent).toBe('µg/m³ · model analysis')
  })

  it('air-quality line shows the same resolved number, its tier grade and where the number comes from', () => {
    // Arrange
    mockGeo()
    mockWeather({ weather: WEATHER_READY })
    mockGrid(GRID_ANALYSIS)
    mockCams(camsReady({ current: 21, tier: 'moderate' }))
    // Act
    const { container } = render(<Today />)
    // Assert
    const line = airQualitySection(container)?.querySelector('.wx-aq-line')
    expect(line?.querySelector('.wx-aq-line__value')?.textContent).toBe('42 µg/m³ PM2.5')
    expect(line?.getAttribute('data-aqi')).toBe('usg')
    expect(line?.querySelector('.wx-aq-line__grade')?.textContent).toBe('Unhealthy for sensitive groups')
    expect(line?.querySelector('.wx-aq-line__source')?.textContent).toBe('Model analysis, nearest grid cell · 3 km')
  })

  it('hero rail, air-quality line and the Insight answer all read the same PM2.5 number', () => {
    // Arrange
    mockGeo()
    mockWeather({ weather: WEATHER_READY })
    mockGrid(GRID_ANALYSIS)
    mockCams(camsReady({ current: 21, tier: 'moderate' }))
    const { container, getByRole } = render(<Today />)
    // Act — read both Conditions surfaces, then switch to Insight via the
    // segmented control and read the Answer's meta line.
    const rail = Number(pm25NowTile(container)?.querySelector('.wx-tile__value')?.textContent)
    const airQualityLine = headlineNumber(container.querySelector('.wx-aq-line__value')?.textContent)
    fireEvent.click(getByRole('button', { name: 'Insight' }))
    const insightAnswer = headlineNumber(container.querySelector('.today-answer__meta')?.textContent)
    // Assert — one number, not three (the pre-③ hero rail / line read Open-Meteo's own point).
    expect({ rail, airQualityLine, insightAnswer }).toEqual({ rail: 42, airQualityLine: 42, insightAnswer: 42 })
  })

  it('names the CAMS forecast — not a model analysis — on both surfaces when only the forecast resolved', () => {
    // Arrange — GRID absent, so the CAMS city forecast (55.6) is the headline.
    mockGeo()
    mockWeather({ weather: WEATHER_READY })
    mockGrid({ status: 'missing' })
    mockCams(camsReady({ current: 55.6, tier: 'unhealthy' }))
    // Act
    const { container } = render(<Today />)
    // Assert
    const tile = pm25NowTile(container)
    expect(tile?.querySelector('.wx-tile__value')?.textContent).toBe('56')
    expect(tile?.querySelector('.wx-tile__sub')?.textContent).toBe('µg/m³ · CAMS forecast · Seoul, KR · 1 km')
    expect(container.querySelector('.wx-aq-line__value')?.textContent).toBe('56 µg/m³ PM2.5')
    expect(container.querySelector('.wx-aq-line__source')?.textContent).toBe('CAMS forecast for Seoul, KR · 1 km')
  })

  it('never prints an unverifiable GRID cell on the hero rail or the air-quality line — the CAMS reading stands in', () => {
    // Arrange — the 15,868 µg/m³ boreal-fire cell is unreportable (see the
    // "unverifiable GRID cell" block below); CAMS carries the headline.
    mockGeo()
    mockWeather({ weather: WEATHER_READY })
    mockGrid({
      ...GRID_ANALYSIS,
      pm25: 15867.96,
      plausibility: { verdict: 'beyond-scale', reason: 'beyond the top of our reporting scale — we cannot verify this reading' },
    })
    mockCams(camsReady({ current: 20, tier: 'moderate' }))
    // Act
    const { container } = render(<Today />)
    // Assert
    expect(pm25NowTile(container)?.querySelector('.wx-tile__value')?.textContent).toBe('20')
    expect(container.querySelector('.wx-aq-line__value')?.textContent).toBe('20 µg/m³ PM2.5')
    expect(container.textContent).not.toContain('15868')
  })

  it('still shows the resolved number in the air-quality line when the weather fetch failed and the hero rail is absent', () => {
    // Arrange — `weather: null` with status 'ready' is the weather section's
    // own error state; the PM2.5 reading no longer depends on it.
    mockGeo()
    mockWeather({ weather: null })
    mockGrid(GRID_ANALYSIS)
    mockCams({ status: 'missing' })
    // Act
    const { container } = render(<Today />)
    // Assert
    expect(pm25NowTile(container)).toBeNull()
    expect(container.querySelector('.wx-aq-line__value')?.textContent).toBe('42 µg/m³ PM2.5')
  })

  it('shows "unavailable" instead of a number on both surfaces when no source resolved, even though weather is ready', () => {
    // Arrange — GRID and CAMS both absent -> the reading is 'unavailable'.
    mockGeo()
    mockWeather({ weather: WEATHER_READY })
    mockGrid({ status: 'missing' })
    mockCams({ status: 'missing' })
    // Act
    const { container } = render(<Today />)
    // Assert — the rail keeps its footprint but says why it has no number
    // (never the old "Not measured"); the line swaps to the data-state.
    const tile = pm25NowTile(container)
    expect(tile?.querySelector('.wx-tile__value')?.textContent).toBe('—')
    expect(tile?.querySelector('.wx-tile__sub')?.textContent).toBe('Unavailable')
    expect(tile?.querySelector('.aqi-dot')).toBeNull()
    const section = airQualitySection(container)
    expect(section?.querySelector('.wf-datastate-unavailable')).not.toBeNull()
    expect(section?.querySelector('.wx-aq-line')).toBeNull()
    expect(section?.textContent ?? '').not.toMatch(/\d+\s*µg\/m³/)
  })

  it('shows a loading placeholder — no number, no "unavailable" — on both surfaces while the GRID is still resolving', () => {
    // Arrange — the resolver holds the whole reading back while GRID loads,
    // even with CAMS already in (the flicker fix).
    mockGeo()
    mockWeather({ weather: WEATHER_READY })
    mockGrid({ status: 'loading' })
    mockCams(camsReady({ current: 21, tier: 'moderate' }))
    // Act
    const { container } = render(<Today />)
    // Assert
    const tile = pm25NowTile(container)
    expect(tile?.querySelector('.wx-tile__value')?.textContent).toBe('—')
    expect(tile?.querySelector('.wx-tile__sub')?.textContent).toBe('Loading…')
    const section = airQualitySection(container)
    expect(section?.querySelector('.wf-skeleton')).not.toBeNull()
    expect(section?.querySelector('.wx-aq-line')).toBeNull()
    expect(section?.querySelector('.wf-datastate')).toBeNull()
  })
})

describe('Today — freshness labels keep ticking while the tab stays open (GNET1)', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("grows the TrustLine's obs age with the wall clock instead of freezing it at mount", () => {
    // Arrange — the GRID reading was published 30 minutes before the page mounts.
    const updatedAt = '2026-08-26T00:00:00Z'
    vi.useFakeTimers()
    vi.setSystemTime(new Date(updatedAt).getTime() + 30 * 60_000)
    mockGeo()
    mockWeather()
    mockGrid({ status: 'ready', pm25: 20, updatedAt, stale: false, distanceKm: 1 })
    mockCams({ status: 'missing' })
    const { container } = render(<Today />)
    const obsAge = () => container.querySelector('[data-testid="trust-line"]')?.textContent ?? ''
    const atMount = obsAge()
    // Act — one clock tick, then the tab stays open for 89 more minutes.
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    const afterOneTick = obsAge()
    act(() => {
      vi.advanceTimersByTime(89 * 60_000)
    })
    // Assert — it moves every minute, not only on some coarser cadence.
    expect(atMount).toMatch(/obs age 30m/)
    expect(afterOneTick).toMatch(/obs age 31m/)
    expect(obsAge()).toMatch(/obs age 2\.0h/)
  })
})
