import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent, within, act } from '@testing-library/react'
import AqiCapsule from './AqiCapsule'
import type { CapsuleDataReady } from './useCapsuleData'
import type { PrimaryReadingReady } from '../../../lib/reading/resolvePrimaryReading'
import { CAMS_REFRESH_MS, GRID_REFRESH_MS } from '../../../lib/config/readingCadence'

vi.mock('./useCapsuleData', () => ({
  useCapsuleData: vi.fn(),
}))

vi.mock('../../../hooks/useResolvedLocation', () => ({
  useResolvedLocation: vi.fn(),
}))

// W1b commit ② — the capsule's headline/idle bar/panel now read the shared
// resolver hook, not `useCapsuleData` directly. `useCapsuleData` stays mocked
// above for the 24h chart/range CapsulePanel still shows (page 2 + the page-1
// range disclosure), which stays CAMS's own outlook regardless of source.
vi.mock('../../../hooks/usePrimaryReading', () => ({
  usePrimaryReading: vi.fn(),
}))

import { useCapsuleData } from './useCapsuleData'
import { useResolvedLocation, type UseResolvedLocationResult } from '../../../hooks/useResolvedLocation'
import { usePrimaryReading } from '../../../hooks/usePrimaryReading'

/** Default = no stored choice and no resolved approx (the lookup already
 * failed): the state a first-time visitor is in before any opt-in, where
 * every surface resolves to the honestly-labeled Seoul default (W1a — the
 * old feed-wide "thickest air" fallback is retired). */
function mockResolvedLocation(overrides: Partial<UseResolvedLocationResult> = {}) {
  vi.mocked(useResolvedLocation).mockReturnValue({
    location: { lat: 37.5665, lon: 126.978, label: 'Seoul, KR', source: 'default' },
    choice: null,
    approx: { status: 'failed' },
    requesting: false,
    denied: false,
    requestGeolocation: () => {},
    selectCity: () => {},
    clearChoice: () => {},
    ...overrides,
  })
}

const READY: CapsuleDataReady = {
  status: 'ready',
  city: 'Seoul',
  lat: 37.5665,
  lon: 126.978,
  countryCode: 'KR',
  current: 42,
  tier: 'moderate',
  range: { lo: 30, hi: 55 },
  p10: 37,
  p90: 47,
  series24h: Array.from({ length: 24 }, (_, i) => ({
    time: `t${i}`,
    p10: 30 + i,
    p50: 35 + i,
    p90: 40 + i,
  })),
  updatedAt: new Date().toISOString(),
  alert: 'steady',
}

/** Default shared-reading fixture — a forecast primary (mirrors `READY`
 * above's CAMS-sourced 42 µg/m³/moderate/Seoul), fresh (ageMs 0) so the idle
 * countdown starts at the full refresh window. Individual tests override
 * `ageMs`/`refreshMs`/`source`/`place` as needed via `mockPrimaryReading`. */
const READING_READY: PrimaryReadingReady = {
  status: 'ready',
  source: 'forecast',
  pm25: 42,
  tier: 'moderate',
  stale: false,
  place: { label: 'Seoul', countryCode: 'KR', distanceKm: null },
  validTimeIso: new Date().toISOString(),
  validTimeMs: Date.now(),
  ageMs: 0,
  natureLabel: '[FORECAST]',
  secondary: null,
  agreement: null,
  agreeCount: 1,
  resolvedCount: 1,
  hudStatus: 'ready',
  dqss: { available: false, reason: 'not measured for forecast-sourced readings' },
  uncertainty: { available: true, p10: 37, p90: 47, unit: 'µg/m³' },
  refreshMs: CAMS_REFRESH_MS,
  updatedAtIso: new Date().toISOString(),
}

function mockPrimaryReading(reading: PrimaryReadingReady | { status: 'loading' } | { status: 'unavailable' }) {
  vi.mocked(usePrimaryReading).mockReturnValue({
    reading,
    grid: { status: 'loading' },
    cams: { status: 'loading' },
  })
}

beforeEach(() => {
  vi.mocked(useCapsuleData).mockReturnValue(READY)
  mockResolvedLocation()
  mockPrimaryReading(READING_READY)
  // jump-mode reduced motion — same rationale as Materialize.test.tsx: jsdom
  // has no matchMedia, and forcing reduced=true makes useSpring jump instead
  // of animate, so assertions don't depend on rAF timing.
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('reduced-motion'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
  sessionStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.resetAllMocks()
})

describe('AqiCapsule', () => {
  it('starts closed with aria-expanded false', () => {
    // Arrange / Act
    const { container } = render(<AqiCapsule />)
    // Assert
    expect(within(container).getByRole('button').getAttribute('aria-expanded')).toBe('false')
  })

  it('opens on click and mounts the panel', () => {
    // Arrange
    const { container } = render(<AqiCapsule />)
    const trigger = within(container).getByRole('button')
    // Act
    fireEvent.click(trigger)
    // Assert
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(document.getElementById(trigger.getAttribute('aria-controls')!)).not.toBeNull()
  })

  it('closes on Escape and returns focus to the trigger', () => {
    // Arrange
    const { container } = render(<AqiCapsule />)
    const trigger = within(container).getByRole('button')
    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(document.activeElement).toBe(trigger)
    // Act
    fireEvent.keyDown(document, { key: 'Escape' })
    // Assert
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(trigger)
  })

  it('closes on an outside click', () => {
    // Arrange
    const { container } = render(<AqiCapsule />)
    const trigger = within(container).getByRole('button')
    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    // Act
    fireEvent.pointerDown(document.body)
    // Assert
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('states the band is absent instead of printing a zero-width range', () => {
    // Arrange — deterministic source: no p10/p90 anywhere, so range is null.
    // (Still CAMS's own outlook, `useCapsuleData` — unaffected by the shared
    // reading's own source, W1b commit ②.)
    vi.mocked(useCapsuleData).mockReturnValue({
      ...READY,
      range: null,
      series24h: READY.series24h.map((p) => ({ ...p, p10: null, p90: null })),
    })
    // Act
    const { container } = render(<AqiCapsule />)
    fireEvent.click(within(container).getByRole('button'))
    // Assert
    const text = document.body.textContent ?? ''
    expect(text).toContain('no uncertainty band published')
    expect(text).not.toMatch(/expected today/i)
    // The zero-width range this replaced: "42–42 µg/m³".
    expect(text).not.toMatch(/(\d+)–\1\s*µg\/m³/)
  })

  it('shows a countdown while the reading is within its own refresh window', () => {
    // Arrange — fresh (ageMs 0) against the default forecast's 6h refreshMs
    // W1b commit ②: the countdown is now driven by `reading.refreshMs`/
    // `reading.ageMs` directly (the shared resolver), not a fixed
    // REFRESH_INTERVAL_MS constant computed from `useCapsuleData.updatedAt`.
    const { container } = render(<AqiCapsule />)
    // Assert
    const countdown = container.querySelector('.aq-capsule__countdown')
    // F51: remaining is the full 6h refresh window here, so formatCountdown
    // renders "Xh Ym" (>=60min), not raw "m:ss".
    expect(countdown?.textContent).toMatch(/^\d+h \d+m$/)
    expect(countdown?.hasAttribute('data-stale')).toBe(false)
  })

  it('shows data age instead of a stuck 0:00 when the reading is older than its refresh window', () => {
    // Arrange — 7h old against a 6h refreshMs
    mockPrimaryReading({ ...READING_READY, ageMs: 7 * 60 * 60 * 1000 })
    // Act
    const { container } = render(<AqiCapsule />)
    // Assert
    const countdown = container.querySelector('.aq-capsule__countdown')
    expect(countdown?.textContent).toBe('7h ago')
    expect(countdown?.getAttribute('data-stale')).toBe('true')
  })

  it('shows no countdown and no made-up age when the publish time is unknown', () => {
    // Arrange — the resolver reports `ageMs: null` (unparseable publish time)
    // and calls the reading stale.
    mockPrimaryReading({ ...READING_READY, ageMs: null, stale: true, hudStatus: 'stale' })
    // Act
    const { container } = render(<AqiCapsule />)
    // Assert
    const countdown = container.querySelector('.aq-capsule__countdown')
    expect(countdown?.textContent).toBe('—')
    expect(countdown?.getAttribute('data-stale')).toBe('true')
    expect(countdown?.getAttribute('title')).toBe("This forecast's publish time is unknown")
    expect(container.textContent).not.toMatch(/NaN/)
  })

  it('says the city forecast is loading — not "unavailable" or "NO FEED" — while CAMS is still in flight', () => {
    // Arrange — the grid-gated headline is ready; the CAMS outlook is not yet.
    vi.mocked(useCapsuleData).mockReturnValue({ status: 'loading' })
    const { container } = render(<AqiCapsule />)
    // Act
    fireEvent.click(within(container).getByRole('button', { name: /expand for details/i }))
    // Assert
    expect(container.querySelector('.aq-capsule-panel__range')?.textContent).toBe('City forecast (CAMS) loading…')
    const panelText = container.querySelector('.aq-capsule-panel')?.textContent ?? ''
    expect(panelText).toContain('LOADING…')
    expect(panelText).not.toMatch(/unavailable|NO FEED/)
  })

  it('says the city forecast is unavailable, with NO FEED on its chart page, once CAMS has failed', () => {
    // Arrange
    vi.mocked(useCapsuleData).mockReturnValue({ status: 'missing' })
    const { container } = render(<AqiCapsule />)
    // Act
    fireEvent.click(within(container).getByRole('button', { name: /expand for details/i }))
    // Assert
    expect(container.querySelector('.aq-capsule-panel__range')?.textContent).toBe('City forecast (CAMS) unavailable')
    const panelText = container.querySelector('.aq-capsule-panel')?.textContent ?? ''
    expect(panelText).toContain('NO FEED')
    expect(panelText).not.toContain('LOADING')
  })

  it('still counts down at 5h — inside the 6h window the source actually uses', () => {
    // Arrange — 5h old, 1h of the 6h refresh window left. Under the previous
    // fixed 3h constant this read as stale, which was the capsule calling
    // current data old for half of every cycle.
    mockPrimaryReading({ ...READING_READY, ageMs: 5 * 60 * 60 * 1000 })
    // Act
    const { container } = render(<AqiCapsule />)
    // Assert
    const countdown = container.querySelector('.aq-capsule__countdown')
    expect(countdown?.textContent).toMatch(/^\d+h \d+m$/)
    expect(countdown?.hasAttribute('data-stale')).toBe(false)
  })

  it('defaults to the night glass variant and accepts a day override', () => {
    // Arrange / Act
    const night = render(<AqiCapsule />)
    const day = render(<AqiCapsule variant="day" />)
    // Assert
    expect(night.container.querySelector('.liquid-glass--night')).not.toBeNull()
    expect(day.container.querySelector('.liquid-glass--day')).not.toBeNull()
  })

  it('renders the honest NO FEED state instead of a fabricated reading', () => {
    // Arrange — W1b commit ②: idle-state absence is driven by the shared
    // `reading`, not `useCapsuleData` (which may still resolve independently).
    mockPrimaryReading({ status: 'unavailable' })
    // Act
    const { container } = render(<AqiCapsule />)
    // Assert
    expect(within(container).getByText('NO FEED')).toBeTruthy()
  })

  it('shows the location label and a DEFAULT · NOT YOURS warning for the Seoul default', () => {
    // Arrange — no choice, no approx (default mock): the fixed Seoul default
    // Act — idle pill only (panel closed): the short form, COLLAPSED_W has no
    // room for the fuller "DEFAULT LOCATION (SEOUL) —" wording (see the panel
    // test below for that one).
    const { container } = render(<AqiCapsule />)
    // Assert — W1b commit ②: the idle row now shows `location.label` verbatim
    // ("Seoul, KR"), not a short city-only name derived from `data.city`.
    expect(within(container).getByText('Seoul, KR')).toBeTruthy()
    expect(within(container).getByText('DEFAULT · NOT YOURS')).toBeTruthy()
  })

  it('badges an IP-approximate reading as APPROXIMATE rather than as the visitor’s own', () => {
    // Arrange — no stored choice yet, but the edge resolved a rough point
    mockResolvedLocation({ location: { lat: 37.5665, lon: 126.978, label: 'Seoul', source: 'approx' } })
    // Act
    const { container } = render(<AqiCapsule />)
    // Assert
    expect(within(container).getByText('APPROXIMATE')).toBeTruthy()
    expect(within(container).queryByText('DEFAULT · NOT YOURS')).toBeNull()
  })

  it('drops the badge entirely once a real opt-in choice personalizes the reading', () => {
    // Arrange
    mockResolvedLocation({
      location: { lat: 37.5665, lon: 126.978, label: 'Seoul, KR', source: 'geolocation' },
      choice: { lat: 37.5665, lon: 126.978, label: 'Seoul, KR', source: 'geolocation' },
    })
    // Act
    const { container } = render(<AqiCapsule />)
    // Assert
    expect(within(container).getByText('Seoul, KR')).toBeTruthy()
    expect(container.querySelector('.aq-capsule__warn')).toBeNull()
  })
})

describe('AqiCapsule — G1 location personalization', () => {
  it('never requests geolocation on mount — only a click fires the permission prompt', () => {
    // Arrange
    const requestGeolocation = vi.fn()
    mockResolvedLocation({ requestGeolocation })
    // Act
    render(<AqiCapsule />)
    // Assert
    expect(requestGeolocation).not.toHaveBeenCalled()
  })

  it('offers a "Use my location" CTA on the fallback panel that requests geolocation on click', () => {
    // Arrange
    const requestGeolocation = vi.fn()
    mockResolvedLocation({ requestGeolocation })
    const { container } = render(<AqiCapsule />)
    fireEvent.click(within(container).getByRole('button', { name: /expand for details/i }))
    // Act
    const cta = within(container).getByText('Use my location')
    fireEvent.click(cta)
    // Assert
    expect(requestGeolocation).toHaveBeenCalledTimes(1)
  })

  it('shows "Locating…" and disables the CTA while a request is in flight', () => {
    // Arrange
    mockResolvedLocation({ requesting: true })
    const { container } = render(<AqiCapsule />)
    fireEvent.click(within(container).getByRole('button', { name: /expand for details/i }))
    // Assert
    const cta = within(container).getByText('Locating…') as HTMLButtonElement
    expect(cta.disabled).toBe(true)
  })

  it("shows the resolver's own distance in the panel's source line for an analysis reading", () => {
    // Arrange — W1b commit ②: the old idle-bar "NEAREST TO YOU · X KM" badge
    // (computed in this component from a haversine distance to the CAMS feed
    // city) is retired — the capsule's location row now shows the visitor's
    // own place, so that distance was no longer meaningful. The resolver's
    // own `place.distanceKm` (works for any source, analysis or forecast)
    // surfaces instead, in the expanded panel's source line only.
    mockResolvedLocation({
      location: { lat: 37.5, lon: 127.0, label: 'My location', source: 'geolocation' },
      choice: { lat: 37.5, lon: 127.0, label: 'My location', source: 'geolocation' },
    })
    mockPrimaryReading({
      ...READING_READY,
      source: 'analysis',
      natureLabel: '[ANALYSIS]',
      place: { label: 'My location', countryCode: null, distanceKm: 3.2 },
    })
    // Act
    const { container } = render(<AqiCapsule />)
    fireEvent.click(within(container).getByRole('button', { name: /expand for details/i }))
    // Assert
    expect(within(container).getByText('Model analysis, nearest grid cell · 3 km')).toBeTruthy()
  })

  it('omits the distance suffix in the panel source line when the resolver reports none (e.g. a search pick)', () => {
    // Arrange — an exact-match search pick: the resolver reports no distance
    mockResolvedLocation({
      location: { lat: 48.8566, lon: 2.3522, label: 'Paris, FR', source: 'search' },
      choice: { lat: 48.8566, lon: 2.3522, label: 'Paris, FR', source: 'search' },
    })
    mockPrimaryReading({
      ...READING_READY,
      source: 'forecast',
      place: { label: 'Paris', countryCode: 'FR', distanceKm: null },
    })
    // Act
    const { container } = render(<AqiCapsule />)
    fireEvent.click(within(container).getByRole('button', { name: /expand for details/i }))
    // Assert
    expect(within(container).getByText('CAMS forecast for Paris, FR')).toBeTruthy()
    expect(within(container).queryByText(/km$/)).toBeNull()
  })

  it('keeps the Seoul default label and surfaces a denial note when permission was refused', () => {
    // Arrange — no choice, no approx, denied
    mockResolvedLocation({ denied: true })
    // Act
    const { container } = render(<AqiCapsule />)
    fireEvent.click(within(container).getByRole('button', { name: /expand for details/i }))
    // Assert — idle keeps the short form, the now-open panel spells out the
    // fuller wording (see the header comment on why they differ)
    expect(within(container).getByText('DEFAULT · NOT YOURS')).toBeTruthy()
    expect(within(container).getByText('DEFAULT LOCATION (SEOUL) — NOT YOURS')).toBeTruthy()
    expect(
      within(container).getByText('Location permission was not granted — showing the default location (Seoul).'),
    ).toBeTruthy()
  })

  it('hides the CTA and fallback note once a real choice personalizes the reading', () => {
    // Arrange
    mockResolvedLocation({
      location: { lat: 37.5665, lon: 126.978, label: 'Seoul, KR', source: 'search' },
      choice: { lat: 37.5665, lon: 126.978, label: 'Seoul, KR', source: 'search' },
    })
    // Act
    const { container } = render(<AqiCapsule />)
    fireEvent.click(within(container).getByRole('button', { name: /expand for details/i }))
    // Assert
    expect(within(container).queryByText('Use my location')).toBeNull()
    expect(within(container).queryByText(/DEFAULT LOCATION|NOT YOURS/)).toBeNull()
  })
})

describe('AqiCapsule — hide on scroll down', () => {
  // The listener only attaches with motion enabled, so this block overrides
  // the file-default reduced-motion stub. rAF is captured into a queue and
  // flushed manually per scroll so assertions never depend on frame timing
  // (springs may enqueue frames too — flushing them once is harmless).
  let frames: FrameRequestCallback[]

  beforeEach(() => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    frames = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frames.push(cb)
      return frames.length
    })
    vi.stubGlobal('cancelAnimationFrame', () => {})
  })

  function scrollTo(y: number): void {
    Object.defineProperty(window, 'scrollY', { value: y, configurable: true, writable: true })
    fireEvent.scroll(window)
    act(() => {
      frames.splice(0).forEach((cb) => cb(0))
    })
  }

  it('slides away scrolling down, returns scrolling up, always shows near the top', () => {
    // Arrange
    scrollTo(0)
    const { container } = render(<AqiCapsule />)
    const root = container.querySelector('.aq-capsule')!
    expect(root.hasAttribute('data-hidden')).toBe(false)
    // Act / Assert — down past the delta threshold: hides
    scrollTo(200)
    expect(root.hasAttribute('data-hidden')).toBe(true)
    // back up: returns without needing to reach the top
    scrollTo(120)
    expect(root.hasAttribute('data-hidden')).toBe(false)
    // down again, then into the near-top band: always shown there
    scrollTo(500)
    expect(root.hasAttribute('data-hidden')).toBe(true)
    scrollTo(30)
    expect(root.hasAttribute('data-hidden')).toBe(false)
  })

  it('never hides while the panel is open', () => {
    // Arrange
    scrollTo(0)
    const { container } = render(<AqiCapsule />)
    fireEvent.click(within(container).getByRole('button'))
    // Act — a scroll that would hide the idle pill
    scrollTo(200)
    // Assert
    expect(container.querySelector('.aq-capsule')!.hasAttribute('data-hidden')).toBe(false)
  })

  it('does not attach the listener under reduced motion', () => {
    // Arrange — restore the file-default reduced-motion stub
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('reduced-motion'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    scrollTo(0)
    const { container } = render(<AqiCapsule />)
    // Act
    scrollTo(400)
    // Assert — capsule stays put instead of sliding
    expect(container.querySelector('.aq-capsule')!.hasAttribute('data-hidden')).toBe(false)
  })
})

describe('AqiCapsule — analysis panel discloses the CAMS secondary', () => {
  it('shows the analysis source line, the secondary CAMS line, and names the range line "City forecast (CAMS)"', () => {
    // Arrange — an analysis primary with the CAMS secondary populated. The
    // panel's page-1 range disclosure stays wired to `useCapsuleData`
    // (mocked to `READY` in `beforeEach`, city "Seoul"), independent of
    // `reading.source`.
    mockPrimaryReading({
      ...READING_READY,
      source: 'analysis',
      natureLabel: '[ANALYSIS]',
      place: { label: 'Seoul, KR', countryCode: null, distanceKm: 3.2 },
      secondary: {
        cityName: 'Seoul',
        countryCode: 'KR',
        distanceKm: 12,
        pm25: 40,
        tier: 'moderate',
        stale: false,
      },
    })
    // Act
    const { container } = render(<AqiCapsule />)
    fireEvent.click(within(container).getByRole('button', { name: /expand for details/i }))
    // Assert — both source lines render (analysis first, CAMS secondary
    // second), and the range line is unmistakably CAMS's, not the
    // headline's own.
    const sourceLines = container.querySelectorAll('.aq-capsule-panel__source')
    expect(sourceLines).toHaveLength(2)
    expect(sourceLines[0].textContent).toBe('Model analysis, nearest grid cell · 3 km')
    expect(sourceLines[1].textContent).toBe('City forecast (CAMS) · Seoul, KR · 12 km · 40 µg/m³')
    expect(container.querySelector('.aq-capsule-panel__range')?.textContent).toMatch(/^City forecast \(CAMS\)/)
  })
})

describe('AqiCapsule — analysis refresh cadence (3h, distinct from the 6h forecast one)', () => {
  it('counts down against the 3h analysis window — 1h old reads "2h 0m" left', () => {
    // Arrange — 1h-old analysis reading: 2h remain of its own 3h window
    // (F51/GRID_REFRESH_MS), not the forecast's 6h one.
    mockPrimaryReading({
      ...READING_READY,
      source: 'analysis',
      refreshMs: GRID_REFRESH_MS,
      ageMs: 1 * 60 * 60 * 1000,
    })
    // Act
    const { container } = render(<AqiCapsule />)
    // Assert
    const countdown = container.querySelector('.aq-capsule__countdown')
    expect(countdown?.textContent).toBe('2h 0m')
    expect(countdown?.hasAttribute('data-stale')).toBe(false)
    expect(countdown?.getAttribute('title')).toBe('Next analysis refresh in 2h 0m (updates every 3h)')
  })

  it('reads as stale past its own 3h window — 4h old shows "4h ago"', () => {
    // Arrange — 4h-old analysis reading: already past the 3h window. Under
    // the forecast's 6h cadence this age would still be counting down —
    // proof the two sources use their own cadence, not a shared constant.
    mockPrimaryReading({
      ...READING_READY,
      source: 'analysis',
      refreshMs: GRID_REFRESH_MS,
      ageMs: 4 * 60 * 60 * 1000,
    })
    // Act
    const { container } = render(<AqiCapsule />)
    // Assert
    const countdown = container.querySelector('.aq-capsule__countdown')
    expect(countdown?.textContent).toBe('4h ago')
    expect(countdown?.getAttribute('data-stale')).toBe('true')
    expect(countdown?.getAttribute('title')).toBe('This analysis is older than its usual 3h refresh window')
  })
})

describe('AqiCapsule — worsening alert waits for the headline reading', () => {
  // The effect this exercises is wired to `data` (CAMS's 24h outlook) AND
  // `reading.status` (the shared headline resolver) — see AqiCapsule.tsx's
  // header comment on that effect. Fake timers make the kickoff/auto-close
  // setTimeouts deterministic instead of racing real ones.
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not auto-open or spend the one-per-session alert while the headline is still loading, then opens and marks it shown once the headline resolves', () => {
    // Arrange — CAMS's own outlook already signals "worsening", but the
    // shared headline reading the panel would actually show hasn't landed.
    vi.mocked(useCapsuleData).mockReturnValue({ ...READY, alert: 'worsening' })
    mockPrimaryReading({ status: 'loading' })
    // Act
    const { container, rerender } = render(<AqiCapsule />)
    act(() => {
      vi.advanceTimersByTime(0)
    })
    // Assert — gated: no empty capsule opened, one-shot alert not spent.
    // (The trigger is queried by its class, not `getByRole('button')` — once
    // the panel opens it adds more buttons, e.g. the "Use my location" CTA.)
    const trigger = () => container.querySelector('.aq-capsule__trigger')!
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
    expect(sessionStorage.getItem('airlens-capsule-alert-shown')).toBeNull()

    // Act — the headline reading resolves
    mockPrimaryReading(READING_READY)
    rerender(<AqiCapsule />)
    act(() => {
      vi.advanceTimersByTime(0)
    })
    // Assert — now it opens and the alert is marked shown
    expect(trigger().getAttribute('aria-expanded')).toBe('true')
    expect(sessionStorage.getItem('airlens-capsule-alert-shown')).toBe('1')
  })
})
