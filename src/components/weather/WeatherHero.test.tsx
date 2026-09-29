import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import WeatherHero from './WeatherHero'
import { GRID_REFRESH_MS } from '../../lib/config/readingCadence'
import type { ResolvedLocation } from '../../lib/location/resolveLocation'
import type { PrimaryReadingReady } from '../../lib/reading/resolvePrimaryReading'
import type { OpenMeteoWeatherHourly } from '../../types/forecast'

beforeEach(() => {
  // jsdom in this repo's vitest config has no `matchMedia` — WeatherHero
  // renders Materialize unconditionally, which calls useReducedMotion().
  // Same stub pattern as Materialize.test.tsx.
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  cleanup()
})

function baseProps() {
  return {
    requestingLocation: false,
    locationDenied: false,
    onRequestLocation: vi.fn(),
    onSelectCity: vi.fn(),
    status: 'loading' as const,
    configured: true,
    weather: null,
    reading: { status: 'loading' } as const,
    onRetry: vi.fn(),
  }
}

describe('WeatherHero location source badge', () => {
  it('shows only "Locating…" with no source badge while the location is still resolving', () => {
    // Arrange / Act — `null` = no choice yet and the IP lookup still in flight.
    // Labeling this "DEFAULT LOCATION" would call a not-yet-known place the default.
    const { container } = render(<WeatherHero location={null} {...baseProps()} />)
    // Assert
    expect(container.querySelector('.wx-hero__place-name')?.textContent).toBe('Locating…')
    expect(container.querySelector('.wx-hero__place-source')).toBeNull()
  })

  it('shows "MY LOCATION" for a geolocation fix', () => {
    // Arrange
    const location: ResolvedLocation = { lat: 37.5, lon: 127, source: 'geolocation', label: 'My location' }
    // Act
    const { container } = render(<WeatherHero location={location} {...baseProps()} />)
    // Assert
    expect(container.querySelector('.wx-hero__place-source')?.textContent).toBe('MY LOCATION')
  })

  it('shows "CHOSEN LOCATION" for a searched city', () => {
    // Arrange
    const location: ResolvedLocation = { lat: 37.5, lon: 127, source: 'search', label: 'Seoul, KR' }
    // Act
    const { container } = render(<WeatherHero location={location} {...baseProps()} />)
    // Assert
    expect(container.querySelector('.wx-hero__place-source')?.textContent).toBe('CHOSEN LOCATION')
  })

  it('shows "APPROXIMATE LOCATION" (never "DEFAULT LOCATION") for an IP-based approximate location', () => {
    // Arrange
    const location: ResolvedLocation = {
      lat: 37.26,
      lon: 127.0,
      source: 'approx',
      label: 'Suwon (approximate, IP-based)',
    }
    // Act
    const { container } = render(<WeatherHero location={location} {...baseProps()} />)
    // Assert
    const badge = container.querySelector('.wx-hero__place-source')?.textContent
    expect(badge).toBe('APPROXIMATE LOCATION')
    expect(badge).not.toMatch(/^DEFAULT LOCATION/)
  })

  it('shows "DEFAULT LOCATION · NOT YOURS" for the Seoul fallback', () => {
    // Arrange
    const location: ResolvedLocation = { lat: 37.5665, lon: 126.978, source: 'default', label: 'Seoul, KR' }
    // Act
    const { container } = render(<WeatherHero location={location} {...baseProps()} />)
    // Assert
    expect(container.querySelector('.wx-hero__place-source')?.textContent).toBe('DEFAULT LOCATION · NOT YOURS')
  })
})

/** Minimal weather payload that makes the hero's `sectionDataState` 'ready':
 * status 'ready' + configured true + a non-null `weather`. */
const READY_WEATHER: OpenMeteoWeatherHourly = {
  time: ['2026-09-29T00:00', '2026-09-29T01:00', '2026-09-29T02:00', '2026-09-29T03:00'],
  temperature_2m: [21.4, 22.1, 22.8, 23.5],
  apparent_temperature: [20.6, 21.2, 22.0, 22.9],
  weather_code: [0, 0, 1, 1],
  uv_index: [6.4, 6.9, 7.2, 7.4],
}

const READING_NOW = new Date('2026-09-29T03:00:00Z').getTime()

/** A grid-analysis reading whose pm25 (17.6) appears nowhere in READY_WEATHER,
 * so the rail tile can only show it if the `reading` prop reached the rail. */
function analysisReading(overrides: Partial<PrimaryReadingReady> = {}): PrimaryReadingReady {
  return {
    status: 'ready',
    source: 'analysis',
    pm25: 17.6,
    tier: 'moderate',
    stale: false,
    place: { label: 'Seoul, KR', countryCode: null, distanceKm: 48 },
    validTimeIso: new Date(READING_NOW).toISOString(),
    validTimeMs: READING_NOW,
    ageMs: 30 * 60 * 1000,
    natureLabel: '[ANALYSIS]',
    secondary: null,
    agreement: null,
    agreeCount: 1,
    resolvedCount: 1,
    hudStatus: 'ready',
    dqss: { available: false, reason: 'not measured for this grid cell' },
    uncertainty: { available: false, reason: 'this data source publishes no uncertainty range' },
    refreshMs: GRID_REFRESH_MS,
    updatedAtIso: new Date(READING_NOW).toISOString(),
    ...overrides,
  }
}

function readyProps(reading: PrimaryReadingReady | { status: 'loading' } | { status: 'unavailable' }) {
  return { ...baseProps(), status: 'ready' as const, weather: READY_WEATHER, reading }
}

/** The hero rail's "PM2.5 now" tile, or null when the rail did not render. */
function pm25Tile(container: HTMLElement): Element | null {
  return (
    Array.from(container.querySelectorAll('.wx-tile')).find(
      (el) => el.querySelector('.wx-tile__label')?.textContent === 'PM2.5 now',
    ) ?? null
  )
}

describe('WeatherHero — the rail\'s PM2.5 tile shows the shared primary reading', () => {
  const location: ResolvedLocation = { lat: 37.5, lon: 127, source: 'geolocation', label: 'My location' }

  it('shows the reading\'s rounded number, tier dot and source once the weather section is ready', () => {
    // Arrange / Act
    const { container } = render(<WeatherHero location={location} {...readyProps(analysisReading())} />)
    // Assert
    const tile = pm25Tile(container)
    expect(tile).not.toBeNull()
    expect(tile?.querySelector('.wx-tile__value')?.textContent).toBe('18')
    expect(tile?.querySelector('.aqi-dot')?.getAttribute('data-tier')).toBe('moderate')
    expect(tile?.querySelector('.wx-tile__sub')?.textContent).toBe('µg/m³ · model analysis')
  })

  it('follows the reading when it is unavailable: a dash and "Unavailable", not a stale number', () => {
    // Arrange / Act
    const { container } = render(<WeatherHero location={location} {...readyProps({ status: 'unavailable' })} />)
    // Assert
    const tile = pm25Tile(container)
    expect(tile?.querySelector('.wx-tile__value')?.textContent).toBe('—')
    expect(tile?.querySelector('.wx-tile__sub')?.textContent).toBe('Unavailable')
    expect(tile?.querySelector('.aqi-dot')).toBeNull()
  })

  it('renders no PM2.5 tile while the weather section is still loading, even with a ready reading', () => {
    // Arrange / Act — the rail is part of the ready band only.
    const { container } = render(
      <WeatherHero location={location} {...baseProps()} reading={analysisReading()} />,
    )
    // Assert
    expect(pm25Tile(container)).toBeNull()
  })
})
