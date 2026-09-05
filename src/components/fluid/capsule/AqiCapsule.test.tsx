import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent, within, act } from '@testing-library/react'
import AqiCapsule from './AqiCapsule'
import type { CapsuleDataReady } from './useCapsuleData'

vi.mock('./useCapsuleData', () => ({
  useCapsuleData: vi.fn(),
}))

vi.mock('../../../hooks/useLocationPersonalization', () => ({
  useLocationPersonalization: vi.fn(),
}))

import { useCapsuleData } from './useCapsuleData'
import {
  useLocationPersonalization,
  type UseLocationPersonalizationResult,
} from '../../../hooks/useLocationPersonalization'

/** Default = no stored choice and no resolved approx: the state a first-time
 * visitor is in before any opt-in, where the capsule falls back to the feed's
 * thickest-air pick. */
function mockPersonalization(overrides: Partial<UseLocationPersonalizationResult> = {}) {
  vi.mocked(useLocationPersonalization).mockReturnValue({
    choice: null,
    approx: null,
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
  isPersonalized: false,
}

beforeEach(() => {
  vi.mocked(useCapsuleData).mockReturnValue(READY)
  mockPersonalization()
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
    expect(text).toContain('No uncertainty band published')
    expect(text).not.toMatch(/Expected today/)
    // The zero-width range this replaced: "42–42 µg/m³".
    expect(text).not.toMatch(/(\d+)–\1\s*µg\/m³/)
  })

  it('shows a countdown while the mirror is within the refresh interval', () => {
    // Arrange — updatedAt is now, so remaining ≈ 3h
    const { container } = render(<AqiCapsule />)
    // Assert
    const countdown = container.querySelector('.aq-capsule__countdown')
    expect(countdown?.textContent).toMatch(/^\d+:\d{2}$/)
    expect(countdown?.hasAttribute('data-stale')).toBe(false)
  })

  it('shows data age instead of a stuck 0:00 when the feed is stale', () => {
    // Arrange — 7h-old data, beyond the 6h refresh interval
    vi.mocked(useCapsuleData).mockReturnValue({
      ...READY,
      updatedAt: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString(),
    })
    // Act
    const { container } = render(<AqiCapsule />)
    // Assert
    const countdown = container.querySelector('.aq-capsule__countdown')
    expect(countdown?.textContent).toBe('7h ago')
    expect(countdown?.getAttribute('data-stale')).toBe('true')
  })

  it('still counts down at 5h — inside the 6h window the source actually uses', () => {
    // Arrange — 5h old. Under the previous 3h constant this read as stale,
    // which was the capsule calling current data old for half of every cycle.
    vi.mocked(useCapsuleData).mockReturnValue({
      ...READY,
      updatedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    })
    // Act
    const { container } = render(<AqiCapsule />)
    // Assert
    const countdown = container.querySelector('.aq-capsule__countdown')
    expect(countdown?.textContent).toMatch(/^\d+:\d{2}$/)
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
    // Arrange
    vi.mocked(useCapsuleData).mockReturnValue({ status: 'missing' })
    // Act
    const { container } = render(<AqiCapsule />)
    // Assert
    expect(within(container).getByText('NO FEED')).toBeTruthy()
  })

  it('shows the location label and an honest fallback warning for the fallback pick', () => {
    // Arrange — no choice, no approx (default mock): the feed's thickest-air pick
    // Act
    const { container } = render(<AqiCapsule />)
    // Assert
    expect(within(container).getByText('Seoul')).toBeTruthy()
    expect(within(container).getByText('NEAREST FEED CITY — NOT YOUR LOCATION')).toBeTruthy()
  })

  it('badges an IP-approximate reading as APPROXIMATE rather than as the visitor’s own', () => {
    // Arrange — no stored choice yet, but the edge resolved a rough point
    mockPersonalization({ approx: { lat: 37.5665, lon: 126.978, city: 'Seoul' } })
    vi.mocked(useCapsuleData).mockReturnValue({ ...READY, isPersonalized: true })
    // Act
    const { container } = render(<AqiCapsule />)
    // Assert
    expect(within(container).getByText('APPROXIMATE')).toBeTruthy()
    expect(within(container).queryByText('NOT YOUR LOCATION')).toBeNull()
  })

  it('drops the badge entirely once a real opt-in choice personalizes the reading', () => {
    // Arrange
    mockPersonalization({ choice: { lat: 37.5665, lon: 126.978, label: 'Seoul, KR', source: 'geolocation' } })
    vi.mocked(useCapsuleData).mockReturnValue({ ...READY, isPersonalized: true })
    // Act
    const { container } = render(<AqiCapsule />)
    // Assert
    expect(within(container).getByText('Seoul')).toBeTruthy()
    expect(container.querySelector('.aq-capsule__warn')).toBeNull()
  })
})

describe('AqiCapsule — G1 location personalization', () => {
  it('never requests geolocation on mount — only a click fires the permission prompt', () => {
    // Arrange
    const requestGeolocation = vi.fn()
    mockPersonalization({ requestGeolocation })
    // Act
    render(<AqiCapsule />)
    // Assert
    expect(requestGeolocation).not.toHaveBeenCalled()
  })

  it('offers a "Use my location" CTA on the fallback panel that requests geolocation on click', () => {
    // Arrange
    const requestGeolocation = vi.fn()
    mockPersonalization({ requestGeolocation })
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
    mockPersonalization({ requesting: true })
    const { container } = render(<AqiCapsule />)
    fireEvent.click(within(container).getByRole('button', { name: /expand for details/i }))
    // Assert
    const cta = within(container).getByText('Locating…') as HTMLButtonElement
    expect(cta.disabled).toBe(true)
  })

  it('shows a NEAREST TO YOU distance once a geolocation pick personalizes the reading', () => {
    // Arrange — a real GPS/Wi-Fi fix, not an exact match to the resolved city
    mockPersonalization({ choice: { lat: 37.5, lon: 127.0, label: 'My location', source: 'geolocation' } })
    vi.mocked(useCapsuleData).mockReturnValue({ ...READY, isPersonalized: true })
    // Act
    const { container } = render(<AqiCapsule />)
    // Assert — idle bar
    expect(within(container).getByText(/^NEAREST TO YOU · \d+ KM$/)).toBeTruthy()
    // Assert — expanded panel repeats it
    fireEvent.click(within(container).getByRole('button', { name: /expand for details/i }))
    expect(within(container).getAllByText(/^NEAREST TO YOU · \d+ KM$/).length).toBeGreaterThanOrEqual(1)
  })

  it('does not show a distance for a typed-in search pick — already an exact match', () => {
    // Arrange
    mockPersonalization({ choice: { lat: 48.8566, lon: 2.3522, label: 'Paris, FR', source: 'search' } })
    vi.mocked(useCapsuleData).mockReturnValue({ ...READY, isPersonalized: true })
    // Act
    const { container } = render(<AqiCapsule />)
    // Assert
    expect(within(container).queryByText(/NEAREST TO YOU/)).toBeNull()
  })

  it('keeps the fallback label and surfaces a denial note when permission was refused', () => {
    // Arrange — no choice, no approx, denied
    mockPersonalization({ denied: true })
    // Act
    const { container } = render(<AqiCapsule />)
    fireEvent.click(within(container).getByRole('button', { name: /expand for details/i }))
    // Assert
    expect(within(container).getByText('NEAREST FEED CITY — NOT YOUR LOCATION')).toBeTruthy()
    expect(within(container).getByText('LOCATION DENIED — SHOWING FEED FALLBACK')).toBeTruthy()
  })

  it('hides the CTA and fallback note once a real choice personalizes the reading', () => {
    // Arrange
    mockPersonalization({ choice: { lat: 37.5665, lon: 126.978, label: 'Seoul, KR', source: 'search' } })
    vi.mocked(useCapsuleData).mockReturnValue({ ...READY, isPersonalized: true })
    // Act
    const { container } = render(<AqiCapsule />)
    fireEvent.click(within(container).getByRole('button', { name: /expand for details/i }))
    // Assert
    expect(within(container).queryByText('Use my location')).toBeNull()
    expect(within(container).queryByText(/NOT YOUR LOCATION/)).toBeNull()
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
