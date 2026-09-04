import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import WeatherHero from './WeatherHero'
import type { GeoLocationState } from '../../hooks/useGeolocation'

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
    onRetry: vi.fn(),
  }
}

describe('WeatherHero location source badge', () => {
  it('shows "CHOSEN LOCATION" for a user-picked location', () => {
    // Arrange
    const location: GeoLocationState = { lat: 37.5, lon: 127, source: 'user', label: 'Seoul' }
    // Act
    const { container } = render(<WeatherHero location={location} {...baseProps()} />)
    // Assert
    expect(container.querySelector('.wx-hero__place-source')?.textContent).toBe('CHOSEN LOCATION')
  })

  it('shows "APPROXIMATE LOCATION" (never "DEFAULT LOCATION") for an IP-based approximate location', () => {
    // Arrange
    const location: GeoLocationState = {
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
    expect(badge).not.toBe('DEFAULT LOCATION')
  })

  it('shows "DEFAULT LOCATION" for the Seoul fallback', () => {
    // Arrange
    const location: GeoLocationState = { lat: 37.5665, lon: 126.978, source: 'default', label: 'Seoul (default)' }
    // Act
    const { container } = render(<WeatherHero location={location} {...baseProps()} />)
    // Assert
    expect(container.querySelector('.wx-hero__place-source')?.textContent).toBe('DEFAULT LOCATION')
  })
})
