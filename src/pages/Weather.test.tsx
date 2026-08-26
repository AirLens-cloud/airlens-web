// Smoke test: page-level render + status transitions (loading -> ready,
// unconfigured, error/no-data). Section internals (hero temp math, rail
// hour formatting, tile fail-soft captions, wind canvas) have their own
// scope by construction — this test only checks the page assembles and
// each section's three-state contract surfaces something honest.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'

vi.mock('../hooks/useGeolocation', () => ({
  useGeolocation: vi.fn(),
}))
vi.mock('../hooks/useWeatherPageData', () => ({
  useWeatherPageData: vi.fn(),
}))
vi.mock('../components/fluid/capsule/AqiCapsule', () => ({
  default: () => <div data-testid="mock-capsule" />,
}))

import { useGeolocation } from '../hooks/useGeolocation'
import { useWeatherPageData } from '../hooks/useWeatherPageData'
import Weather from './Weather'

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

function mockData(overrides: Partial<ReturnType<typeof useWeatherPageData>> = {}) {
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
})

describe('Weather page', () => {
  it('renders the shell and every section in the loading state without throwing', () => {
    // Arrange
    mockGeo()
    mockData({ status: 'loading' })
    // Act
    const { container } = render(<Weather />)
    // Assert
    expect(container.querySelector('.wx-page')).not.toBeNull()
    expect(container.querySelector('.wx-sky')).not.toBeNull()
  })

  it('renders an honest missing state per section when configured but no data resolved', () => {
    // Arrange
    mockGeo()
    mockData({ status: 'ready', configured: true, weather: null, aq: null, wind: null, mslp: null })
    // Act
    const { container } = render(<Weather />)
    // Assert — no crash, and the hero shows its own honest-missing branch
    // rather than a fabricated temperature.
    expect(container.querySelector('.wx-hero__reading')).toBeNull()
  })

  it('renders an "unavailable" state on every section when the proxy base is unconfigured', () => {
    // Arrange
    mockGeo()
    mockData({ status: 'ready', configured: false })
    // Act
    const { container, getAllByText } = render(<Weather />)
    // Assert
    expect(container.querySelector('.wx-page')).not.toBeNull()
    expect(getAllByText(/not configured|unavailable/i).length).toBeGreaterThan(0)
  })

  it('renders live readings once weather/aq data resolves', () => {
    // Arrange
    mockGeo()
    mockData({
      status: 'ready',
      configured: true,
      weather: {
        time: ['2026-01-01T00:00'],
        temperature_2m: [12],
        apparent_temperature: [10],
        weather_code: [0],
        relative_humidity_2m: [55],
        wind_speed_10m: [3.2],
        wind_direction_10m: [180],
        uv_index: [2],
        cloud_cover: [40],
        precipitation_probability: [5],
      },
      aq: { time: ['2026-01-01T00:00'], pm2_5: [12] },
    })
    // Act
    const { container, getByText } = render(<Weather />)
    // Assert
    expect(container.querySelector('.wx-hero__temp')).not.toBeNull()
    expect(getByText(/12 µg\/m³ PM2\.5/)).toBeTruthy()
  })

  it('shows the "chosen location" label after a user picks a location', () => {
    // Arrange
    mockGeo({ location: { lat: 1, lon: 1, source: 'user', label: 'Test City, TC' } })
    mockData({ status: 'ready', configured: true })
    // Act
    const { getByText } = render(<Weather />)
    // Assert
    expect(getByText('Test City, TC')).toBeTruthy()
    expect(getByText('CHOSEN LOCATION')).toBeTruthy()
  })
})
