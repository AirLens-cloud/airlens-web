/**
 * HomeHero — the hero's state chips against the mono-caps label budget (AAA).
 *
 * The regression this file exists to catch: a second StateChip stacking onto
 * the tier row. The hero section sits at the ≤8 mono-caps budget (DESIGN.md
 * §2); when a reading goes stale, the stale and forecast states must merge
 * into ONE chip, not render as two.
 *
 * W1b commit ②: HomeHero's driver is now the shared `reading` (same resolver
 * `/today` and the capsule read), not a `CapsuleDataState` — these fixtures
 * build a `PrimaryReadingReady` directly instead of a CAMS-shaped `data`
 * object. The resolver's own `reading.stale` (not a fixed `STALE_THRESHOLD_MS`,
 * and not `ageMs > refreshMs`) now decides staleness — see `HomeHero.tsx`'s
 * `isStale` comment for why the cadence comparison was rejected.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import HomeHero from './HomeHero'
import { CAMS_REFRESH_MS, GRID_REFRESH_MS } from '../../lib/config/readingCadence'
import type { PrimaryReadingReady } from '../../lib/reading/resolvePrimaryReading'
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

/** A forecast-sourced reading, `ageMs` old — mirrors the pre-W1b `readyData`
 * fixture (Seoul, moderate, 34 µg/m³) but shaped as the shared resolver's
 * `PrimaryReadingReady` instead of `CapsuleDataState`. */
function readyReading(ageMs: number, stale: boolean): PrimaryReadingReady {
  return {
    status: 'ready',
    source: 'forecast',
    pm25: 34,
    tier: 'moderate',
    stale,
    place: { label: 'Seoul, KR', countryCode: null, distanceKm: null },
    validTimeIso: new Date(NOW - ageMs).toISOString(),
    validTimeMs: NOW - ageMs,
    ageMs,
    natureLabel: '[FORECAST]',
    secondary: null,
    agreement: null,
    agreeCount: 1,
    resolvedCount: 1,
    hudStatus: stale ? 'stale' : 'ready',
    dqss: { available: false, reason: 'not measured for forecast-sourced readings' },
    uncertainty: { available: false, reason: "this forecast doesn't publish a range" },
    refreshMs: CAMS_REFRESH_MS,
    updatedAtIso: new Date(NOW - ageMs).toISOString(),
  }
}

/** `HomeHeroRail`'s own data source — unrelated to the chip assertions this
 * file makes, so a `'missing'` placeholder keeps every fixture minimal. */
const RAIL_DATA: CapsuleDataState = { status: 'missing' }

function renderHero(ageMs: number, stale: boolean) {
  return render(
    <HomeHero
      reading={readyReading(ageMs, stale)}
      data={RAIL_DATA}
      requestingLocation={false}
      locationDenied={false}
      placeLabel="Seoul, KR"
      locationSource="default"
      onRequestLocation={() => {}}
      onSelectCity={() => {}}
    />,
  )
}

describe('HomeHero — state chips stay within the label budget', () => {
  it('renders exactly one chip when fresh: the forecast chip', () => {
    // Arrange / Act — 1h old, resolver says fresh.
    const { container } = renderHero(60 * 60 * 1000, false)
    // Assert
    const chips = container.querySelectorAll('.state-chip')
    expect(chips).toHaveLength(1)
    expect(chips[0].className).toContain('state-chip--forecast')
  })

  it('stays fresh past the refresh cadence when the resolver says fresh', () => {
    // Arrange / Act — 12h old (2x the 6h cadence, the late-cron case seen
    // live) but `reading.stale` is false: cadence must not decide staleness.
    const { container } = renderHero(12 * 60 * 60 * 1000, false)
    // Assert
    const chips = container.querySelectorAll('.state-chip')
    expect(chips).toHaveLength(1)
    expect(chips[0].className).toContain('state-chip--forecast')
    expect(container.querySelector('.home-hero--stale')).toBeNull()
  })

  it('says the publish time is unknown — never "NaN" — when the resolver reports no age', () => {
    // Arrange — an unparseable CAMS `generated_at`: the resolver marks it
    // stale and reports `ageMs: null` rather than a guessed figure.
    const reading: PrimaryReadingReady = { ...readyReading(0, true), ageMs: null }
    // Act
    const { container } = render(
      <HomeHero
        reading={reading}
        data={RAIL_DATA}
        requestingLocation={false}
        locationDenied={false}
        placeLabel="Seoul, KR"
        locationSource="default"
        onRequestLocation={() => {}}
        onSelectCity={() => {}}
      />,
    )
    // Assert
    expect(container.querySelector('.home-hero__stale-flag')?.textContent).toBe('Stale · publish time unknown')
    expect(container.querySelectorAll('.state-chip')).toHaveLength(1)
    expect(container.textContent).not.toMatch(/NaN/)
    expect(container.querySelector('[data-testid="trust-line"]')?.textContent).toMatch(/data age\s*unknown/)
  })

  it('merges stale + forecast into one chip instead of stacking a second', () => {
    // Arrange / Act — 7h old and the resolver's own verdict is stale.
    const { container } = renderHero(7 * 60 * 60 * 1000, true)
    // Assert — one chip, stale styling, both facts and the elapsed time in it.
    const chips = container.querySelectorAll('.state-chip')
    expect(chips).toHaveLength(1)
    expect(chips[0].className).toContain('state-chip--stale')
    expect(chips[0].textContent).toMatch(/Forecast · Stale/)
    expect(chips[0].textContent).toMatch(/7h/)
  })
})

/**
 * An analysis-sourced reading — the grid backs the headline, with a CAMS
 * `secondary` line disclosing the nearby feed city's own forecast
 * (`readingCopy.ts`'s `secondaryForecastLine` — W1b commit ②). `place.distanceKm`
 * is the grid cell's own distance from the visitor; `secondary.distanceKm` is
 * the CAMS feed city's, a different number the two source lines must not mix up.
 */
function analysisReading(overrides: Partial<PrimaryReadingReady> = {}): PrimaryReadingReady {
  return {
    status: 'ready',
    source: 'analysis',
    pm25: 22,
    tier: 'good',
    stale: false,
    place: { label: 'Seoul, KR', countryCode: null, distanceKm: 48 },
    validTimeIso: new Date(NOW).toISOString(),
    validTimeMs: NOW,
    ageMs: 30 * 60 * 1000,
    natureLabel: '[ANALYSIS]',
    secondary: { cityName: 'Seoul', countryCode: 'KR', distanceKm: 3, pm25: 11, tier: 'good', stale: false },
    agreement: null,
    agreeCount: 2,
    resolvedCount: 2,
    hudStatus: 'ready',
    dqss: { available: false, reason: 'not measured for this grid cell' },
    uncertainty: { available: false, reason: 'this data source publishes no uncertainty range' },
    refreshMs: GRID_REFRESH_MS,
    updatedAtIso: new Date(NOW).toISOString(),
    ...overrides,
  }
}

function renderHeroWithReading(reading: PrimaryReadingReady) {
  return render(
    <HomeHero
      reading={reading}
      data={RAIL_DATA}
      requestingLocation={false}
      locationDenied={false}
      placeLabel="Seoul, KR"
      locationSource="default"
      onRequestLocation={() => {}}
      onSelectCity={() => {}}
    />,
  )
}

describe('HomeHero — reading source disclosure (readingCopy.ts)', () => {
  it('renders the analysis chip, an "As of" meta, and the grid + CAMS secondary source lines with their own distances/value', () => {
    // Arrange / Act
    const { container } = renderHeroWithReading(analysisReading())
    // Assert — exactly one chip, the analysis variant (not "forecast"/"stale").
    const chips = container.querySelectorAll('.state-chip')
    expect(chips).toHaveLength(1)
    expect(chips[0].className).toContain('state-chip--analysis')
    // Assert — an analysis reading is worded "As of", never "Valid" (that's forecast wording).
    expect(container.querySelector('.home-hero__meta')?.textContent).toMatch(/^As of/)
    // Assert — the grid source line (48 km) and the CAMS secondary line (Seoul, KR · 3 km · 11 µg/m³).
    const sourceLines = container.querySelectorAll('.home-hero__source')
    expect(sourceLines).toHaveLength(2)
    expect(sourceLines[0].textContent).toBe('Model analysis, nearest grid cell · 48 km')
    expect(sourceLines[1].textContent).toBe('City forecast (CAMS) · Seoul, KR · 3 km · 11 µg/m³')
  })

  it('renders a "Valid" meta and the CAMS-forecast source line, with no secondary line, for a forecast-sourced reading', () => {
    // Arrange / Act — the pre-existing forecast fixture, which carries no `secondary`.
    const { container } = renderHero(60 * 60 * 1000, false)
    // Assert — forecast wording ("Valid", never "As of") and the forecast's own source line.
    expect(container.querySelector('.home-hero__meta')?.textContent).toMatch(/^Valid/)
    const sourceLines = container.querySelectorAll('.home-hero__source')
    expect(sourceLines).toHaveLength(1)
    expect(sourceLines[0].textContent).toBe('CAMS forecast for Seoul, KR')
  })

  it('hides the secondary CAMS line for a forecast-sourced reading even when a secondary is present', () => {
    // Arrange — a forecast primary that (hypothetically) still carries a
    // `secondary`: the headline IS the CAMS forecast, so repeating it as a
    // "secondary" city-forecast line would disclose the same number twice.
    const reading = analysisReading({
      source: 'forecast',
      natureLabel: '[FORECAST]',
      place: { label: 'Seoul, KR', countryCode: null, distanceKm: null },
      refreshMs: CAMS_REFRESH_MS,
    })
    // Act
    const { container } = renderHeroWithReading(reading)
    // Assert — only the forecast's own source line renders.
    const sourceLines = container.querySelectorAll('.home-hero__source')
    expect(sourceLines).toHaveLength(1)
    expect(sourceLines[0].textContent).toBe('CAMS forecast for Seoul, KR')
  })

  it('marks a stale CAMS secondary line with a trailing "· stale"', () => {
    // Arrange — the analysis primary is fresh, but its CAMS secondary is itself stale.
    const reading = analysisReading({
      secondary: { cityName: 'Seoul', countryCode: 'KR', distanceKm: 3, pm25: 11, tier: 'good', stale: true },
    })
    // Act
    const { container } = renderHeroWithReading(reading)
    // Assert
    const sourceLines = container.querySelectorAll('.home-hero__source')
    expect(sourceLines[1].textContent).toBe('City forecast (CAMS) · Seoul, KR · 3 km · 11 µg/m³ · stale')
  })

  it('keeps the analysis headline (chip and source line) fresh when only the CAMS secondary is stale', () => {
    // Arrange — a stale secondary must not repaint the fresh grid analysis as stale.
    const reading = analysisReading({
      secondary: { cityName: 'Seoul', countryCode: 'KR', distanceKm: 3, pm25: 11, tier: 'good', stale: true },
    })
    // Act
    const { container } = renderHeroWithReading(reading)
    // Assert
    const chips = container.querySelectorAll('.state-chip')
    expect(chips).toHaveLength(1)
    expect(chips[0].className).toContain('state-chip--analysis')
    expect(container.querySelector('.home-hero--stale')).toBeNull()
    expect(container.querySelectorAll('.home-hero__source')[0].textContent).not.toMatch(/stale/)
  })
})
