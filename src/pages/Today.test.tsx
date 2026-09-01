// Page-level smoke coverage for the /today Decision surface: tab
// default/switch, the /weather->/today?tab=conditions shim's tab param, the
// tier-mapped Answer sentence, the GOOGLE cell's honest "not connected" void
// (never silently agreeing), and a partial render when one source fails
// while the other still resolves.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'

vi.mock('../hooks/useGeolocation', () => ({ useGeolocation: vi.fn() }))
vi.mock('../hooks/useWeatherPageData', () => ({ useWeatherPageData: vi.fn() }))
vi.mock('../hooks/useTodayGrid', () => ({ useTodayGrid: vi.fn() }))
vi.mock('../hooks/useTodayCams', () => ({ useTodayCams: vi.fn() }))

import { useGeolocation } from '../hooks/useGeolocation'
import { useWeatherPageData } from '../hooks/useWeatherPageData'
import { useTodayGrid } from '../hooks/useTodayGrid'
import { useTodayCams } from '../hooks/useTodayCams'
import Today from './Today'
import type { TodayGridState } from '../hooks/useTodayGrid'
import type { TodayCamsState } from '../hooks/useTodayCams'

const SEOUL = { lat: 37.5665, lon: 126.978, source: 'default' as const, label: 'Seoul (default)' }

function mockGeo(overrides: Partial<ReturnType<typeof useGeolocation>> = {}) {
  vi.mocked(useGeolocation).mockReturnValue({
    location: SEOUL,
    requesting: false,
    denied: false,
    requestLocation: vi.fn(),
    setLocation: vi.fn(),
    ...overrides,
  })
}

function mockWeather(overrides: Partial<ReturnType<typeof useWeatherPageData>> = {}) {
  vi.mocked(useWeatherPageData).mockReturnValue({
    status: 'ready',
    configured: true,
    weather: null,
    aq: null,
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
  it('renders the Decision tab by default', () => {
    // Arrange
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

  it('switches from Decision to Conditions on tab click', () => {
    // Arrange
    mockGeo()
    mockWeather()
    mockGrid({ status: 'missing' })
    mockCams({ status: 'missing' })
    const { getByText, container } = render(<Today />)
    // Act
    fireEvent.click(getByText('Conditions'))
    // Assert
    expect(container.querySelector('.today-conditions')).not.toBeNull()
    expect(container.querySelector('.today-decision')).toBeNull()
  })

  it('renders the tier-mapped Answer sentence for a moderate GRID reading', () => {
    // Arrange
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
    // Arrange
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
  })

  it('renders the distance to the primary source next to its city name when known', () => {
    // Arrange
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
    mockGeo()
    mockWeather()
    mockGrid({ status: 'ready', pm25: 8, updatedAt: '2026-08-26T00:00:00Z', stale: false, distanceKm: 1 })
    mockCams(camsReady({ current: 9, tier: 'good' }))
    // Act
    const { getByText } = render(<Today />)
    // Assert
    expect(getByText(/2\/2 sources agree on tier/)).toBeTruthy()
  })
})
