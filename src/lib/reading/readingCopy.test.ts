// readingCopy — pure formatter tests (AAA). Pins the exact source-disclosure
// wording every headline surface (Home hero, the floating capsule) prints,
// and the Glass-box distinction that a CAMS secondary line under an analysis
// headline names its own staleness separately from the analysis number's
// (never silently inherited, never silently dropped).
import { describe, it, expect } from 'vitest'
import { readingSourceLine, secondaryForecastLine } from './readingCopy'
import type { PrimaryReadingReady, PrimaryReadingSecondary } from './resolvePrimaryReading'

/** A ready reading with sane defaults — spreadable per test so each only
 * names the fields it cares about (same pattern `resolvePrimaryReading.test.ts` uses). */
function readingReady(overrides: Partial<PrimaryReadingReady> = {}): PrimaryReadingReady {
  return {
    status: 'ready',
    source: 'analysis',
    pm25: 20,
    tier: 'moderate',
    stale: false,
    place: { label: 'Seoul, KR', countryCode: null, distanceKm: 1.2 },
    validTimeIso: '2026-08-26T05:00:00Z',
    validTimeMs: new Date('2026-08-26T05:00:00Z').getTime(),
    ageMs: 3_600_000,
    natureLabel: '[ANALYSIS]',
    secondary: null,
    agreement: null,
    agreeCount: 1,
    resolvedCount: 1,
    hudStatus: 'ready',
    dqss: { available: false, reason: 'not measured for this grid cell' },
    uncertainty: { available: false, reason: 'this data source publishes no uncertainty range' },
    refreshMs: 3 * 60 * 60 * 1000,
    updatedAtIso: '2026-08-26T05:00:00Z',
    ...overrides,
  }
}

function secondaryReading(overrides: Partial<PrimaryReadingSecondary> = {}): PrimaryReadingSecondary {
  return {
    cityName: 'Seoul',
    countryCode: 'KR',
    distanceKm: 12.3,
    pm25: 22.4,
    tier: 'moderate',
    stale: false,
    ...overrides,
  }
}

describe('readingSourceLine', () => {
  it('names an analysis reading "Model analysis" with the rounded grid-cell distance', () => {
    // Arrange
    const reading = readingReady({
      source: 'analysis',
      place: { label: 'Seoul, KR', countryCode: null, distanceKm: 12.3 },
    })
    // Act
    const line = readingSourceLine(reading)
    // Assert
    expect(line).toBe('Model analysis, nearest grid cell · 12 km')
  })

  it('omits the distance suffix for an analysis reading whose place carries no distance', () => {
    // Arrange
    const reading = readingReady({
      source: 'analysis',
      place: { label: 'Seoul, KR', countryCode: null, distanceKm: null },
    })
    // Act
    const line = readingSourceLine(reading)
    // Assert
    expect(line).toBe('Model analysis, nearest grid cell')
  })

  it('names a forecast reading "CAMS forecast for" the city, its country code and the rounded distance', () => {
    // Arrange
    const reading = readingReady({
      source: 'forecast',
      place: { label: 'Seoul', countryCode: 'KR', distanceKm: 4.5 },
    })
    // Act
    const line = readingSourceLine(reading)
    // Assert
    expect(line).toBe('CAMS forecast for Seoul, KR · 5 km')
  })

  it('omits the country code for a forecast reading whose place carries none, while still showing the distance', () => {
    // Arrange
    const reading = readingReady({
      source: 'forecast',
      place: { label: 'Busan', countryCode: null, distanceKm: 7.8 },
    })
    // Act
    const line = readingSourceLine(reading)
    // Assert
    expect(line).toBe('CAMS forecast for Busan · 8 km')
  })
})

describe('secondaryForecastLine', () => {
  it('renders the CAMS city, country, rounded distance and rounded pm25', () => {
    // Arrange
    const sec = secondaryReading({ distanceKm: 12.3, pm25: 22.4 })
    // Act
    const line = secondaryForecastLine(sec)
    // Assert
    expect(line).toBe('City forecast (CAMS) · Seoul, KR · 12 km · 22 µg/m³')
  })

  it('appends "· stale" when the secondary is explicitly stale', () => {
    // Arrange
    const sec = secondaryReading({ stale: true })
    // Act
    const line = secondaryForecastLine(sec)
    // Assert
    expect(line).toBe('City forecast (CAMS) · Seoul, KR · 12 km · 22 µg/m³ · stale')
  })

  it('does not append "· stale" when the secondary is explicitly fresh', () => {
    // Arrange
    const sec = secondaryReading({ stale: false })
    // Act
    const line = secondaryForecastLine(sec)
    // Assert
    expect(line).toBe('City forecast (CAMS) · Seoul, KR · 12 km · 22 µg/m³')
    expect(line).not.toContain('stale')
  })

  it('does not append "· stale" when staleness could not be determined (null)', () => {
    // Arrange
    const sec = secondaryReading({ stale: null })
    // Act
    const line = secondaryForecastLine(sec)
    // Assert
    expect(line).toBe('City forecast (CAMS) · Seoul, KR · 12 km · 22 µg/m³')
    expect(line).not.toContain('stale')
  })
})
