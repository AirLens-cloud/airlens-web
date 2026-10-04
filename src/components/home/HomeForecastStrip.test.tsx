/**
 * HomeForecastStrip — the "Next 24h" strip below the hero. Glass-box: the
 * head must always name the CAMS city forecast and the city it is for —
 * the hero's own headline above can be a grid analysis instead, so this
 * strip must not be read as sharing that source.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import HomeForecastStrip from './HomeForecastStrip'
import type { CapsuleSeriesPoint } from '../fluid/capsule/useCapsuleData'

afterEach(cleanup)

const NOW = new Date('2026-09-06T12:00:00Z').getTime()

function seriesPoint(hourOffset: number, p50: number): CapsuleSeriesPoint {
  return {
    time: new Date(NOW + hourOffset * 3600_000).toISOString(),
    p10: null,
    p50,
    p90: null,
  }
}

describe('HomeForecastStrip — names the CAMS city forecast and its city', () => {
  const series = Array.from({ length: 24 }, (_, i) => seriesPoint(i, 42 + i))

  it('renders a head naming "City forecast (CAMS)" and the given city', () => {
    // Arrange / Act
    const { container } = render(<HomeForecastStrip series={series} city="Busan" />)
    // Assert
    const headTag = container.querySelector('.home-strip__head .t-tag')
    expect(headTag).not.toBeNull()
    expect(headTag?.textContent).toBe('Next 24h · City forecast (CAMS) · Busan')
  })

  it('names whichever city it is given, not a fixed one', () => {
    // Arrange / Act
    const { container } = render(<HomeForecastStrip series={series} city="Riyadh" />)
    // Assert
    expect(container.querySelector('.home-strip__head .t-tag')?.textContent).toBe(
      'Next 24h · City forecast (CAMS) · Riyadh',
    )
  })

  it('exposes the same CAMS-city disclosure as the region\'s accessible name', () => {
    // Arrange / Act
    const { getByRole } = render(<HomeForecastStrip series={series} city="Busan" />)
    // Assert
    expect(getByRole('region', { name: 'Next 24 hours, PM2.5 city forecast (CAMS) for Busan' })).not.toBeNull()
  })
})
