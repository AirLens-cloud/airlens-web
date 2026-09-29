/**
 * WeatherHeroRail — the hero's "PM2.5 now" tile against the shared primary
 * reading (W1b commit ③).
 *
 * The regression this file exists to catch: the tile going back to its own
 * Open-Meteo hourly point (a third PM2.5 number beside the HUD's and the
 * capsule's), or wording a model value as a measurement ("Not measured" /
 * "measured" — DESIGN.md §8). Every assertion reads what the rail renders into
 * the DOM, derived from the `reading` prop the way the resolver shapes it.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import WeatherHeroRail from './WeatherHeroRail'
import { CAMS_REFRESH_MS, GRID_REFRESH_MS } from '../../lib/config/readingCadence'
import type { PrimaryReading, PrimaryReadingReady } from '../../lib/reading/resolvePrimaryReading'
import type { AqiTier } from '../wireframe/AqiDot'

afterEach(cleanup)

const NOW = new Date('2026-09-29T03:00:00Z').getTime()

/** A grid-analysis reading (the resolver's preferred source), overridable. */
function analysisReading(overrides: Partial<PrimaryReadingReady> = {}): PrimaryReadingReady {
  return {
    status: 'ready',
    source: 'analysis',
    pm25: 17.6,
    tier: 'moderate',
    stale: false,
    place: { label: 'Seoul, KR', countryCode: null, distanceKm: 48 },
    validTimeIso: new Date(NOW).toISOString(),
    validTimeMs: NOW,
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
    updatedAtIso: new Date(NOW).toISOString(),
    ...overrides,
  }
}

/** A CAMS-forecast reading (the resolver's fallback source), overridable. */
function forecastReading(overrides: Partial<PrimaryReadingReady> = {}): PrimaryReadingReady {
  return analysisReading({
    source: 'forecast',
    natureLabel: '[FORECAST]',
    refreshMs: CAMS_REFRESH_MS,
    dqss: { available: false, reason: 'not measured for forecast-sourced readings' },
    ...overrides,
  })
}

function renderRail(reading: PrimaryReading) {
  const utils = render(
    <WeatherHeroRail hourlyTemp={[20, 21, 22, 23]} reading={reading} uvIndexNow={6} reducedMotion />,
  )
  const tile = Array.from(utils.container.querySelectorAll('.wx-tile')).find(
    (el) => el.querySelector('.wx-tile__label')?.textContent === 'PM2.5 now',
  )
  if (!tile) throw new Error('PM2.5 now tile did not render')
  return {
    ...utils,
    tile,
    value: tile.querySelector('.wx-tile__value')?.textContent,
    sub: tile.querySelector('.wx-tile__sub')?.textContent,
    dot: tile.querySelector('.aqi-dot'),
  }
}

describe('WeatherHeroRail — PM2.5 now tile, analysis reading', () => {
  it.each([
    [17.6, '18'],
    [17.4, '17'],
  ])('shows pm25 %s rounded to the nearest integer (%s), not the raw value', (pm25, expected) => {
    // Arrange / Act — 17.6 pins round vs floor, 17.4 pins round vs ceil.
    const { value } = renderRail(analysisReading({ pm25 }))
    // Assert
    expect(value).toBe(expected)
  })

  it.each<[number, AqiTier]>([
    [17.6, 'moderate'],
    [80, 'very-unhealthy'],
  ])('paints the AqiDot with the reading tier (pm25 %s -> %s)', (pm25, tier) => {
    // Arrange / Act
    const { dot } = renderRail(analysisReading({ pm25, tier }))
    // Assert
    expect(dot?.getAttribute('data-tier')).toBe(tier)
  })

  it('discloses the source as a model analysis under the unit', () => {
    // Arrange / Act
    const { sub } = renderRail(analysisReading())
    // Assert
    expect(sub).toBe('µg/m³ · model analysis')
  })
})

describe('WeatherHeroRail — PM2.5 now tile, forecast reading', () => {
  it('discloses the source as a CAMS forecast and names its city and distance under the unit', () => {
    // Arrange — the tile sits under the viewer's own place name, so another
    // city's forecast must say which city it is.
    const reading = forecastReading({ place: { label: 'Busan', countryCode: 'KR', distanceKm: 312.4 } })
    // Act
    const { sub } = renderRail(reading)
    // Assert
    expect(sub).toBe('µg/m³ · CAMS forecast · Busan, KR · 312 km')
  })

  it('drops the distance, not the city, when the forecast carries no distance', () => {
    // Arrange / Act
    const { sub } = renderRail(forecastReading({ place: { label: 'Busan', countryCode: null, distanceKm: null } }))
    // Assert
    expect(sub).toBe('µg/m³ · CAMS forecast · Busan')
  })

  it('shows the forecast reading number and tier dot like any ready reading', () => {
    // Arrange / Act
    const { value, dot } = renderRail(forecastReading({ pm25: 62.2, tier: 'unhealthy' }))
    // Assert
    expect(value).toBe('62')
    expect(dot?.getAttribute('data-tier')).toBe('unhealthy')
  })
})

describe('WeatherHeroRail — PM2.5 now tile, no number yet', () => {
  it('shows a dash, "Loading…" and no AqiDot while the reading is loading', () => {
    // Arrange / Act
    const { value, sub, dot } = renderRail({ status: 'loading' })
    // Assert
    expect(value).toBe('—')
    expect(sub).toBe('Loading…')
    expect(dot).toBeNull()
  })

  it('shows a dash, "Unavailable" and no AqiDot when no source resolved', () => {
    // Arrange / Act
    const { value, sub, dot } = renderRail({ status: 'unavailable' })
    // Assert
    expect(value).toBe('—')
    expect(sub).toBe('Unavailable')
    expect(dot).toBeNull()
  })
})

describe('WeatherHeroRail — a model value is never worded as measured (DESIGN.md §8)', () => {
  it.each<[string, PrimaryReading]>([
    ['analysis', analysisReading()],
    ['forecast', forecastReading()],
    ['loading', { status: 'loading' }],
    ['unavailable', { status: 'unavailable' }],
  ])('keeps "measured" out of the PM2.5 tile for a %s reading', (_state, reading) => {
    // Arrange / Act
    const { tile } = renderRail(reading)
    // Assert — the pre-③ empty state read "Not measured".
    expect(tile.textContent).not.toMatch(/measured/i)
  })
})
