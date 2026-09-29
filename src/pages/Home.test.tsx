// Smoke + contract test for the Home briefing page: the ready render's 6
// hero elements, the null-range/no-band guarantee, the stale-data wording,
// the honest missing-data state, and (documenting the "no motion in this
// page" design choice) that reduced-motion has nothing to disable. Routing
// (`/` -> Home, `/probe` -> DataProbe) is covered at the App level in
// App.test.tsx, not duplicated here.
//
// W1b commit ②: the hero's headline (value/tier/nature badge/valid time/
// freshness/TrustLine/staleness) now reads the shared `usePrimaryReading`
// resolver, not `useCapsuleData` — mocked below via `mockReading`/
// `readingFixture`, alongside the pre-existing `mockData`/`readyFixture` for
// the CAMS-only 24h outlook row (HomeForecastStrip/HomeWhyNow, still gated on
// `data.status === 'ready'` and unchanged by this commit).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import Home from './Home'

vi.mock('../components/fluid/capsule/useCapsuleData', async () => {
  const actual = await vi.importActual<typeof import('../components/fluid/capsule/useCapsuleData')>(
    '../components/fluid/capsule/useCapsuleData',
  )
  return { ...actual, useCapsuleData: vi.fn() }
})

// The hero's location-source wording (MY LOCATION / a searched city /
// approximate / Seoul default) is driven by this hook's own resolved
// `location`, independently of the mocked capsule data above — mocked here
// so each test controls it directly instead of depending on the real
// (localStorage-backed) store + a real `fetch('/edge-geo')` call.
vi.mock('../hooks/useResolvedLocation', () => ({ useResolvedLocation: vi.fn() }))

// W1b commit ②: Home's own headline reads this hook, which otherwise wires
// real `useTodayGrid`/`useTodayCams` fetches — mocked so every test controls
// the resolved reading directly, the same reasoning as `useCapsuleData` above.
vi.mock('../hooks/usePrimaryReading', () => ({ usePrimaryReading: vi.fn() }))

// HomeStoriesResearch (below-the-fold, renders regardless of hero status) has
// its own fetch/state coverage in HomeStoriesResearch.test.tsx — mocked here
// only so this file's hero-focused tests don't trigger a real, unmocked
// `fetch('.../blog-data/posts.json')` call on every render.
vi.mock('../api/blog', () => ({ fetchBlogFeed: vi.fn() }))

// HomeTrustStrip (mounted right under the hero whenever `reading.status ===
// 'ready'`, `Home.tsx`) reads `useDQSSData()` — its own fetch/matching
// coverage lives in HomeTrustStrip.test.tsx. Mocked here only so this file's
// hero-focused 'ready' tests don't trigger a real, unmocked HF `fetch`
// (`useGlobeData.ts`'s `fetchDQSSData`) — this file's own header comment
// already rules that pattern out for `useCapsuleData`/`fetchBlogFeed` above.
vi.mock('../hooks/useGlobeData', async () => {
  const actual = await vi.importActual<typeof import('../hooks/useGlobeData')>('../hooks/useGlobeData')
  return { ...actual, useDQSSData: vi.fn() }
})

// Home's own analytics effect (`track('home_briefing_ready' | 'home_state_shown', ...)`)
// — mocked so the two tests below can assert on the exact event/props Home
// fires, rather than this repo's real no-op sink (`lib/analytics.ts`).
vi.mock('../lib/analytics', () => ({ track: vi.fn() }))

import { useCapsuleData, type CapsuleDataState, type CapsuleSeriesPoint } from '../components/fluid/capsule/useCapsuleData'
import { useResolvedLocation } from '../hooks/useResolvedLocation'
import { usePrimaryReading } from '../hooks/usePrimaryReading'
import { fetchBlogFeed } from '../api/blog'
import { useDQSSData } from '../hooks/useGlobeData'
import { track } from '../lib/analytics'
import type { DQSSCache } from '../types/globe'
import type { PrimaryReading, PrimaryReadingReady } from '../lib/reading/resolvePrimaryReading'
import { CAMS_REFRESH_MS } from '../lib/config/readingCadence'

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
    ...overrides,
  }
}

function mockData(state: CapsuleDataState) {
  vi.mocked(useCapsuleData).mockReturnValue(state)
}

/** Default shared-reading fixture for the hero — a forecast primary matching
 * `readyFixture()`'s own numbers (Seoul, moderate, 42 µg/m³), fresh (15m old
 * against the 6h CAMS refresh window). Individual tests override only the
 * fields their assertion cares about (`ageMs`, `dqss`, `uncertainty`, ...). */
function readingFixture(overrides: Partial<PrimaryReadingReady> = {}): PrimaryReadingReady {
  // `validTimeIso`/`updatedAtIso` are derived from `ageMs` (defaulting to 15m,
  // matching this fixture's own doc comment) rather than a fixed timestamp —
  // a hardcoded ISO string after `NOW` produced a negative age, which
  // HomeTrustStrip's "Updated" cell renders as "—" (tripped G8's `not toContain
  // '—'` assertion once this fixture's default age was pushed to 15m).
  const ageMs = overrides.ageMs ?? 15 * 60 * 1000
  const iso = new Date(NOW.getTime() - ageMs).toISOString()
  return {
    status: 'ready',
    source: 'forecast',
    pm25: 42,
    tier: 'moderate',
    stale: false,
    place: { label: 'Seoul, KR', countryCode: null, distanceKm: null },
    validTimeIso: iso,
    validTimeMs: NOW.getTime() - ageMs,
    ageMs,
    natureLabel: '[FORECAST]',
    secondary: null,
    agreement: null,
    agreeCount: 1,
    resolvedCount: 1,
    hudStatus: 'ready',
    dqss: { available: false, reason: 'not measured for forecast-sourced readings' },
    uncertainty: { available: false, reason: "this forecast doesn't publish a range" },
    refreshMs: CAMS_REFRESH_MS,
    updatedAtIso: iso,
    ...overrides,
  }
}

function mockReading(reading: PrimaryReading) {
  vi.mocked(usePrimaryReading).mockReturnValue({
    reading,
    grid: { status: 'loading' },
    cams: { status: 'loading' },
  })
}

/** Default DQSS fixture for `HomeTrustStrip` — a graded station right at
 * `readyFixture()`'s own default coordinates (Seoul), so the strip's DATA
 * QUALITY cell resolves to a real grade in every 'ready' test unless a test
 * overrides it (e.g. the withheld-branch test below). */
function dqssFixture(overrides: Partial<DQSSCache> = {}): DQSSCache {
  const stations = overrides.stations ?? [
    { station_id: 's1', lat: 37.5665, lon: 126.978, final_score: 82 },
  ]
  return {
    map: new Map(),
    stations,
    provenance: 'measured',
    partialDetail: null,
    stationCounts: { graded: stations.length, total: null, declared: false },
    ...overrides,
  }
}

function mockDQSS(cache: DQSSCache | null) {
  vi.mocked(useDQSSData).mockReturnValue(cache)
}

type ResolvedLocationResult = ReturnType<typeof useResolvedLocation>

/** Defaults to nothing resolved (no choice, no approx) — the fixed Seoul
 * default, honestly labeled. Matches `readyFixture()`'s own Seoul/KR default
 * below, since a mocked `useCapsuleData` never actually reads `location`. */
function mockResolvedLocation(overrides: Partial<ResolvedLocationResult> = {}) {
  vi.mocked(useResolvedLocation).mockReturnValue({
    location: { lat: 37.5665, lon: 126.978, label: 'Seoul, KR', source: 'default' },
    choice: null,
    approx: { status: 'failed' },
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
  mockResolvedLocation()
  mockReading(readingFixture())
  mockDQSS(dqssFixture())
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.resetAllMocks()
})

describe('Home page — ready state', () => {
  it('renders the 6 hero elements: value, unit, tier, nature badge, valid time, freshness', () => {
    // Arrange — beforeEach's default readingFixture() already covers this.
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

  it('shows explicit stale wording and a stale chip — never a muted value — when the resolver marks the reading stale', () => {
    // Arrange — staleness is `reading.stale` (the same verdict /today's HUD
    // reads), not a fixed STALE_THRESHOLD_MS and not a cadence compare.
    mockReading(readingFixture({ ageMs: 7 * 60 * 60 * 1000, stale: true, hudStatus: 'stale' }))
    mockData(readyFixture())
    // Act
    const { container } = render(<Home />)
    // Assert — the value itself stays full-ink (design-audit 2026-09-05 §1 #1:
    // opacity on the number read as "broken", not "stale"). The state moves to
    // a chip next to it instead.
    expect(container.querySelector('.home-hero--stale')).not.toBeNull()
    expect(container.querySelector('.home-hero__value--muted')).toBeNull()
    expect(container.querySelector('.state-chip--stale')?.textContent).toMatch(/Stale\s*7h/)
    expect(container.querySelector('.home-hero__meta')?.textContent).toMatch(/Stale/i)
  })

  it('does not render a stale marker when the reading is fresh', () => {
    // Arrange — beforeEach's default readingFixture() (15m old) is already fresh.
    mockData(readyFixture())
    // Act
    const { container } = render(<Home />)
    // Assert
    expect(container.querySelector('.home-hero--stale')).toBeNull()
    expect(container.querySelector('.state-chip--stale')).toBeNull()
    expect(container.querySelector('.state-chip--forecast')).not.toBeNull()
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

  it('shows the Seoul-default fallback band and both location CTAs when nothing is resolved (no choice, approx failed)', () => {
    // Arrange — mockResolvedLocation() default (Seoul, source 'default') already applies.
    mockData(readyFixture())
    // Act
    const { container, getByText, queryByText } = render(<Home />)
    // Assert — the retired worldwide "thickest air" pick never appears again.
    expect(container.querySelector('.home-hero__fallback-band')).not.toBeNull()
    expect(container.querySelector('.home-hero__fallback-band')?.textContent).toMatch(/Showing Seoul by default/)
    expect(getByText('See air quality near me')).not.toBeNull()
    expect(getByText('Search a location')).not.toBeNull()
    expect(container.querySelector('.home-hero__eyebrow')?.textContent).toMatch(/DEFAULT LOCATION — NOT YOURS/)
    expect(queryByText(/THICKEST AIR/)).toBeNull()
  })

  it('shows a plain place-label eyebrow (no "MY LOCATION" prefix) once geolocation personalizes the reading', () => {
    // Arrange — W1b commit ②: the eyebrow now reads `location.label` as-is
    // for an opt-in choice (geolocation or search) — it no longer builds a
    // "MY LOCATION · {city}, {cc}" string from `data.city`/`data.countryCode`
    // (the CAMS feed city, which HomeHero must not describe the visitor by).
    mockResolvedLocation({
      location: { lat: 48.8566, lon: 2.3522, label: 'My location, Paris', source: 'geolocation' },
      choice: { lat: 48.8566, lon: 2.3522, label: 'My location, Paris', source: 'geolocation' },
    })
    mockData(readyFixture({ city: 'Paris', countryCode: 'FR' }))
    // Act
    const { container, getByText, queryByText } = render(<Home />)
    // Assert
    expect(container.querySelector('.home-hero__fallback-band')).toBeNull()
    expect(queryByText('See air quality near me')).toBeNull()
    expect(getByText('Not you? Search again')).not.toBeNull()
    expect(container.querySelector('.home-hero__eyebrow')?.textContent).toBe('My location, Paris')
  })

  it('shows a plain "{city}, {cc}" eyebrow (not "MY LOCATION") and keeps the CTAs for a searched city', () => {
    // Arrange — a typed-in city is the visitor's own intent, but not a
    // geolocation grant, so the CTAs (still offering "near me") stay up.
    mockResolvedLocation({
      location: { lat: 48.8566, lon: 2.3522, label: 'Paris, FR', source: 'search' },
      choice: { lat: 48.8566, lon: 2.3522, label: 'Paris, FR', source: 'search' },
    })
    mockData(readyFixture({ city: 'Paris', countryCode: 'FR' }))
    // Act
    const { container, getByText, queryByText } = render(<Home />)
    // Assert
    expect(container.querySelector('.home-hero__fallback-band')).toBeNull()
    expect(getByText('See air quality near me')).not.toBeNull()
    expect(getByText('Search a location')).not.toBeNull()
    expect(queryByText('Not you? Search again')).toBeNull()
    expect(container.querySelector('.home-hero__eyebrow')?.textContent).toBe('Paris, FR')
  })

  it('shows the approximate-location eyebrow (still with location CTAs) when only approx resolved', () => {
    // Arrange — no stored choice, but the IP-approximate lookup found one.
    mockResolvedLocation({
      location: { lat: 48.8566, lon: 2.3522, label: 'Paris', source: 'approx' },
      approx: { status: 'ready', location: { lat: 48.8566, lon: 2.3522, city: 'Paris' } },
    })
    mockData(readyFixture({ city: 'Paris', countryCode: 'FR' }))
    // Act
    const { container, getByText, queryByText } = render(<Home />)
    // Assert — approximate, not a real choice: the fallback band is gone
    // (a nearby reading, not the Seoul default), but the opt-in CTAs stay up.
    expect(container.querySelector('.home-hero__fallback-band')).toBeNull()
    expect(getByText('See air quality near me')).not.toBeNull()
    expect(getByText('Search a location')).not.toBeNull()
    expect(queryByText('Not you? Search again')).toBeNull()
    expect(container.querySelector('.home-hero__eyebrow')?.textContent).toMatch(/~ Paris · APPROXIMATE \(IP-BASED\)/)
  })

  it('tells a visitor who denied permission which fallback they are looking at (Seoul default)', () => {
    // Arrange — permission denied, nothing else resolved.
    mockResolvedLocation({ denied: true })
    mockData(readyFixture())
    // Act
    const { getByText } = render(<Home />)
    // Assert
    expect(
      getByText('Location permission was not granted — showing the default location (Seoul).'),
    ).not.toBeNull()
  })

  it('names the approximate location (not the Seoul default) when permission was denied but approx resolved', () => {
    // Arrange
    mockResolvedLocation({
      denied: true,
      location: { lat: 48.8566, lon: 2.3522, label: 'Paris', source: 'approx' },
      approx: { status: 'ready', location: { lat: 48.8566, lon: 2.3522, city: 'Paris' } },
    })
    mockData(readyFixture({ city: 'Paris', countryCode: 'FR' }))
    // Act
    const { getByText, queryByText } = render(<Home />)
    // Assert
    expect(
      getByText('Location permission was not granted — showing an approximate (IP-based) location instead.'),
    ).not.toBeNull()
    expect(
      queryByText('Location permission was not granted — showing the default location (Seoul).'),
    ).toBeNull()
  })

  it('reads the resolved choice, not the approx or the CAMS feed city, for the eyebrow', () => {
    // Arrange — three different places in play: a real geolocation choice
    // ("My location, London"), a stale approx (Paris), and `data`'s own feed
    // city (London/GB, from a CAMS station that may not be the same point) —
    // the eyebrow must show only the first, verbatim (W1b commit ②: it is no
    // longer assembled from `data.city`/`data.countryCode` at all).
    mockResolvedLocation({
      location: { lat: 51.5074, lon: -0.1278, label: 'My location, London', source: 'geolocation' },
      choice: { lat: 51.5074, lon: -0.1278, label: 'My location, London', source: 'geolocation' },
      approx: { status: 'ready', location: { lat: 48.8566, lon: 2.3522, city: 'Paris' } },
    })
    mockData(readyFixture({ city: 'London', countryCode: 'GB' }))
    // Act
    const { container } = render(<Home />)
    // Assert
    expect(container.querySelector('.home-hero__eyebrow')?.textContent).toBe('My location, London')
  })

  it('renders TrustLine with DQSS withheld and p10/p90 not published for a forecast-sourced reading', () => {
    // Arrange — W1b commit ②: TrustLine's dqss/uncertainty come from
    // `reading`, not `data.p10`/`data.p90` — the `data` override here is now
    // inert for this assertion, kept only so the below-the-fold row still
    // renders consistently with the rest of this describe block.
    mockReading(
      readingFixture({
        dqss: { available: false, reason: 'not measured for forecast-sourced readings' },
        uncertainty: { available: false, reason: "this forecast doesn't publish a range" },
      }),
    )
    mockData(readyFixture({ p10: null, p90: null }))
    // Act
    const { container } = render(<Home />)
    // Assert
    const trustLine = container.querySelector('[data-testid="trust-line"]')
    expect(trustLine).not.toBeNull()
    expect(trustLine?.textContent).toMatch(/DQSS.*withheld/)
    expect(trustLine?.textContent).toMatch(/not published/)
    expect(trustLine?.textContent).toMatch(/obs age/)
    // W1b commit ②: HomeHero no longer passes TrustLine a `scopeLabel` (the
    // old "THIS FORECAST" tag, meant to disambiguate from HomeTrustStrip's
    // ground-station DQSS just below it) — Home's headline can now be either
    // source, and neither is a ground-station observation either way, so the
    // hard-coded label was dropped entirely rather than kept on one branch.
    expect(container.querySelector('.trust-line__scope')).toBeNull()
  })

  it("renders TrustLine with the reading's own p10/p90 range, not the CAMS outlook's band", () => {
    // Arrange — the two sources publish DIFFERENT bands on purpose: with the
    // same numbers on both sides, a TrustLine that read `data.p10`/`data.p90`
    // (the pre-W1b derivation) would be indistinguishable from one that reads
    // `reading.uncertainty`. TrustLine belongs to the headline `reading`;
    // `data` is only the CAMS 24h outlook.
    mockReading(readingFixture({ uncertainty: { available: true, p10: 30, p90: 55, unit: 'µg/m³' } }))
    mockData(readyFixture({ p10: 12, p90: 88 }))
    // Act
    const { container } = render(<Home />)
    // Assert
    const trustLine = container.querySelector('[data-testid="trust-line"]')
    expect(trustLine?.querySelector('[data-band-state="available"]')).not.toBeNull()
    expect(trustLine?.textContent).toMatch(/30\.0–55\.0/)
    expect(trustLine?.textContent).not.toMatch(/12\.0|88\.0/)
  })

  it('renders TrustLine as "not published" when the reading has no band, even though the CAMS outlook publishes one', () => {
    // Arrange — a grid-analysis headline publishes no p10/p90 of its own,
    // while CAMS (the outlook rail) does. Glass-box: the city forecast's band
    // must never be borrowed as the analysis number's own uncertainty.
    mockReading(
      readingFixture({
        source: 'analysis',
        natureLabel: '[ANALYSIS]',
        uncertainty: { available: false, reason: 'this data source publishes no uncertainty range' },
      }),
    )
    mockData(readyFixture({ p10: 12, p90: 88, range: { lo: 12, hi: 88 } }))
    // Act
    const { container } = render(<Home />)
    // Assert
    const trustLine = container.querySelector('[data-testid="trust-line"]')
    expect(trustLine?.querySelector('[data-band-state="unavailable"]')).not.toBeNull()
    expect(trustLine?.querySelector('[data-band-state="available"]')).toBeNull()
    expect(trustLine?.textContent).toMatch(/not published \(this data source publishes no uncertainty range\)/)
    expect(trustLine?.textContent).not.toMatch(/12\.0|88\.0/)
  })
})

describe('Home page — G8 trust strip (DQSS branch coverage)', () => {
  // HomeTrustStrip has its own full unit coverage in HomeTrustStrip.test.tsx
  // — these two just confirm Home wires `useDQSSData()` (mocked at the top
  // of this file) into it for both of the branches a reader can land on:
  // a real grade, and a withheld one. (W1b commit ②: HomeTrustStrip now
  // mounts on `reading.status === 'ready'`, not `data.status` — beforeEach's
  // default `readingFixture()` already covers that.)
  it('shows a real grade in the DATA QUALITY cell when a station is graded at the hero location', () => {
    // Arrange — beforeEach's mockDQSS(dqssFixture()) is already the graded case.
    mockData(readyFixture())
    // Act
    const { getByTestId } = render(<Home />)
    // Assert
    const strip = getByTestId('home-trust-strip')
    expect(strip.textContent).toContain('A') // dqssScoreToGrade(82) === 'A'
    expect(strip.textContent).not.toContain('—')
  })

  it('shows "—" with a reason in the DATA QUALITY cell when the DQSS feed is withheld (seed provenance)', () => {
    // Arrange
    mockData(readyFixture())
    mockDQSS(dqssFixture({ provenance: 'seed' }))
    // Act
    const { getByTestId } = render(<Home />)
    // Assert
    const strip = getByTestId('home-trust-strip')
    const qualityLink = strip.querySelector('a[href="/methodology#dqss"]')
    expect(qualityLink?.textContent).toBe('—')
    expect(qualityLink?.getAttribute('title')).toMatch(/withheld/i)
  })
})

describe('Home page — missing state', () => {
  it('shows an error banner, renders no numeric value, and does not throw', () => {
    // Arrange — W1b commit ②: the hero's own missing/error state is driven by
    // `reading.status === 'unavailable'`, not `data.status` — both mocked
    // "missing"/"unavailable" here since a real page can have either source
    // fail independently.
    mockReading({ status: 'unavailable' })
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

  it('still shows the unavailable banner and no headline number when the reading is unavailable but the CAMS outlook is ready', () => {
    // Arrange — the hero's error branch is pinned to `reading.status`. A
    // ready CAMS outlook (42 µg/m³ series) must not resurrect a headline the
    // shared resolver could not produce, nor suppress the banner.
    mockReading({ status: 'unavailable' })
    mockData(readyFixture())
    // Act
    const { container } = render(<Home />)
    // Assert
    expect(container.querySelector('.home-hero--missing .wf-datastate')).not.toBeNull()
    expect(container.querySelector('.home-hero__value')).toBeNull()
    expect(container.querySelector('[data-testid="trust-line"]')).toBeNull()
    expect(container.querySelector('[data-testid="home-trust-strip"]')).toBeNull()
  })

  it('renders the headline number, not the error banner, when the reading is ready but the CAMS outlook is missing', () => {
    // Arrange — the mirror case: a grid-analysis headline can be ready while
    // CAMS failed. The hero stays on its ready branch and the rail says, in
    // its own words, that the city forecast is unavailable.
    mockReading(readingFixture())
    mockData({ status: 'missing' })
    // Act
    const { container } = render(<Home />)
    // Assert
    expect(container.querySelector('.home-hero__value')?.textContent).toMatch(/^42/)
    expect(container.querySelector('.home-hero--missing')).toBeNull()
    expect(container.querySelector('.wf-datastate')).toBeNull()
    expect(container.querySelector('.home-hero__rail-empty')?.textContent).toBe(
      'City forecast (CAMS) unavailable this pass.',
    )
    // The outlook rows below the fold stay withheld — they gate on `data`.
    expect(container.querySelector('.home-strip')).toBeNull()
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

describe('Home page — analytics reports the resolver\'s own stale verdict, never a cadence compare', () => {
  it('reports "ready" for a reading well past its refresh cadence but not marked stale by the resolver', () => {
    // Arrange — 12h old (2x CAMS's 6h refresh cadence, the late-cron case
    // seen live) but `reading.stale` is false: a cadence compare must not
    // override the resolver's own verdict (same rule HomeHero.tsx's `isStale`
    // comment documents for the rendered chip).
    mockReading(readingFixture({ ageMs: 12 * 60 * 60 * 1000, stale: false }))
    mockData(readyFixture())
    // Act
    render(<Home />)
    // Assert
    expect(track).toHaveBeenCalledWith('home_briefing_ready', { status: 'ready', source: 'forecast' })
    expect(track).not.toHaveBeenCalledWith('home_state_shown', expect.anything())
  })

  it('reports "stale" and fires home_state_shown when the resolver marks the reading stale', () => {
    // Arrange
    mockReading(readingFixture({ stale: true }))
    mockData(readyFixture())
    // Act
    render(<Home />)
    // Assert
    expect(track).toHaveBeenCalledWith('home_state_shown', { status: 'stale' })
    expect(track).toHaveBeenCalledWith('home_briefing_ready', { status: 'stale', source: 'forecast' })
  })

  it('reports which source backed the headline, so an analysis-backed briefing is not counted as a forecast one', () => {
    // Arrange — a fresh grid-analysis primary.
    mockReading(readingFixture({ source: 'analysis', natureLabel: '[ANALYSIS]' }))
    mockData(readyFixture())
    // Act
    render(<Home />)
    // Assert
    expect(track).toHaveBeenCalledWith('home_briefing_ready', { status: 'ready', source: 'analysis' })
  })
})

describe('Home page — Globe deep links carry the visitor\'s own coordinates, not the CAMS feed city\'s', () => {
  // A visitor location (Paris) whose lat/lon differ from `readyFixture()`'s own
  // CAMS feed-city coordinates (Seoul, 37.5665/126.978) — so a link or lookup
  // built from the wrong source can never coincide with the right answer.
  const PARIS = { lat: 48.8566, lon: 2.3522, label: 'Paris, FR', source: 'search' as const }

  it('points the Act-on-it Globe link at the resolved location, not the CAMS feed city', () => {
    // Arrange
    mockResolvedLocation({ location: PARIS, choice: PARIS })
    mockData(readyFixture())
    // Act
    const { container } = render(<Home />)
    // Assert — the query string is the visitor's own point, not the Seoul feed city's.
    const globeLink = container.querySelector<HTMLAnchorElement>('.home-act-on-it__primary')
    expect(globeLink).not.toBeNull()
    expect(globeLink?.getAttribute('href')).toBe('/globe?lat=48.8566&lon=2.3522')
  })

  it('looks up the trust strip\'s nearest-station DQSS grade at the resolved location, not the CAMS feed city', () => {
    // Arrange — the only graded station sits at the visitor's own point; a
    // lookup at the Seoul feed-city coordinates would find none in range.
    mockResolvedLocation({ location: PARIS, choice: PARIS })
    mockData(readyFixture())
    mockDQSS(dqssFixture({ stations: [{ station_id: 'paris-1', lat: PARIS.lat, lon: PARIS.lon, final_score: 82 }] }))
    // Act
    const { getByTestId } = render(<Home />)
    // Assert — a real grade (not "—") whose title names the Paris station's score.
    const qualityLink = getByTestId('home-trust-strip').querySelector('a[href="/methodology#dqss"]')
    expect(qualityLink).not.toBeNull()
    expect(qualityLink?.textContent).not.toBe('—')
    expect(qualityLink?.getAttribute('title')).toMatch(/score 82\/100/)
  })

  it('falls back to a plain /globe link and a "no location" trust-strip cell while the location is still resolving', () => {
    // Arrange — `location` is null only while genuinely still resolving; the
    // CAMS feed city's coordinates must not stand in for the visitor's own.
    mockResolvedLocation({ location: null, choice: null })
    mockData(readyFixture())
    // Act
    const { container, getByTestId } = render(<Home />)
    // Assert
    expect(container.querySelector('.home-act-on-it__primary')?.getAttribute('href')).toBe('/globe')
    const qualityLink = getByTestId('home-trust-strip').querySelector('a[href="/methodology#dqss"]')
    expect(qualityLink).not.toBeNull()
    expect(qualityLink?.getAttribute('title')).toBe('No location for this reading yet')
  })
})

describe('Home page — freshness labels keep ticking while the tab stays open (GNET1)', () => {
  it('feeds the resolver and the trust strip a clock that moves, not the mount time', () => {
    // Arrange — beforeEach's readingFixture() was generated 15 minutes before NOW.
    mockData(readyFixture())
    const { getByTestId } = render(<Home />)
    const updated = () =>
      getByTestId('home-trust-strip').querySelector('.home-trust-strip__value--static')?.textContent
    const atMount = updated()
    // Act — one clock tick, then the tab stays open for the rest of the hour.
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    const afterOneTick = updated()
    const resolverNowAfterOneTick = vi.mocked(usePrimaryReading).mock.lastCall?.[1]
    act(() => {
      vi.advanceTimersByTime(59 * 60_000)
    })
    // Assert — it moves every minute, not only on some coarser cadence.
    expect(atMount).toBe('15m ago')
    expect(afterOneTick).toBe('16m ago')
    expect(resolverNowAfterOneTick).toBe(NOW.getTime() + 60_000)
    expect(updated()).toBe('1h ago')
    expect(vi.mocked(usePrimaryReading).mock.lastCall?.[1]).toBe(NOW.getTime() + 60 * 60_000)
  })
})
