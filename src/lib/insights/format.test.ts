import { describe, it, expect } from 'vitest'
import { formatAtt, formatCi, formatP, formatEstimatedTimestamp } from './format'

describe('formatAtt', () => {
  it('signs a positive estimate so direction is never ambiguous', () => {
    // Arrange / Act / Assert
    expect(formatAtt(1.5)).toBe('+1.50')
  })

  it('keeps a negative estimate negative', () => {
    expect(formatAtt(-0.943)).toBe('-0.94')
  })

  it('renders a missing estimate as an em dash, never as zero', () => {
    // Arrange — "no estimate" and "an effect of zero" are different facts.
    for (const missing of [null, undefined, NaN]) {
      // Act / Assert
      expect(formatAtt(missing)).toBe('—')
    }
  })
})

describe('formatCi', () => {
  it('renders both bounds of a real interval', () => {
    expect(formatCi(-2.5297, 0.6438)).toBe('-2.53 to 0.64')
  })

  it('refuses a half-open interval rather than printing one bound', () => {
    // Arrange — a single bound is not an interval and must not look like one.
    expect(formatCi(-2.5, null)).toBe('—')
    expect(formatCi(null, 0.6)).toBe('—')
  })
})

describe('formatP', () => {
  it('buckets below the conventional thresholds instead of inventing precision', () => {
    expect(formatP(0.004)).toBe('p < 0.01')
    expect(formatP(0.03)).toBe('p < 0.05')
  })

  it('prints a non-significant p-value at three decimals', () => {
    expect(formatP(0.2447)).toBe('p = 0.245')
    expect(formatP(1)).toBe('p = 1.000')
  })

  it('renders an absent p-value as an em dash', () => {
    expect(formatP(null)).toBe('—')
  })
})

describe('formatEstimatedTimestamp', () => {
  // A fixed "now" is passed explicitly rather than faked on the global clock —
  // the function is pure over its two arguments, so the test pins both.
  const NOW = Date.parse('2026-09-04T12:00:00Z')

  it('pairs the absolute date with a spelled-out relative age', () => {
    // Arrange — the raw shape a published artifact actually carries, matched
    // against the audit's own worked example ("Estimated 26 Aug 2026 · 9 days
    // ago", captured 2026-09-05T09:40 KST per
    // docs/design-reports/2026-09-05-design-audit/01-ux-audit.md).
    const iso = '2026-08-26T12:47:24.859234+00:00'
    const capturedAt = Date.parse('2026-09-05T00:40:00Z')
    // Act / Assert
    expect(formatEstimatedTimestamp(iso, capturedAt)).toBe('26 Aug 2026 · 9 days ago')
  })

  it('reads in hours inside the first day', () => {
    expect(formatEstimatedTimestamp('2026-09-04T09:00:00Z', NOW)).toBe('4 Sep 2026 · 3 hours ago')
  })

  it('reads in minutes inside the first hour, floored to at least one', () => {
    expect(formatEstimatedTimestamp('2026-09-04T11:59:50Z', NOW)).toBe('4 Sep 2026 · 1 minute ago')
  })

  it('singularises exactly one unit', () => {
    expect(formatEstimatedTimestamp('2026-09-03T12:00:00Z', NOW)).toBe('3 Sep 2026 · 1 day ago')
  })

  it('keeps only the date when the timestamp is in the future — no negative age', () => {
    // Arrange — client clock skew, not a real future publish.
    expect(formatEstimatedTimestamp('2026-09-05T00:00:00Z', NOW)).toBe('5 Sep 2026')
  })

  it('returns null for an unparseable timestamp rather than fabricating one', () => {
    expect(formatEstimatedTimestamp('not-a-date', NOW)).toBeNull()
  })
})
