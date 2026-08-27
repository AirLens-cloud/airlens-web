/**
 * PolicyLimitBars — national standards against the WHO guideline (AAA).
 *
 * These are legal limits, not measurements: the assertions here are about what
 * the chart refuses to invent when a country publishes no standard, and about
 * the reader always being told how many countries that was.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import PolicyLimitBars from './PolicyLimitBars'
import type { AnalysedCountry } from '../../hooks/useInsightsData'
import type { PolicySummaryRow } from '../../types/policy'

afterEach(cleanup)

const summary = (countryCode: string): PolicySummaryRow => ({
  countryCode,
  att: null,
  ci_low: null,
  ci_high: null,
  p_value: null,
  significant: null,
  status: 'ok',
  treatmentYear: null,
  panelSource: null,
  fitScore: null,
  hasCrossCheck: false,
})

const country = (
  countryCode: string,
  name: string,
  standard: number | null,
): AnalysedCountry => ({
  countryCode,
  name,
  flag: null,
  region: 'Asia',
  pm25AnnualStandard: standard,
  summary: summary(countryCode),
})

describe('PolicyLimitBars', () => {
  it('renders one bar per country that publishes a standard', () => {
    // Arrange
    const countries = [country('KR', 'South Korea', 15), country('JP', 'Japan', 15)]
    // Act
    const { container } = render(<PolicyLimitBars countries={countries} selectedCode="KR" />)
    // Assert
    expect(container.querySelectorAll('.ins-bar')).toHaveLength(2)
  })

  it('states each limit as a multiple of the WHO guideline', () => {
    // Arrange / Act
    render(<PolicyLimitBars countries={[country('KR', 'South Korea', 15)]} selectedCode="KR" />)
    // Assert — 15 / 5 = 3× WHO.
    expect(screen.getByText(/3.0× WHO/)).toBeTruthy()
  })

  it('pins the selected country first and marks its bar', () => {
    // Arrange — Japan is stricter, so ranking alone would put it first.
    const countries = [country('KR', 'South Korea', 15), country('JP', 'Japan', 10)]
    // Act
    const { container } = render(<PolicyLimitBars countries={countries} selectedCode="KR" />)
    // Assert
    const labels = [...container.querySelectorAll('.ins-bar-label')].map((n) => n.textContent)
    expect(labels[0]).toBe('South Korea')
    expect(container.querySelectorAll('.ins-bar--active')).toHaveLength(1)
  })

  it('counts the countries with no published standard instead of dropping them silently', () => {
    // Arrange
    const countries = [country('KR', 'South Korea', 15), country('ZZ', 'Nowhere', null)]
    // Act
    render(<PolicyLimitBars countries={countries} selectedCode="KR" />)
    // Assert
    expect(screen.getByText(/1 of these countries publish no annual standard/i)).toBeTruthy()
  })

  it('says how many rows it left off rather than truncating quietly', () => {
    // Arrange — ten countries with standards, two rows allowed.
    const countries = Array.from({ length: 10 }, (_, i) =>
      country(`C${i}`, `Country ${i}`, 10 + i),
    )
    // Act
    render(<PolicyLimitBars countries={countries} selectedCode="C0" maxRows={2} />)
    // Assert
    expect(screen.getByText(/8 further countries with a standard are not shown/i)).toBeTruthy()
  })

  it('renders an honest empty state when nobody publishes a standard', () => {
    render(<PolicyLimitBars countries={[country('ZZ', 'Nowhere', null)]} selectedCode="ZZ" />)
    expect(screen.getByText(/nothing to compare/i)).toBeTruthy()
  })

  it('separates what a country permits from what it measures', () => {
    // Arrange / Act — a limit is not an observation, and the caption says so.
    render(<PolicyLimitBars countries={[country('KR', 'South Korea', 15)]} selectedCode="KR" />)
    // Assert
    expect(screen.getByText(/not what it measures/i)).toBeTruthy()
  })
})
