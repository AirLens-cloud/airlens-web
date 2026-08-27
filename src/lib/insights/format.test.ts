import { describe, it, expect } from 'vitest'
import { formatAtt, formatCi, formatP } from './format'

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
