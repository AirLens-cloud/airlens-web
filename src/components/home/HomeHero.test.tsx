/**
 * HomeHero — the hero's state chips against the mono-caps label budget (AAA).
 *
 * The regression this file exists to catch: a second StateChip stacking onto
 * the tier row. The hero section sits at the ≤8 mono-caps budget (DESIGN.md
 * §2); when a reading goes stale, the stale and forecast states must merge
 * into ONE chip, not render as two.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import HomeHero from './HomeHero'
import { STALE_THRESHOLD_MS } from '../../lib/config/homeBriefing'
import type { CapsuleDataState } from '../fluid/capsule/useCapsuleData'

// HomeHero calls useSpring -> useReducedMotion (reads `window.matchMedia`);
// jsdom doesn't implement it. Same stub pattern as App.test.tsx.
beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('reduced-motion'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
})

afterEach(cleanup)

const NOW = new Date('2026-09-06T12:00:00Z').getTime()

function readyData(updatedAgoMs: number): CapsuleDataState {
  return {
    status: 'ready',
    city: 'Seoul',
    lat: 37.57,
    lon: 126.98,
    countryCode: 'KR',
    current: 34,
    tier: 'moderate',
    range: null,
    p10: null,
    p90: null,
    series24h: [],
    updatedAt: new Date(NOW - updatedAgoMs).toISOString(),
    alert: 'steady',
    isPersonalized: false,
  }
}

function renderHero(updatedAgoMs: number) {
  return render(
    <HomeHero
      data={readyData(updatedAgoMs)}
      nowMs={NOW}
      requestingLocation={false}
      locationDenied={false}
      locationSource="none"
      onRequestLocation={() => {}}
      onSelectCity={() => {}}
    />,
  )
}

describe('HomeHero — state chips stay within the label budget', () => {
  it('renders exactly one chip when fresh: the forecast chip', () => {
    // Arrange / Act — updated 1h ago, well under the stale threshold.
    const { container } = renderHero(60 * 60 * 1000)
    // Assert
    const chips = container.querySelectorAll('.state-chip')
    expect(chips).toHaveLength(1)
    expect(chips[0].className).toContain('state-chip--forecast')
  })

  it('merges stale + forecast into one chip instead of stacking a second', () => {
    // Arrange / Act — updated past the stale threshold.
    const { container } = renderHero(STALE_THRESHOLD_MS + 60 * 60 * 1000)
    // Assert — one chip, stale styling, both facts and the elapsed time in it.
    const chips = container.querySelectorAll('.state-chip')
    expect(chips).toHaveLength(1)
    expect(chips[0].className).toContain('state-chip--stale')
    expect(chips[0].textContent).toMatch(/Forecast · Stale/)
    expect(chips[0].textContent).toMatch(/7h/)
  })
})
