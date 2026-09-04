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

// The hero's location-source wording (MY LOCATION / approximate / fallback)
// is driven by this hook's own `choice`/`approx`, independently of the
// mocked capsule data above — mocked here so each test controls it directly
// instead of depending on the real (localStorage-backed) store + a real
// `fetch('/edge-geo')` call.
vi.mock('../hooks/useLocationPersonalization', () => ({ useLocationPersonalization: vi.fn() }))

// HomeStoriesResearch (below-the-fold, renders regardless of hero status) has
// its own fetch/state coverage in HomeStoriesResearch.test.tsx — mocked here
// only so this file's hero-focused tests don't trigger a real, unmocked
// `fetch('.../blog-data/posts.json')` call on every render.
vi.mock('../api/blog', () => ({ fetchBlogFeed: vi.fn() }))

import { useCapsuleData, type CapsuleDataState, type CapsuleSeriesPoint } from '../components/fluid/capsule/useCapsuleData'
import { useLocationPersonalization } from '../hooks/useLocationPersonalization'
import { fetchBlogFeed } from '../api/blog'

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
    p10: null,
    p90: null,
    series24h: Array.from({ length: 24 }, (_, i) => seriesPoint(i, 42 + i)),
    updatedAt: NOW.toISOString(),
    alert: 'steady',
    isPersonalized: false,
    ...overrides,
  }
}

function mockData(state: CapsuleDataState) {
  vi.mocked(useCapsuleData).mockReturnValue(state)
}

type LocationPersonalizationResult = ReturnType<typeof useLocationPersonalization>

/** Defaults to the unpersonalized state (no choice, no approx) — matches
 * `readyFixture()`'s own `isPersonalized: false` default below. */
function mockLocation(overrides: Partial<LocationPersonalizationResult> = {}) {
  vi.mocked(useLocationPersonalization).mockReturnValue({
    choice: null,
    approx: null,
    requesting: false,
    denied: false,
    requestGeolocation: vi.fn(),
    selectCity: vi.fn(),
    clearChoice: vi.fn(),
    ...overrides,
  })
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
  // Never resolves — these tests assert synchronously and don't care about
  // HomeStoriesResearch's own states (covered in its own test file).
  vi.mocked(fetchBlogFeed).mockReturnValue(new Promise(() => {}))
  mockLocation()
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

  it('renders no band when only part of the series publishes p10/p90 (no fabricated edges)', () => {
    // Arrange — first 12 hours publish a range, the rest do not. Filling the
    // gap with p50 would fabricate band edges the source never published.
    mockData(
      readyFixture({ series24h: Array.from({ length: 24 }, (_, i) => seriesPoint(i, 42 + i, i < 12)) }),
    )
    // Act
    const { container } = render(<Home />)
    // Assert
    expect(container.querySelector('.home-strip__band')).toBeNull()
    expect(container.querySelector('.home-strip__no-band')?.textContent).toMatch(/No uncertainty range/)
  })

  it('renders no band when the published range collapses to lo===hi', () => {
    // Arrange — p10 === p90 === p50 everywhere: a zero-width "range" is not
    // an uncertainty band and must not render as one.
    mockData(
      readyFixture({
        series24h: Array.from({ length: 24 }, (_, i) => {
          const p = seriesPoint(i, 42 + i, true)
          return { ...p, p10: p.p50, p90: p.p50 }
        }),
      }),
    )
    // Act
    const { container } = render(<Home />)
    // Assert
    expect(container.querySelector('.home-strip__band')).toBeNull()
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

  it('renders the ACT ON IT disabled CTA as a height-matched pill with its note as a separate, described caption', () => {
    // Arrange — Wave 2C: the "Open in Lab" CTA switched to notePlacement="below"
    // so its pill shape matches the solid "Explore this atmosphere" button
    // instead of a taller two-line dashed box.
    mockData(readyFixture())
    // Act
    const { container } = render(<Home />)
    // Assert
    const primary = container.querySelector('.home-act-on-it__primary')
    const pill = container.querySelector<HTMLElement>('[data-testid="home-cta-lab"]')
    expect(primary).not.toBeNull()
    expect(pill).not.toBeNull()
    expect(pill?.classList.contains('wf-disabled-cta--pill')).toBe(true)
    // Note lives outside the button, not inside it, and is wired via aria-describedby.
    expect(pill?.querySelector('.wf-disabled-cta__note')).toBeNull()
    const describedById = pill?.getAttribute('aria-describedby')
    expect(describedById).toBeTruthy()
    // useId() ids contain `:` — bracket-attribute selector avoids CSS escaping.
    const note = container.querySelector(`[id="${describedById}"]`)
    expect(note?.textContent).toMatch(/feasibility review/i)
  })

  it('shows the fallback band and both location CTAs with no choice and no approx (thickest-air reading)', () => {
    // Arrange — mockLocation() default (choice: null, approx: null) already applies.
    mockData(readyFixture({ isPersonalized: false }))
    // Act
    const { container, getByText } = render(<Home />)
    // Assert
    expect(container.querySelector('.home-hero__fallback-band')).not.toBeNull()
    expect(getByText('See air quality near me')).not.toBeNull()
    expect(getByText('Search a location')).not.toBeNull()
    expect(container.querySelector('.home-hero__eyebrow')?.textContent).toMatch(/FALLBACK: THICKEST AIR/)
  })

  it('hides the fallback band and CTA pair once a real choice personalizes the reading', () => {
    // Arrange
    mockLocation({ choice: { lat: 48.8566, lon: 2.3522, label: 'Paris, FR', source: 'search' } })
    mockData(readyFixture({ isPersonalized: true, city: 'Paris', countryCode: 'FR' }))
    // Act
    const { container, getByText, queryByText } = render(<Home />)
    // Assert
    expect(container.querySelector('.home-hero__fallback-band')).toBeNull()
    expect(queryByText('See air quality near me')).toBeNull()
    expect(getByText('Not you? Search again')).not.toBeNull()
    expect(container.querySelector('.home-hero__eyebrow')?.textContent).toMatch(/MY LOCATION · Paris, FR/)
  })

  it('shows the approximate-location eyebrow (still with location CTAs) when only approx resolved', () => {
    // Arrange — no stored choice, but the IP-approximate lookup found one.
    mockLocation({ approx: { lat: 48.8566, lon: 2.3522, city: 'Paris' } })
    mockData(readyFixture({ isPersonalized: true, city: 'Paris', countryCode: 'FR' }))
    // Act
    const { container, getByText, queryByText } = render(<Home />)
    // Assert — approximate, not a real choice: the fallback band is gone
    // (a nearby reading, not the global worst), but the opt-in CTAs stay up.
    expect(container.querySelector('.home-hero__fallback-band')).toBeNull()
    expect(getByText('See air quality near me')).not.toBeNull()
    expect(getByText('Search a location')).not.toBeNull()
    expect(queryByText('Not you? Search again')).toBeNull()
    expect(container.querySelector('.home-hero__eyebrow')?.textContent).toMatch(/~ Paris · APPROXIMATE \(IP-BASED\)/)
  })

  it('tells a visitor who denied permission which fallback they are looking at', () => {
    // Arrange — permission denied, nothing else resolved.
    mockLocation({ denied: true })
    mockData(readyFixture({ isPersonalized: false }))
    // Act
    const { getByText } = render(<Home />)
    // Assert
    expect(getByText('Location permission was not granted — showing the global fallback.')).not.toBeNull()
  })

  it('names the approximate location (not the global fallback) when permission was denied but approx resolved', () => {
    // Arrange
    mockLocation({ denied: true, approx: { lat: 48.8566, lon: 2.3522, city: 'Paris' } })
    mockData(readyFixture({ isPersonalized: true, city: 'Paris', countryCode: 'FR' }))
    // Act
    const { getByText, queryByText } = render(<Home />)
    // Assert
    expect(
      getByText('Location permission was not granted — showing an approximate (IP-based) location instead.'),
    ).not.toBeNull()
    expect(queryByText('Location permission was not granted — showing the global fallback.')).toBeNull()
  })

  it('prefers a real choice over approx when both are present', () => {
    // Arrange
    mockLocation({
      choice: { lat: 51.5074, lon: -0.1278, label: 'London, GB', source: 'geolocation' },
      approx: { lat: 48.8566, lon: 2.3522, city: 'Paris' },
    })
    mockData(readyFixture({ isPersonalized: true, city: 'London', countryCode: 'GB' }))
    // Act
    const { container } = render(<Home />)
    // Assert
    expect(container.querySelector('.home-hero__eyebrow')?.textContent).toMatch(/MY LOCATION · London, GB/)
  })

  it('renders TrustLine with DQSS withheld and p10/p90 not published for the deterministic forecast', () => {
    // Arrange — p10/p90 null (Open-Meteo CAMS carries no band)
    mockData(readyFixture({ p10: null, p90: null }))
    // Act
    const { container } = render(<Home />)
    // Assert
    const trustLine = container.querySelector('[data-testid="trust-line"]')
    expect(trustLine).not.toBeNull()
    expect(trustLine?.textContent).toMatch(/DQSS.*withheld/)
    expect(trustLine?.textContent).toMatch(/not published/)
    expect(trustLine?.textContent).toMatch(/obs age/)
  })

  it('renders TrustLine with a real p10/p90 range when the source publishes one', () => {
    // Arrange
    mockData(readyFixture({ p10: 30, p90: 55 }))
    // Act
    const { container } = render(<Home />)
    // Assert
    const trustLine = container.querySelector('[data-testid="trust-line"]')
    expect(trustLine?.textContent).toMatch(/30\.0–55\.0/)
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
