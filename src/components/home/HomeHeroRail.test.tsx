/**
 * HomeHeroRail — the CAMS 24h outlook rail beside the hero headline
 * (`HomeHeroRail.tsx`'s own header comment: "always CAMS's own city forecast"
 * regardless of which source backs the headline itself, W1b commit ②).
 * Glass-box: the head and the svg's own aria-label must always say "City
 * forecast (CAMS)" and name the city it is for — never folded into the
 * headline's own analysis/forecast wording.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import HomeHeroRail from './HomeHeroRail'
import type { CapsuleDataReady, CapsuleSeriesPoint } from '../fluid/capsule/useCapsuleData'

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

function readyData(overrides: Partial<CapsuleDataReady> = {}): CapsuleDataReady {
  return {
    status: 'ready',
    city: 'Seoul',
    lat: 37.5665,
    lon: 126.978,
    countryCode: 'KR',
    current: 42,
    tier: 'moderate',
    range: null,
    p10: null,
    p90: null,
    series24h: Array.from({ length: 24 }, (_, i) => seriesPoint(i, 42 + i)),
    updatedAt: new Date(NOW).toISOString(),
    alert: 'steady',
    ...overrides,
  }
}

describe('HomeHeroRail — names the CAMS city forecast, not the headline\'s own source', () => {
  it('renders the "City forecast (CAMS) · 24h" head and an svg aria-label naming the city', () => {
    // Arrange / Act
    const { container } = render(<HomeHeroRail data={readyData({ city: 'Busan' })} reducedMotion={false} />)
    // Assert
    expect(container.querySelector('.home-hero__rail-head')?.textContent).toBe('City forecast (CAMS) · 24h')
    const svg = container.querySelector('svg.home-hero__rail-svg')
    expect(svg).not.toBeNull()
    expect(svg?.getAttribute('aria-label')).toBe('24-hour PM2.5 city forecast (CAMS) for Busan')
  })

  it('names whichever city the CAMS feed resolved to, not a fixed one', () => {
    // Arrange / Act
    const { container } = render(<HomeHeroRail data={readyData({ city: 'Riyadh' })} reducedMotion={false} />)
    // Assert
    const label = container.querySelector('svg.home-hero__rail-svg')?.getAttribute('aria-label')
    expect(label).toContain('Riyadh')
    expect(label).not.toContain('Busan')
  })

  it('keeps the same "City forecast (CAMS) · 24h" head while loading (never blank or a raw status string)', () => {
    // Arrange / Act
    const { container } = render(<HomeHeroRail data={{ status: 'loading' }} reducedMotion={false} />)
    // Assert
    expect(container.querySelector('.home-hero__rail-head')?.textContent).toBe('City forecast (CAMS) · 24h')
    expect(container.querySelector('.home-hero__rail-empty')?.textContent).toBe('Loading the city forecast…')
    expect(container.querySelector('svg.home-hero__rail-svg')).toBeNull()
  })

  it('says the CAMS city forecast is unavailable, under the same head, when the feed is missing', () => {
    // Arrange / Act — the headline can still be a grid analysis while CAMS is down.
    const { container } = render(<HomeHeroRail data={{ status: 'missing' }} reducedMotion={false} />)
    // Assert
    expect(container.querySelector('.home-hero__rail-head')?.textContent).toBe('City forecast (CAMS) · 24h')
    expect(container.querySelector('.home-hero__rail-empty')?.textContent).toBe(
      'City forecast (CAMS) unavailable this pass.',
    )
    expect(container.querySelector('svg.home-hero__rail-svg')).toBeNull()
  })
})
