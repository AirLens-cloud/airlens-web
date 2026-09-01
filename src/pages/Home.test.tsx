// Smoke + contract test for the Home briefing page: the ready render's 6
// hero elements, the null-range/no-band guarantee, the stale-data wording,
// the honest missing-data state, and (documenting the "no motion in this
// page" design choice) that reduced-motion has nothing to disable. Routing
// (`/` -> Home, `/probe` -> DataProbe) is covered at the App level in
// App.test.tsx, not duplicated here.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import Home from './Home'

vi.mock('../components/fluid/capsule/useCapsuleData', async () => {
  const actual = await vi.importActual<typeof import('../components/fluid/capsule/useCapsuleData')>(
    '../components/fluid/capsule/useCapsuleData',
  )
  return { ...actual, useCapsuleData: vi.fn() }
})

import { useCapsuleData, type CapsuleDataState, type CapsuleSeriesPoint } from '../components/fluid/capsule/useCapsuleData'

const NOW = new Date('2026-08-26T12:00:00Z')

function seriesPoint(hourOffset: number, p50: number, band = false): CapsuleSeriesPoint {
  const t = new Date(NOW.getTime() + hourOffset * 3600_000)
  return {
    time: t.toISOString(),
    p10: band ? p50 - 5 : null,
    p50,
    p90: band ? p50 + 5 : null,
  }
}

function readyFixture(overrides: Partial<Extract<CapsuleDataState, { status: 'ready' }>> = {}): CapsuleDataState {
  return {
    status: 'ready',
    city: 'Seoul',
    lat: 37.5665,
    lon: 126.978,
    countryCode: 'KR',
    current: 42,
    tier: 'moderate',
    range: null,
    series24h: Array.from({ length: 24 }, (_, i) => seriesPoint(i, 42 + i)),
    updatedAt: NOW.toISOString(),
    alert: 'steady',
    ...overrides,
  }
}

function mockData(state: CapsuleDataState) {
  vi.mocked(useCapsuleData).mockReturnValue(state)
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('reduced-motion'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.resetAllMocks()
})

describe('Home page — ready state', () => {
  it('renders the 6 hero elements: value, unit, tier, nature badge, valid time, freshness', () => {
    // Arrange
    mockData(readyFixture())
    // Act
    const { container, getByText } = render(<Home />)
    // Assert
    expect(getByText('42')).not.toBeNull() // value
    expect(container.querySelector('.home-hero__unit')?.textContent).toBe('µg/m³') // unit
    expect(getByText('Moderate')).not.toBeNull() // tier label
    expect(getByText('Forecast')).not.toBeNull() // nature badge
    expect(container.querySelector('.home-hero__meta')?.textContent).toMatch(/Valid \d{2}:\d{2} UTC/) // valid time
    expect(container.querySelector('.home-hero__meta')?.textContent).toMatch(/Updated \d+m ago/) // freshness
  })

  it('renders no band element when the source publishes no p10/p90 (range=null)', () => {
    // Arrange — every series point has p10=p90=null (matches the live
    // deterministic feed), never a lo===hi collapse.
    mockData(readyFixture({ range: null, series24h: Array.from({ length: 24 }, (_, i) => seriesPoint(i, 42 + i)) }))
    // Act
    const { container } = render(<Home />)
    // Assert
    expect(container.querySelector('.home-strip__band')).toBeNull()
    expect(container.querySelector('.home-strip__line')).not.toBeNull()
    expect(container.querySelector('.home-strip__no-band')?.textContent).toMatch(/No uncertainty range/)
  })

  it('renders a band element when the source publishes p10/p90', () => {
    // Arrange
    mockData(readyFixture({ series24h: Array.from({ length: 24 }, (_, i) => seriesPoint(i, 42 + i, true)) }))
    // Act
    const { container } = render(<Home />)
    // Assert
    expect(container.querySelector('.home-strip__band')).not.toBeNull()
  })

  it('shows explicit stale wording and a muted value when generated_at is older than the refresh cadence', () => {
    // Arrange — 7h old, past the 6h STALE_THRESHOLD_MS
    const staleUpdatedAt = new Date(NOW.getTime() - 7 * 3600_000).toISOString()
    mockData(readyFixture({ updatedAt: staleUpdatedAt }))
    // Act
    const { container } = render(<Home />)
    // Assert
    expect(container.querySelector('.home-hero--stale')).not.toBeNull()
    expect(container.querySelector('.home-hero__value--muted')).not.toBeNull()
    expect(container.querySelector('.home-hero__meta')?.textContent).toMatch(/Stale/i)
  })

  it('does not render a stale marker when generated_at is fresh', () => {
    // Arrange
    mockData(readyFixture({ updatedAt: NOW.toISOString() }))
    // Act
    const { container } = render(<Home />)
    // Assert
    expect(container.querySelector('.home-hero--stale')).toBeNull()
    expect(container.querySelector('.home-hero__meta')?.textContent).not.toMatch(/Stale/i)
  })
})

describe('Home page — missing state', () => {
  it('shows an error banner, renders no numeric value, and does not throw', () => {
    // Arrange
    mockData({ status: 'missing' })
    // Act
    const render_ = () => render(<Home />)
    // Assert
    expect(render_).not.toThrow()
    const { container, queryByText } = render_()
    expect(container.querySelector('.wf-datastate')).not.toBeNull()
    expect(container.querySelector('.home-hero__value')).toBeNull()
    expect(queryByText('42')).toBeNull()
    // No forecast strip / below-the-fold row without ready data.
    expect(container.querySelector('.home-strip')).toBeNull()
    expect(container.querySelector('.home-below-fold')).toBeNull()
  })
})

describe('Home page — reduced motion', () => {
  it('renders without throwing under prefers-reduced-motion, and ships no inline transition/animation to disable', () => {
    // Arrange — Home has no ticking countdown or spring-driven expand
    // (unlike AqiCapsule), so there is no motion for reduced-motion to turn
    // off; this test documents that rather than asserting a no-op toggle.
    mockData(readyFixture())
    // Act
    const { container } = render(<Home />)
    // Assert
    const allNodes = container.querySelectorAll<HTMLElement>('*')
    for (const node of allNodes) {
      expect(node.style.transition).toBe('')
      expect(node.style.animation).toBe('')
    }
  })
})
