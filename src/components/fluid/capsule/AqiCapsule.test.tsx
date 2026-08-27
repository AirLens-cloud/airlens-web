import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent, within } from '@testing-library/react'
import AqiCapsule from './AqiCapsule'
import type { CapsuleDataReady } from './useCapsuleData'

vi.mock('./useCapsuleData', () => ({
  useCapsuleData: vi.fn(),
}))

import { useCapsuleData } from './useCapsuleData'

const READY: CapsuleDataReady = {
  status: 'ready',
  city: 'Seoul',
  current: 42,
  tier: 'moderate',
  range: { lo: 30, hi: 55 },
  series24h: Array.from({ length: 24 }, (_, i) => ({
    time: `t${i}`,
    p10: 30 + i,
    p50: 35 + i,
    p90: 40 + i,
  })),
  updatedAt: new Date().toISOString(),
  alert: 'steady',
}

beforeEach(() => {
  vi.mocked(useCapsuleData).mockReturnValue(READY)
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
})
