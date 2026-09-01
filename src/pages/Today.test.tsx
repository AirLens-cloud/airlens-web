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

  it('always renders the GOOGLE cell as an honest "not connected" void — never a source that silently agreed', () => {
    // Arrange
    mockGeo()
    mockWeather()
    mockGrid({ status: 'ready', pm25: 20, updatedAt: '2026-08-26T00:00:00Z', stale: false, distanceKm: 1 })
    mockCams({
      status: 'ready',
      cityName: 'Seoul',
      countryCode: 'KR',
      distanceKm: 1,
      current: 22,
      tier: 'good',
      series24h: [],
      updatedAt: '2026-08-26T00:00:00Z',
    })
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
    mockCams({
      status: 'ready',
      cityName: 'Seoul',
      countryCode: 'KR',
      distanceKm: 1,
      current: 22,
      tier: 'good',
      series24h: [{ time: '2026-08-26T00:00:00Z', p10: null, p50: 22, p90: null }],
      updatedAt: '2026-08-26T00:00:00Z',
    })
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
})
