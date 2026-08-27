import { describe, it, expect } from 'vitest'
import { meanObserved, findPanelObservation } from './calculations'
import type { CountryPanel, CountryPanelPoint, SdidPoint } from '../../types/policy'

const pt = (year: number, observed: number): SdidPoint => ({
  year,
  observed,
  synthetic: 0,
})

const obs = (year: number, pm25: number): CountryPanelPoint => ({
  year,
  pm25,
  p10: null,
  p90: null,
  stationCount: null,
  sources: [],
})

describe('meanObserved', () => {
  it('averages observed PM2.5 over the years matching the predicate', () => {
    // Arrange
    const series = [pt(2018, 40), pt(2019, 30), pt(2020, 10), pt(2021, 20)]
    // Act
    const before = meanObserved(series, (y) => y < 2020)
    const after = meanObserved(series, (y) => y >= 2020)
    // Assert
    expect(before).toBe(35) // (40 + 30) / 2
    expect(after).toBe(15) // (10 + 20) / 2
  })

  it('uses observed only — never the synthetic counterfactual (Glass-box)', () => {
    // Arrange: synthetic differs from observed; result must ignore synthetic
    const series: SdidPoint[] = [
      { year: 2020, observed: 50, synthetic: 999 },
      { year: 2021, observed: 50, synthetic: 0 },
    ]
    // Act
    const mean = meanObserved(series, () => true)
    // Assert
    expect(mean).toBe(50)
  })

  it('returns null for undefined series', () => {
    expect(meanObserved(undefined, () => true)).toBeNull()
  })

  it('returns null for an empty series', () => {
    expect(meanObserved([], () => true)).toBeNull()
  })

  it('returns null when the predicate matches no year', () => {
    // Arrange
    const series = [pt(2020, 10), pt(2021, 20)]
    // Act / Assert
    expect(meanObserved(series, (y) => y < 2000)).toBeNull()
  })

  it('handles a single matching point', () => {
    expect(meanObserved([pt(2020, 17)], (y) => y === 2020)).toBe(17)
  })
})

describe('findPanelObservation', () => {
  const panel = (countryCode: string, points: Array<[number, number]>): CountryPanel => ({
    countryCode,
    countryName: countryCode,
    flag: null,
    points: points.map(([year, pm25]) => obs(year, pm25)),
    sourcesUsed: [],
    totalStations: null,
    treatmentYear: null,
    policyName: null,
    generatedAt: null,
  })

  const panels: CountryPanel[] = [
    panel('KR', [[2018, 23.4], [2020, 19.1]]),
    panel('JP', [[2018, 11.2]]),
  ]

  it('returns the observation for the matching country-year', () => {
    expect(findPanelObservation(panels, 'KR', 2018)).toBe(23.4)
    expect(findPanelObservation(panels, 'JP', 2018)).toBe(11.2)
  })

  it('matches the country code case-insensitively', () => {
    expect(findPanelObservation(panels, 'kr', 2020)).toBe(19.1)
  })

  // The Glass-box half: 2019 is a real gap in KR's panel — the publisher skips
  // years with no usable observation. Returning 0 or the nearest year would put
  // a measurement nobody took into the map's hover readout.
  it('returns null for a year the panel does not observe — never 0, never the nearest year', () => {
    expect(findPanelObservation(panels, 'KR', 2019)).toBeNull()
    expect(findPanelObservation(panels, 'JP', 2020)).toBeNull()
  })

  it('returns null for an unknown country', () => {
    expect(findPanelObservation(panels, 'ZZ', 2018)).toBeNull()
  })

  it('treats a non-finite value as unobserved', () => {
    const broken = [panel('KR', [])]
    broken[0].points.push(obs(2018, Number.NaN))
    expect(findPanelObservation(broken, 'KR', 2018)).toBeNull()
  })

  it('returns null when there are no panels at all', () => {
    expect(findPanelObservation([], 'KR', 2018)).toBeNull()
  })
})
