/**
 * HomeWhyNow — left column of the below-the-fold row. Every rule it renders
 * is derived from the CAMS city-forecast 24h series, and its own caption
 * must attribute it as such (`HomeWhyNow.tsx`'s own header comment) — the
 * hero's headline above can be a grid analysis instead, so this caption must
 * not be read as describing that number.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import HomeWhyNow from './HomeWhyNow'
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

describe('HomeWhyNow — attributes its rules to the city forecast (CAMS)', () => {
  it('renders "From the city forecast (CAMS) for <city>"', () => {
    // Arrange
    const series = Array.from({ length: 24 }, (_, i) => seriesPoint(i, 42 + i))
    // Act
    const { container } = render(<HomeWhyNow series={series} city="Busan" />)
    // Assert
    expect(container.querySelector('.home-why-now__source')?.textContent).toBe(
      'From the city forecast (CAMS) for Busan',
    )
  })

  it('names a different city when given one, proving the caption is not hardcoded', () => {
    // Arrange
    const series = Array.from({ length: 24 }, (_, i) => seriesPoint(i, 42 + i))
    // Act
    const { container } = render(<HomeWhyNow series={series} city="Riyadh" />)
    // Assert
    expect(container.querySelector('.home-why-now__source')?.textContent).toBe(
      'From the city forecast (CAMS) for Riyadh',
    )
  })
})
