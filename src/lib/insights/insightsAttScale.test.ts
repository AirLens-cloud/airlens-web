/**
 * insightsAttScale — pure SVG geometry for the SDID chart (AAA).
 *
 * The monorepo shipped this module without a test. It is ported verbatim, so
 * these tests are new; they pin the one property the chart's honesty rests on:
 * the shaded band covers the POST-treatment gap only. The pre-treatment gap is
 * model fit error, and shading it would present fit noise as a policy effect.
 */
import { describe, it, expect } from 'vitest'
import {
  PAD_L,
  PAD_R,
  VB_W,
  buildSdidScale,
  cleanSeries,
  effectAreaPath,
  lineFor,
  nearestSeriesYear,
  preTreatmentBand,
  yearTicks,
} from './insightsAttScale'
import type { SdidPoint } from '../../types/policy'

const series: SdidPoint[] = [
  { year: 2016, observed: 26, synthetic: 26 },
  { year: 2017, observed: 25, synthetic: 25.4 },
  { year: 2018, observed: 23, synthetic: 24.6 },
  { year: 2019, observed: 21, synthetic: 23.5 },
]

describe('cleanSeries', () => {
  it('drops a point with a non-finite value instead of plotting it at zero', () => {
    // Arrange
    const dirty: SdidPoint[] = [
      { year: 2016, observed: 26, synthetic: 26 },
      { year: 2017, observed: Number.NaN, synthetic: 25.4 },
    ]
    // Act / Assert
    expect(cleanSeries(dirty).map((p) => p.year)).toEqual([2016])
  })

  it('sorts by year without mutating the input', () => {
    // Arrange
    const unsorted = [series[3], series[0]]
    // Act
    const cleaned = cleanSeries(unsorted)
    // Assert
    expect(cleaned.map((p) => p.year)).toEqual([2016, 2019])
    expect(unsorted[0].year).toBe(2019)
  })
})

describe('buildSdidScale', () => {
  it('maps the year domain across the inner width', () => {
    // Arrange / Act
    const scale = buildSdidScale(series)
    // Assert
    expect(scale.yearMin).toBe(2016)
    expect(scale.yearMax).toBe(2019)
    expect(scale.toX(2016)).toBeCloseTo(PAD_L)
    expect(scale.toX(2019)).toBeCloseTo(VB_W - PAD_R)
  })

  it('centres a single-year series rather than dividing by a zero span', () => {
    // Arrange / Act
    const scale = buildSdidScale([series[0]])
    // Assert
    expect(Number.isFinite(scale.toX(2016))).toBe(true)
    expect(scale.toX(2016)).toBeCloseTo(PAD_L + (VB_W - PAD_L - PAD_R) / 2)
  })

  it('inverts the y axis so a higher concentration sits higher on screen', () => {
    const scale = buildSdidScale(series)
    expect(scale.toY(scale.yMax)).toBeLessThan(scale.toY(scale.yMin))
  })

  it('never opens the y domain below zero', () => {
    const scale = buildSdidScale([{ year: 2016, observed: 1, synthetic: 1 }])
    expect(scale.yMin).toBeGreaterThanOrEqual(0)
  })
})

describe('lineFor', () => {
  it('emits one move and the rest line commands for the requested key', () => {
    // Arrange
    const scale = buildSdidScale(series)
    // Act
    const d = lineFor(series, 'synthetic', scale)
    // Assert
    expect(d.startsWith('M ')).toBe(true)
    expect(d.match(/L /g)).toHaveLength(3)
  })
})

describe('effectAreaPath', () => {
  it('shades only the post-treatment span', () => {
    // Arrange
    const scale = buildSdidScale(series)
    // Act — treatment in 2018 leaves 2018 and 2019 post.
    const d = effectAreaPath(series, scale, 2018)
    // Assert — 2 post years → 1 top move + 1 top line + 2 bottom lines, closed.
    expect(d.match(/[ML] /g)).toHaveLength(4)
    expect(d.endsWith('Z')).toBe(true)
    // The 2016 x-coordinate (the left edge) must not appear: pre-treatment gap
    // is fit error, and shading it would read as a policy effect.
    expect(d).not.toContain(scale.toX(2016).toFixed(1))
  })

  it('returns nothing when the treatment year is unknown', () => {
    expect(effectAreaPath(series, buildSdidScale(series), null)).toBe('')
  })

  it('returns nothing when a single post-treatment year gives no area', () => {
    expect(effectAreaPath(series, buildSdidScale(series), 2019)).toBe('')
  })
})

describe('yearTicks', () => {
  it('covers the domain end to end', () => {
    // Arrange
    const scale = buildSdidScale(series)
    // Act
    const ticks = yearTicks(scale)
    // Assert
    expect(ticks[0]).toBe(2016)
    expect(ticks[ticks.length - 1]).toBe(2019)
  })

  it('thins a long domain to roughly the requested label count', () => {
    const long = Array.from({ length: 30 }, (_, i) => ({ year: 1990 + i, observed: 20, synthetic: 20 }))
    const ticks = yearTicks(buildSdidScale(long), 6)
    expect(ticks.length).toBeLessThanOrEqual(8)
  })

  it('returns the single year for a one-year domain', () => {
    expect(yearTicks(buildSdidScale([series[0]]))).toEqual([2016])
  })
})

describe('nearestSeriesYear', () => {
  it('snaps an external scrub year onto a year the series actually has', () => {
    // Arrange / Act / Assert — no in-between year is ever invented.
    expect(nearestSeriesYear(series, 2018.4)).toBe(2018)
    expect(nearestSeriesYear(series, 2030)).toBe(2019)
  })

  it('resolves a tie to the earlier year', () => {
    expect(nearestSeriesYear(series, 2017.5)).toBe(2017)
  })

  it('returns null for an empty series', () => {
    expect(nearestSeriesYear([], 2018)).toBeNull()
  })
})

describe('preTreatmentBand', () => {
  it('spans the model-fit window up to the treatment year', () => {
    // Arrange
    const scale = buildSdidScale(series)
    // Act
    const band = preTreatmentBand(scale, 2018)
    // Assert
    expect(band?.x).toBeCloseTo(scale.toX(2016))
    expect(band?.width).toBeCloseTo(scale.toX(2018) - scale.toX(2016))
  })

  it('returns null when treatment precedes the series', () => {
    expect(preTreatmentBand(buildSdidScale(series), 2016)).toBeNull()
    expect(preTreatmentBand(buildSdidScale(series), null)).toBeNull()
  })
})
