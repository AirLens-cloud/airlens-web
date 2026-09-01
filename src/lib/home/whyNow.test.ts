import { describe, it, expect } from 'vitest'
import { computePeak, computeSixHourDelta, formatElapsed, formatUtcTime } from './whyNow'
import type { CapsuleSeriesPoint } from '../../components/fluid/capsule/useCapsuleData'

function series(values: number[]): CapsuleSeriesPoint[] {
  return values.map((p50, i) => ({
    time: `2026-08-26T${String(i).padStart(2, '0')}:00:00Z`,
    p10: null,
    p50,
    p90: null,
  }))
}

describe('computeSixHourDelta', () => {
  it('returns the observed delta between hour 0 and hour 6', () => {
    // Arrange
    const s = series(Array.from({ length: 24 }, (_, i) => 20 + i))
    // Act
    const delta = computeSixHourDelta(s)
    // Assert
    expect(delta).toEqual({
      fromTime: '2026-08-26T00:00:00Z',
      toTime: '2026-08-26T06:00:00Z',
      fromValue: 20,
      toValue: 26,
      delta: 6,
    })
  })

  it('returns null when the series does not reach hour 6 — never a shorter-window delta mislabeled as 6h', () => {
    // Arrange
    const s = series([10, 12, 14])
    // Act / Assert
    expect(computeSixHourDelta(s)).toBeNull()
  })
})

describe('computePeak', () => {
  it('finds the highest p50 in the series and its time', () => {
    // Arrange
    const s = series([10, 40, 15, 8])
    // Act
    const peak = computePeak(s)
    // Assert
    expect(peak).toEqual({ time: '2026-08-26T01:00:00Z', value: 40 })
  })

  it('returns null for an empty series', () => {
    expect(computePeak([])).toBeNull()
  })
})

describe('formatUtcTime', () => {
  it('extracts HH:MM and appends a literal UTC suffix', () => {
    expect(formatUtcTime('2026-08-26T06:00:00Z')).toBe('06:00 UTC')
  })

  it('falls back to an em dash for an unparseable string', () => {
    expect(formatUtcTime('not-a-time')).toBe('—')
  })
})

describe('formatElapsed', () => {
  it('renders minutes under an hour', () => {
    expect(formatElapsed(5 * 60_000)).toBe('5m ago')
  })

  it('renders hours under 48h', () => {
    expect(formatElapsed(5 * 60 * 60_000)).toBe('5h ago')
  })

  it('renders days at 48h and beyond', () => {
    expect(formatElapsed(50 * 60 * 60_000)).toBe('2d ago')
  })

  it('never reports 0m — floors to 1m for sub-minute elapsed', () => {
    expect(formatElapsed(10_000)).toBe('1m ago')
  })
})
