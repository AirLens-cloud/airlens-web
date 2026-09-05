/**
 * PolicyTrendLines — the measured spread band (AAA).
 *
 * The regression this file exists to catch: a band appearing where the feed
 * published none. The monorepo derived one by multiplying the mean; this
 * version must draw only what `p10`/`p90` actually carry, and must not bridge
 * across a year that has no spread.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import PolicyTrendLines from './PolicyTrendLines'
import type { CountryPanel, CountryPanelPoint } from '../../types/policy'

afterEach(cleanup)

const pt = (
  year: number,
  pm25: number,
  p10: number | null = null,
  p90: number | null = null,
): CountryPanelPoint => ({ year, pm25, p10, p90, stationCount: null, sources: [] })

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

function bands(container: HTMLElement): Element[] {
  return [...container.querySelectorAll('.ins-trend-band')]
}

describe('PolicyTrendLines — the spread band', () => {
  it('draws a band across the years that published one', () => {
    // Arrange
    const panels = [panel('KR', [pt(2018, 24, 12, 40), pt(2019, 22, 11, 38), pt(2020, 19, 9, 34)])]
    // Act
    const { container } = render(<PolicyTrendLines panels={panels} selectedCode="KR" />)
    // Assert
    expect(bands(container)).toHaveLength(1)
    expect(screen.getByText(/p10–p90 spread/i)).toBeTruthy()
  })

  it('draws nothing where the feed published no spread', () => {
    // Arrange — means only, which is what a single-source year looks like.
    const panels = [panel('KR', [pt(2018, 24), pt(2019, 22), pt(2020, 19)])]
    // Act
    const { container } = render(<PolicyTrendLines panels={panels} selectedCode="KR" />)
    // Assert — no band is ever derived from the mean.
    expect(bands(container)).toHaveLength(0)
    expect(screen.getByText(/no two adjacent years/i)).toBeTruthy()
    expect(screen.queryByText(/further year/i)).toBeNull()
  })

  it('treats a zero-width p10 == p90 as no spread, not as a precise one', () => {
    // Arrange — a year with one contributing station publishes p10 == p90 == mean.
    const panels = [panel('KR', [pt(2018, 24, 24, 24), pt(2019, 22, 22, 22)])]
    // Act
    const { container } = render(<PolicyTrendLines panels={panels} selectedCode="KR" />)
    // Assert
    expect(bands(container)).toHaveLength(0)
  })

  it('breaks the band rather than bridging a year that has none', () => {
    // Arrange — 2019 has no spread between two years that do.
    const panels = [
      panel('KR', [pt(2017, 26, 14, 42), pt(2018, 24, 12, 40), pt(2019, 22), pt(2020, 19, 9, 34), pt(2021, 18, 8, 32)]),
    ]
    // Act
    const { container } = render(<PolicyTrendLines panels={panels} selectedCode="KR" />)
    // Assert — two runs, not one polygon spanning the gap.
    expect(bands(container)).toHaveLength(2)
  })

  it('breaks the band across a year that is missing from the panel entirely', () => {
    // Arrange — 2019 published no usable mean, so `mapPoints` dropped it and the
    // year never appears here at all. Only a year-contiguity check catches this;
    // without one, 2018 and 2020 join into one polygon whose straight edge
    // asserts a spread across a year nobody measured.
    const panels = [
      panel('KR', [pt(2017, 26, 14, 42), pt(2018, 24, 12, 40), pt(2020, 19, 9, 34), pt(2021, 18, 8, 32)]),
    ]
    // Act
    const { container } = render(<PolicyTrendLines panels={panels} selectedCode="KR" />)
    // Assert
    expect(bands(container)).toHaveLength(2)
  })

  it('does not count a spread year that no polygon could be built from', () => {
    // Arrange — 2019 has a spread but both neighbours do not, so its run is one
    // point long and is discarded. Counting it would claim coverage the chart
    // does not show.
    const panels = [
      panel('KR', [pt(2017, 26, 14, 42), pt(2018, 24, 12, 40), pt(2019, 22, 11, 38), pt(2020, 19), pt(2021, 18, 8, 32)]),
    ]
    // Act
    const { container } = render(<PolicyTrendLines panels={panels} selectedCode="KR" />)
    // Assert — one polygon over 2017–2019; 2021's spread is stranded.
    expect(bands(container)).toHaveLength(1)
    expect(screen.getByText(/on 3 of 5 years/i)).toBeTruthy()
    expect(screen.getByText(/1 further year has a measured spread but no adjacent year/i)).toBeTruthy()
  })

  it('says a stranded spread is undrawn rather than claiming none was measured', () => {
    // Arrange — every spread year is isolated, so no band can be drawn at all.
    const panels = [panel('KR', [pt(2018, 24, 12, 40), pt(2019, 22), pt(2020, 19, 9, 34)])]
    // Act
    const { container } = render(<PolicyTrendLines panels={panels} selectedCode="KR" />)
    // Assert — "no spread was measured" would be false here.
    expect(bands(container)).toHaveLength(0)
    expect(screen.getByText(/no two adjacent years/i)).toBeTruthy()
    expect(screen.getByText(/2 further years have a measured spread/i)).toBeTruthy()
  })

  it('counts the years the band covers against the years in the series', () => {
    const panels = [panel('KR', [pt(2018, 24, 12, 40), pt(2019, 22, 11, 38), pt(2020, 19)])]
    render(<PolicyTrendLines panels={panels} selectedCode="KR" />)
    expect(screen.getByText(/on 2 of 3 years/i)).toBeTruthy()
  })

  it('names the band as spread across readings, not as uncertainty', () => {
    // Arrange — the distinction is the whole point of the caption.
    const panels = [panel('KR', [pt(2018, 24, 12, 40), pt(2019, 22, 11, 38)])]
    // Act
    render(<PolicyTrendLines panels={panels} selectedCode="KR" />)
    // Assert
    expect(screen.getByText(/not how uncertain the mean is/i)).toBeTruthy()
  })

  it('gives the band to the selected country only', () => {
    // Arrange — the peer has a published spread; the selection does not.
    const panels = [
      panel('KR', [pt(2018, 24), pt(2019, 22)]),
      panel('JP', [pt(2018, 12, 6, 20), pt(2019, 11, 5, 19)]),
    ]
    // Act
    const { container } = render(<PolicyTrendLines panels={panels} selectedCode="KR" />)
    // Assert
    expect(bands(container)).toHaveLength(0)
  })
})

// The de-overlap contract: endpoint TEXT moves to keep a minimum gap, the dot
// never does. Value texts render at labelTextY - 5, dots at the true labelY.
const LABEL_GAP = 26
const PLOT_BOTTOM = 320 - 36 // VB_H - PAD_B

function sortedYs(container: HTMLElement, selector: string, attr: string): number[] {
  return [...container.querySelectorAll(selector)]
    .map((el) => Number(el.getAttribute(attr)))
    .sort((a, b) => a - b)
}

describe('PolicyTrendLines — endpoint label de-overlap', () => {
  it('separates labels whose series end on nearly the same value', () => {
    // Arrange — four series ending 0.3 µg/m³ apart: ~5px naturally, on top of
    // each other at two 10px text lines per label.
    const panels = [
      panel('KR', [pt(2018, 13, 6, 20), pt(2019, 12.0)]),
      panel('JP', [pt(2018, 13, 6, 20), pt(2019, 12.3)]),
      panel('CN', [pt(2018, 13, 6, 20), pt(2019, 12.6)]),
      panel('DE', [pt(2018, 13, 6, 20), pt(2019, 12.9)]),
    ]
    // Act
    const { container } = render(<PolicyTrendLines panels={panels} selectedCode="KR" />)
    // Assert — the fixture really is crowded (dots closer than the gap), and
    // every adjacent pair of value labels got pushed at least a gap apart.
    const dots = sortedYs(container, '.ins-trend-dot', 'cy')
    const values = sortedYs(container, '.ins-trend-value', 'y')
    expect(values).toHaveLength(4)
    expect(dots[1] - dots[0]).toBeLessThan(LABEL_GAP)
    for (let i = 1; i < values.length; i++) {
      expect(values[i] - values[i - 1]).toBeGreaterThanOrEqual(LABEL_GAP)
    }
  })

  it('pulls a crowded run back up rather than overflowing the plot bottom', () => {
    // Arrange — four near-zero endings sit at the bottom edge; pushing down
    // alone would walk the last label off the chart.
    const panels = [
      panel('KR', [pt(2018, 2, 1, 4), pt(2019, 0.5)]),
      panel('JP', [pt(2018, 2, 1, 4), pt(2019, 0.6)]),
      panel('CN', [pt(2018, 2, 1, 4), pt(2019, 0.7)]),
      panel('DE', [pt(2018, 2, 1, 4), pt(2019, 0.8)]),
    ]
    // Act
    const { container } = render(<PolicyTrendLines panels={panels} selectedCode="KR" />)
    // Assert — gaps hold AND the lowest label group stays inside the plot.
    const values = sortedYs(container, '.ins-trend-value', 'y')
    for (let i = 1; i < values.length; i++) {
      expect(values[i] - values[i - 1]).toBeGreaterThanOrEqual(LABEL_GAP)
    }
    expect(values[values.length - 1]).toBeLessThanOrEqual(PLOT_BOTTOM)
  })

  it('leaves well-separated labels at their natural data position', () => {
    // Arrange — endings far apart; nothing should move.
    const panels = [
      panel('KR', [pt(2018, 6, 3, 10), pt(2019, 5)]),
      panel('JP', [pt(2018, 16, 8, 24), pt(2019, 15)]),
      panel('CN', [pt(2018, 26, 13, 38), pt(2019, 25)]),
      panel('DE', [pt(2018, 36, 18, 50), pt(2019, 35)]),
    ]
    // Act
    const { container } = render(<PolicyTrendLines panels={panels} selectedCode="KR" />)
    // Assert — each value text sits exactly 5px above its (unmoved) dot.
    const dots = sortedYs(container, '.ins-trend-dot', 'cy')
    const values = sortedYs(container, '.ins-trend-value', 'y')
    values.forEach((y, i) => expect(y).toBeCloseTo(dots[i] - 5, 5))
  })
})

describe('PolicyTrendLines — empty and overflow', () => {
  it('reports honestly when no country has a series', () => {
    render(<PolicyTrendLines panels={[panel('KR', [])]} selectedCode="KR" />)
    expect(screen.getByText(/No observed PM2.5 series is published/i)).toBeTruthy()
  })

  it('says how many peers it left off rather than silently truncating', () => {
    // Arrange — six panels, four series maximum.
    const panels = ['KR', 'JP', 'CN', 'IN', 'DE', 'FR'].map((cc) =>
      panel(cc, [pt(2018, 20), pt(2019, 19)]),
    )
    // Act
    render(<PolicyTrendLines panels={panels} selectedCode="KR" />)
    // Assert
    expect(screen.getByText(/2 further peer countries are not plotted/i)).toBeTruthy()
  })
})
