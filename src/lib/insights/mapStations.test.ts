/**
 * mapStations — panels → map points, and what gets left out (AAA).
 *
 * Every case here is about an exclusion being counted rather than swallowed:
 * the map's honesty is that a sparse map is explained, not just sparse.
 */
import { describe, it, expect } from 'vitest'
import { buildYearStations, panelYears } from './mapStations'
import type { CountryPanel, CountryPanelPoint } from '../../types/policy'

const pt = (year: number, pm25: number, sources: string[] = ['acag_v6']): CountryPanelPoint => ({
  year,
  pm25,
  p10: null,
  p90: null,
  stationCount: null,
  sources,
})

const panel = (countryCode: string, points: CountryPanelPoint[]): CountryPanel => ({
  countryCode,
  countryName: countryCode,
  flag: null,
  points,
  sourcesUsed: [],
  totalStations: null,
  treatmentYear: null,
  policyName: null,
  generatedAt: null,
})

describe('buildYearStations', () => {
  it('places each observed country at its anchor', () => {
    // Arrange — KR and JP both have coordinates.
    const panels = [panel('KR', [pt(2020, 19.1)]), panel('JP', [pt(2020, 11.2)])]
    // Act
    const result = buildYearStations(panels, 2020)
    // Assert
    expect(result.stations).toHaveLength(2)
    expect(result.stations[0].pm25).toBe(19.1)
    expect(result.droppedNoAnchor).toEqual([])
  })

  it('reports a country with no anchor instead of placing it at zero', () => {
    // Arrange — 'ZZ' is in no coordinate table.
    const panels = [panel('KR', [pt(2020, 19.1)]), panel('ZZ', [pt(2020, 40)])]
    // Act
    const result = buildYearStations(panels, 2020)
    // Assert
    expect(result.stations).toHaveLength(1)
    expect(result.droppedNoAnchor).toEqual(['ZZ'])
  })

  it('keeps "no observation this year" separate from "no anchor"', () => {
    // Arrange — the two exclusions have different causes and different fixes.
    const panels = [panel('KR', [pt(2019, 23.4)]), panel('ZZ', [pt(2020, 40)])]
    // Act
    const result = buildYearStations(panels, 2020)
    // Assert
    expect(result.droppedNoObservation).toEqual(['KR'])
    expect(result.droppedNoAnchor).toEqual(['ZZ'])
    expect(result.stations).toEqual([])
  })

  it('treats a non-finite value as unobserved', () => {
    const result = buildYearStations([panel('KR', [pt(2020, Number.NaN)])], 2020)
    expect(result.stations).toEqual([])
    expect(result.droppedNoObservation).toEqual(['KR'])
  })

  it('collects the distinct source tags behind the plotted points', () => {
    // Arrange
    const panels = [
      panel('KR', [pt(2020, 19.1, ['acag_v6', 'openaq'])]),
      panel('JP', [pt(2020, 11.2, ['openaq', 'unknown'])]),
    ]
    // Act
    const result = buildYearStations(panels, 2020)
    // Assert — 'unknown' is not a source anyone can check, so it is not claimed.
    expect(result.sources).toEqual(['acag_v6', 'openaq'])
  })

  it('matches the country code case-insensitively against the anchor table', () => {
    const result = buildYearStations([panel('kr', [pt(2020, 19.1)])], 2020)
    expect(result.stations).toHaveLength(1)
  })
})

describe('panelYears', () => {
  it('returns every observed year across panels, ascending and deduped', () => {
    // Arrange
    const panels = [
      panel('KR', [pt(2020, 1), pt(2018, 1)]),
      panel('JP', [pt(2019, 1), pt(2020, 1)]),
    ]
    // Act / Assert
    expect(panelYears(panels)).toEqual([2018, 2019, 2020])
  })

  it('returns nothing for panels with no points', () => {
    expect(panelYears([panel('KR', [])])).toEqual([])
  })
})
