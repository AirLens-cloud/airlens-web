// resolvePrimaryReading — pure resolver (AAA). Pins the exact semantics
// Today.tsx used to compute inline, plus the flicker fix (grid loading holds
// the whole reading back) and the countryCode fix (never appended twice).
import { describe, it, expect } from 'vitest'
import { resolvePrimaryReading } from './resolvePrimaryReading'
import type { PrimaryReadingInput } from './resolvePrimaryReading'
import type { TodayGridState } from '../../hooks/useTodayGrid'
import type { TodayCamsState } from '../../hooks/useTodayCams'
import type { ResolvedLocation } from '../location/resolveLocation'

const NOW_MS = new Date('2026-08-26T06:00:00Z').getTime()

const LOCATION: ResolvedLocation = { lat: 37.5665, lon: 126.978, label: 'Seoul, KR', source: 'search' }

type GridReady = Extract<TodayGridState, { status: 'ready' }>
type CamsReady = Extract<TodayCamsState, { status: 'ready' }>

/** A ready GRID cell with sane defaults — spreadable per test so each only
 * names what it cares about (same pattern `Today.test.tsx`'s `camsReady` uses). */
function gridReady(overrides: Partial<GridReady> = {}): TodayGridState {
  return {
    status: 'ready',
    pm25: 20,
    updatedAt: '2026-08-26T05:00:00Z',
    stale: false,
    distanceKm: 1.2,
    ...overrides,
  }
}

function camsReady(overrides: Partial<CamsReady> = {}): TodayCamsState {
  return {
    status: 'ready',
    cityName: 'Seoul',
    countryCode: 'KR',
    distanceKm: 4.5,
    current: 22,
    tier: 'moderate',
    series24h: [{ time: '2026-08-26T06:00:00Z', p10: null, p50: 22, p90: null }],
    updatedAt: '2026-08-26T06:00:00Z',
    stale: false,
    ...overrides,
  }
}

/** The live artifact's own worst case — a cell in the thousands of µg/m³
 * over boreal fire plumes (`gridPlausibility.ts`'s header comment). */
function gridBeyondScale(overrides: Partial<GridReady> = {}): TodayGridState {
  return gridReady({
    pm25: 15867.96,
    distanceKm: 12,
    plausibility: {
      verdict: 'beyond-scale',
      reason: 'beyond the top of our reporting scale — we cannot verify this reading',
    },
    ...overrides,
  })
}

function input(overrides: Partial<PrimaryReadingInput> = {}): PrimaryReadingInput {
  return {
    grid: { status: 'missing' },
    cams: { status: 'missing' },
    location: LOCATION,
    nowMs: NOW_MS,
    ...overrides,
  }
}

describe('resolvePrimaryReading', () => {
  it('prefers a reportable GRID cell as the analysis primary when both sources resolve', () => {
    // Arrange
    const args = input({ grid: gridReady(), cams: camsReady() })
    // Act
    const reading = resolvePrimaryReading(args)
    // Assert
    if (reading.status !== 'ready') throw new Error('expected ready')
    expect(reading.source).toBe('analysis')
    expect(reading.pm25).toBe(20)
    expect(reading.natureLabel).toBe('[ANALYSIS]')
  })

  it('falls back to CAMS as the forecast primary when GRID is missing', () => {
    // Arrange
    const args = input({ grid: { status: 'missing' }, cams: camsReady() })
    // Act
    const reading = resolvePrimaryReading(args)
    // Assert
    if (reading.status !== 'ready') throw new Error('expected ready')
    expect(reading.source).toBe('forecast')
    expect(reading.pm25).toBe(22)
    expect(reading.natureLabel).toBe('[FORECAST]')
  })

  it('rejects an implausible GRID cell and falls to CAMS — the beyond-scale value never backs the reading', () => {
    // Arrange
    const args = input({ grid: gridBeyondScale(), cams: camsReady() })
    // Act
    const reading = resolvePrimaryReading(args)
    // Assert
    if (reading.status !== 'ready') throw new Error('expected ready')
    expect(reading.source).toBe('forecast')
    expect(reading.pm25).toBe(22)
    expect(reading.pm25).not.toBe(15867.96)
  })

  it('holds the whole reading at loading while GRID is loading, even when CAMS already resolved (flicker fix)', () => {
    // Arrange
    const args = input({ grid: { status: 'loading' }, cams: camsReady() })
    // Act
    const reading = resolvePrimaryReading(args)
    // Assert
    expect(reading.status).toBe('loading')
  })

  it('reports loading while the location has not resolved yet', () => {
    // Arrange
    const args = input({ location: null, grid: gridReady(), cams: camsReady() })
    // Act
    const reading = resolvePrimaryReading(args)
    // Assert
    expect(reading.status).toBe('loading')
  })

  it('reports unavailable when neither source resolves', () => {
    // Arrange
    const args = input({ grid: { status: 'missing' }, cams: { status: 'missing' } })
    // Act
    const reading = resolvePrimaryReading(args)
    // Assert
    expect(reading.status).toBe('unavailable')
  })

  it('reports loading when GRID is missing and CAMS is still loading', () => {
    // Arrange
    const args = input({ grid: { status: 'missing' }, cams: { status: 'loading' } })
    // Act
    const reading = resolvePrimaryReading(args)
    // Assert
    expect(reading.status).toBe('loading')
  })

  it('keeps a stale GRID cell as primary and reports it stale', () => {
    // Arrange
    const args = input({ grid: gridReady({ stale: true }), cams: { status: 'missing' } })
    // Act
    const reading = resolvePrimaryReading(args)
    // Assert
    if (reading.status !== 'ready') throw new Error('expected ready')
    expect(reading.source).toBe('analysis')
    expect(reading.stale).toBe(true)
    expect(reading.hudStatus).toBe('stale')
  })

  it('reports a forecast primary as stale when CAMS itself is stale', () => {
    // Arrange
    const args = input({ grid: { status: 'missing' }, cams: camsReady({ stale: true }) })
    // Act
    const reading = resolvePrimaryReading(args)
    // Assert
    if (reading.status !== 'ready') throw new Error('expected ready')
    expect(reading.source).toBe('forecast')
    expect(reading.stale).toBe(true)
    expect(reading.hudStatus).toBe('stale')
  })

  it('never mixes sources: an analysis primary never carries CAMS p10/p90, even when CAMS publishes one', () => {
    // Arrange — CAMS here has a real band, so a leak would be visible.
    const args = input({
      grid: gridReady(),
      cams: camsReady({ series24h: [{ time: '2026-08-26T06:00:00Z', p10: 18, p50: 22, p90: 26 }] }),
    })
    // Act
    const reading = resolvePrimaryReading(args)
    // Assert
    if (reading.status !== 'ready') throw new Error('expected ready')
    expect(reading.source).toBe('analysis')
    expect(reading.uncertainty).toEqual({
      available: false,
      reason: 'this data source publishes no uncertainty range',
    })
  })

  it('never mixes sources: a forecast primary never carries a GRID DQSS score', () => {
    // Arrange
    const args = input({ grid: { status: 'missing' }, cams: camsReady() })
    // Act
    const reading = resolvePrimaryReading(args)
    // Assert
    if (reading.status !== 'ready') throw new Error('expected ready')
    expect(reading.dqss).toEqual({ available: false, reason: 'not measured for forecast-sourced readings' })
  })

  it('exposes a real DQSS score for an analysis primary when the GRID cell carries one', () => {
    // Arrange
    const args = input({ grid: gridReady({ dqss: 82 }), cams: { status: 'missing' } })
    // Act
    const reading = resolvePrimaryReading(args)
    // Assert
    if (reading.status !== 'ready') throw new Error('expected ready')
    expect(reading.dqss).toEqual({ available: true, value: 82 })
  })

  it('exposes a real p10/p90 band for a forecast primary when CAMS publishes one', () => {
    // Arrange
    const args = input({
      grid: { status: 'missing' },
      cams: camsReady({ series24h: [{ time: '2026-08-26T06:00:00Z', p10: 18, p50: 22, p90: 26 }] }),
    })
    // Act
    const reading = resolvePrimaryReading(args)
    // Assert
    if (reading.status !== 'ready') throw new Error('expected ready')
    expect(reading.uncertainty).toEqual({ available: true, p10: 18, p90: 26, unit: 'µg/m³' })
  })

  it('sets a CAMS secondary line only under an analysis primary, when CAMS also resolved', () => {
    // Arrange
    const args = input({ grid: gridReady(), cams: camsReady() })
    // Act
    const reading = resolvePrimaryReading(args)
    // Assert
    if (reading.status !== 'ready') throw new Error('expected ready')
    expect(reading.secondary).toEqual({
      cityName: 'Seoul',
      countryCode: 'KR',
      distanceKm: 4.5,
      pm25: 22,
      tier: 'moderate',
      stale: false,
    })
  })

  it('has no secondary when the primary is GRID and CAMS did not resolve', () => {
    // Arrange
    const args = input({ grid: gridReady(), cams: { status: 'missing' } })
    // Act
    const reading = resolvePrimaryReading(args)
    // Assert
    if (reading.status !== 'ready') throw new Error('expected ready')
    expect(reading.secondary).toBeNull()
  })

  it('has no secondary when the primary is CAMS itself (forecast primary)', () => {
    // Arrange
    const args = input({ grid: { status: 'missing' }, cams: camsReady() })
    // Act
    const reading = resolvePrimaryReading(args)
    // Assert
    if (reading.status !== 'ready') throw new Error('expected ready')
    expect(reading.secondary).toBeNull()
  })

  it('sets countryCode to null for an analysis primary — the location label already carries it', () => {
    // Arrange — CAMS also resolves, so a leak would append "KR" a second time.
    const args = input({ grid: gridReady(), cams: camsReady() })
    // Act
    const reading = resolvePrimaryReading(args)
    // Assert
    if (reading.status !== 'ready') throw new Error('expected ready')
    expect(reading.place.countryCode).toBeNull()
    expect(reading.place.label).toBe('Seoul, KR')
  })

  it('takes countryCode from CAMS for a forecast primary', () => {
    // Arrange
    const args = input({ grid: { status: 'missing' }, cams: camsReady() })
    // Act
    const reading = resolvePrimaryReading(args)
    // Assert
    if (reading.status !== 'ready') throw new Error('expected ready')
    expect(reading.place.countryCode).toBe('KR')
    expect(reading.place.label).toBe('Seoul')
  })

  it('reports agree/resolved counts for a single resolved source (GRID only)', () => {
    // Arrange
    const args = input({ grid: gridReady(), cams: { status: 'missing' } })
    // Act
    const reading = resolvePrimaryReading(args)
    // Assert
    if (reading.status !== 'ready') throw new Error('expected ready')
    expect(reading.resolvedCount).toBe(1)
    expect(reading.agreeCount).toBe(1)
  })

  it('reports agree/resolved counts when both sources resolve and agree on tier', () => {
    // Arrange — GRID 8 and CAMS 9 are both "good" (<=15).
    const args = input({
      grid: gridReady({ pm25: 8 }),
      cams: camsReady({ current: 9, tier: 'good' }),
    })
    // Act
    const reading = resolvePrimaryReading(args)
    // Assert
    if (reading.status !== 'ready') throw new Error('expected ready')
    expect(reading.resolvedCount).toBe(2)
    expect(reading.agreeCount).toBe(2)
  })

  it('reports agree/resolved counts when both sources resolve but disagree on tier', () => {
    // Arrange — GRID 20 ("moderate") vs CAMS 60 ("unhealthy").
    const args = input({
      grid: gridReady({ pm25: 20 }),
      cams: camsReady({ current: 60, tier: 'unhealthy' }),
    })
    // Act
    const reading = resolvePrimaryReading(args)
    // Assert
    if (reading.status !== 'ready') throw new Error('expected ready')
    expect(reading.resolvedCount).toBe(2)
    expect(reading.agreeCount).toBe(1) // GRID (the primary) always agrees with itself; CAMS does not.
  })

  it('sets updatedAtIso to the GRID publish time for an analysis primary', () => {
    // Arrange
    const args = input({ grid: gridReady(), cams: camsReady() })
    // Act
    const reading = resolvePrimaryReading(args)
    // Assert
    if (reading.status !== 'ready') throw new Error('expected ready')
    expect(reading.updatedAtIso).toBe('2026-08-26T05:00:00Z')
  })

  it('sets updatedAtIso to the CAMS publish time for a forecast primary — distinct from validTimeIso', () => {
    // Arrange — CAMS's first-hour time (validTimeIso) differs from its own
    // generated_at (updatedAtIso), so a leak between the two would show here.
    const args = input({
      grid: { status: 'missing' },
      cams: camsReady({
        updatedAt: '2026-08-26T05:30:00Z',
        series24h: [{ time: '2026-08-26T06:00:00Z', p10: null, p50: 22, p90: null }],
      }),
    })
    // Act
    const reading = resolvePrimaryReading(args)
    // Assert
    if (reading.status !== 'ready') throw new Error('expected ready')
    expect(reading.updatedAtIso).toBe('2026-08-26T05:30:00Z')
    expect(reading.validTimeIso).toBe('2026-08-26T06:00:00Z')
  })

  it('excludes an unusable (beyond-scale) GRID cell from the resolved-source count', () => {
    // Arrange — GRID technically "resolved" but is not usable; only CAMS counts.
    const args = input({ grid: gridBeyondScale(), cams: camsReady() })
    // Act
    const reading = resolvePrimaryReading(args)
    // Assert
    if (reading.status !== 'ready') throw new Error('expected ready')
    expect(reading.resolvedCount).toBe(1)
  })
})
