/**
 * AirQualityLine — the Conditions tab's one-line PM2.5 readout against the
 * shared primary reading (W1b commit ③).
 *
 * The regression this file exists to catch: the line going back to its own
 * Open-Meteo hourly point (a third PM2.5 number beside the HUD's and the
 * capsule's), or dropping the source line that says which source backs the
 * number. Every assertion reads what the component renders into the DOM.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import AirQualityLine from './AirQualityLine'
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
    place: { label: 'Busan', countryCode: 'KR', distanceKm: 12.4 },
    refreshMs: CAMS_REFRESH_MS,
    dqss: { available: false, reason: 'not measured for forecast-sourced readings' },
    ...overrides,
  })
}

function renderLine(reading: PrimaryReading) {
  return render(<AirQualityLine reading={reading} />)
}

describe('AirQualityLine — loading', () => {
  it('shows a skeleton and neither a readout nor a data-state while the reading loads', () => {
    // Arrange / Act
    const { container } = renderLine({ status: 'loading' })
    // Assert
    expect(container.querySelector('.wf-skeleton')).not.toBeNull()
    expect(container.querySelector('.wx-aq-line')).toBeNull()
    expect(container.querySelector('.wf-datastate')).toBeNull()
  })
})

describe('AirQualityLine — unavailable', () => {
  it('shows an "unavailable" data-state and no number, readout or skeleton', () => {
    // Arrange / Act
    const { container } = renderLine({ status: 'unavailable' })
    // Assert
    const state = container.querySelector('.wf-datastate-unavailable')
    expect(state).not.toBeNull()
    expect(state?.getAttribute('role')).toBe('alert')
    expect(state?.textContent).toMatch(/unavailable/i)
    expect(container.querySelector('.wx-aq-line')).toBeNull()
    expect(container.querySelector('.wf-skeleton')).toBeNull()
    // No PM2.5 figure of any kind is printed in place of the missing one.
    expect(container.textContent).not.toMatch(/\d/)
  })

  it('stays a one-line inline state and names the sources it tried', () => {
    // Arrange / Act
    const { container } = renderLine({ status: 'unavailable' })
    // Assert — a literal, not the imported constant, so a wrong attribution fails here.
    expect(container.querySelector('.wf-datastate-unavailable')?.classList.contains('wf-datastate-inline')).toBe(true)
    expect(container.querySelector('.wx-aq-line__source')?.textContent).toBe(
      'Source: GEFS-Aerosols grid analysis or Open-Meteo CAMS forecast (via HF live-data)',
    )
  })
})

describe('AirQualityLine — ready analysis reading', () => {
  it('prints the rounded reading as "N µg/m³ PM2.5"', () => {
    // Arrange / Act — 17.6 rounds up to 18 (round, not floor / raw).
    const { container } = renderLine(analysisReading({ pm25: 17.6 }))
    // Assert
    expect(container.querySelector('.wx-aq-line__value')?.textContent).toBe('18 µg/m³ PM2.5')
  })

  it('rounds down below .5 ("17.4" -> 17), so the figure is not just ceil-ed', () => {
    // Arrange / Act
    const { container } = renderLine(analysisReading({ pm25: 17.4 }))
    // Assert
    expect(container.querySelector('.wx-aq-line__value')?.textContent).toBe('17 µg/m³ PM2.5')
  })

  it('discloses the source as a model analysis with the grid cell distance', () => {
    // Arrange / Act
    const { container } = renderLine(analysisReading({ place: { label: 'Seoul, KR', countryCode: null, distanceKm: 48 } }))
    // Assert
    expect(container.querySelector('.wx-aq-line__source')?.textContent).toBe(
      'Model analysis, nearest grid cell · 48 km',
    )
  })

  it('never words the model analysis as a measurement', () => {
    // Arrange / Act
    const { container } = renderLine(analysisReading())
    // Assert
    expect(container.querySelector('.wx-aq-line')?.textContent).not.toMatch(/measured/i)
  })

  it('links onward to the Globe', () => {
    // Arrange / Act
    const { container } = renderLine(analysisReading())
    // Assert
    const link = container.querySelector('.wx-aq-line__more')
    expect(link?.getAttribute('href')).toBe('/globe')
    expect(link?.textContent).toMatch(/Globe/)
  })

  it('renders neither a skeleton nor a data-state once the reading is ready', () => {
    // Arrange / Act
    const { container } = renderLine(analysisReading())
    // Assert
    expect(container.querySelector('.wf-skeleton')).toBeNull()
    expect(container.querySelector('.wf-datastate')).toBeNull()
  })
})

describe('AirQualityLine — tier drives the dot, grade and action', () => {
  it.each<[number, AqiTier, string, string]>([
    [10, 'good', 'Good', 'A great day to be outside.'],
    [20, 'moderate', 'Moderate', 'Sensitive groups should watch for symptoms.'],
    [40, 'usg', 'Unhealthy for sensitive groups', 'Sensitive groups should limit prolonged outdoor exertion.'],
    [60, 'unhealthy', 'Unhealthy', 'Consider a mask outdoors and limit exertion.'],
    [100, 'very-unhealthy', 'Very unhealthy', 'Avoid outdoor exertion — wear a mask if you go out.'],
    [200, 'hazardous', 'Hazardous', 'Stay indoors — avoid outdoor exposure.'],
  ])('pm25 %s (%s) -> data-aqi, dot, grade "%s" and its action', (pm25, tier, grade, action) => {
    // Arrange / Act
    const { container } = renderLine(analysisReading({ pm25, tier }))
    // Assert
    const line = container.querySelector('.wx-aq-line')
    expect(line?.getAttribute('data-aqi')).toBe(tier)
    expect(line?.querySelector('.aqi-dot')?.getAttribute('data-tier')).toBe(tier)
    expect(line?.querySelector('.wx-aq-line__grade')?.textContent).toBe(grade)
    expect(line?.querySelector('.wx-aq-line__action')?.textContent).toBe(action)
  })
})

describe('AirQualityLine — ready forecast reading', () => {
  it('discloses the source as a CAMS forecast for the feed city, with its country and distance', () => {
    // Arrange / Act
    const { container } = renderLine(forecastReading())
    // Assert
    const source = container.querySelector('.wx-aq-line__source')?.textContent
    expect(source?.startsWith('CAMS forecast for')).toBe(true)
    expect(source).toBe('CAMS forecast for Busan, KR · 12 km')
  })

  it('does not word the forecast as a model analysis', () => {
    // Arrange / Act
    const { container } = renderLine(forecastReading())
    // Assert
    expect(container.querySelector('.wx-aq-line__source')?.textContent).not.toMatch(/analysis/i)
  })

  it('still prints the rounded forecast number as "N µg/m³ PM2.5"', () => {
    // Arrange / Act
    const { container } = renderLine(forecastReading({ pm25: 62.2, tier: 'unhealthy' }))
    // Assert
    expect(container.querySelector('.wx-aq-line__value')?.textContent).toBe('62 µg/m³ PM2.5')
  })
})
