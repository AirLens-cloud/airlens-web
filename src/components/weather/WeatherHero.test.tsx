import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import WeatherHero from './WeatherHero'
import type { ResolvedLocation } from '../../lib/location/resolveLocation'

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
    aq: null,
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
