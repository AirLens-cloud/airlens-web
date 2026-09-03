// Route-level check: FluidChrome (and the AQI capsule it mounts) wraps only
// /landing and /globe, never /design or the default DataProbe. Heavy page
// internals (LandingFlight's chapter scenes, AqiCapsule's own data/motion
// wiring) are stubbed out here — they have their own dedicated coverage —
// so this test stays scoped to App.tsx's routing decision.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { matchRoute } from './app/router'
import { LEGACY_REDIRECTS } from './app/redirects'

vi.mock('./pages/DataProbe', () => ({ DataProbe: () => <div data-testid="page-data-probe" /> }))
vi.mock('./pages/DesignGallery', () => ({ default: () => <div data-testid="page-design" /> }))
vi.mock('./pages/LandingFlight', () => ({ default: () => <div data-testid="page-landing" /> }))
vi.mock('./pages/Globe', () => ({ default: () => <div data-testid="page-globe" /> }))
vi.mock('./pages/Today', () => ({ default: () => <div data-testid="page-today" /> }))
vi.mock('./pages/Home', () => ({ default: () => <div data-testid="page-home" /> }))
vi.mock('./pages/Insights', () => ({ default: () => <div data-testid="page-insights" /> }))
vi.mock('./pages/NotFound', () => ({ default: () => <div data-testid="page-not-found" /> }))
vi.mock('./components/fluid/capsule/AqiCapsule', () => ({
  default: ({ variant }: { variant?: string }) => (
    <div data-testid="mock-capsule" data-variant={variant ?? 'night'} />
  ),
}))

import App, { routes } from './App'

/**
 * jsdom's `window.location.replace` is not spy-able in place (the property is
 * non-configurable), so the whole `location` object is swapped for one with a
 * mock `replace`. Returns the mock plus a restore function.
 */
function stubLocationReplace(): { replaceMock: ReturnType<typeof vi.fn>; restore: () => void } {
  const originalLocation = window.location
  const replaceMock = vi.fn()
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...originalLocation, replace: replaceMock },
  })
  return {
    replaceMock,
    restore: () =>
      Object.defineProperty(window, 'location', { configurable: true, value: originalLocation }),
  }
}

function setPath(path: string): void {
  window.history.pushState({}, '', path)
}

// Wave 5 Δ5 (B3) — 'site'-chrome routes now mount ChatWidget, whose ChatFAB
// calls useSpring -> useReducedMotion (reads `window.matchMedia`); jsdom
// doesn't implement it. Same stub pattern as Home.test.tsx/Today.test.tsx.
beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('reduced-motion'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
})

afterEach(() => {
  cleanup()
  setPath('/')
  vi.unstubAllGlobals()
})

describe('App — FluidChrome routing', () => {
  it('does not mount the fluid chrome overlay on /design', () => {
    // Arrange
    setPath('/design')
    // Act
    const { queryByTestId } = render(<App />)
    // Assert
    expect(queryByTestId('fluid-chrome-overlay')).toBeNull()
  })

  it('renders Home (not FluidChrome) on the root route', () => {
    // Arrange
    setPath('/')
    // Act
    const { queryByTestId } = render(<App />)
    // Assert — Home is its own briefing surface, not wrapped in FluidChrome
    // (which would mount a second, redundant AqiCapsule readout on top of it).
    expect(queryByTestId('fluid-chrome-overlay')).toBeNull()
    expect(queryByTestId('page-home')).not.toBeNull()
  })

  it('renders DataProbe on /probe (moved off the root route)', () => {
    // Arrange
    setPath('/probe')
    // Act
    const { queryByTestId } = render(<App />)
    // Assert
    expect(queryByTestId('fluid-chrome-overlay')).toBeNull()
    expect(queryByTestId('page-data-probe')).not.toBeNull()
  })

  it('renders NotFound for an unmatched path (no more silent fallback to Home)', () => {
    // Arrange
    setPath('/some-unknown-path')
    // Act
    const { queryByTestId } = render(<App />)
    // Assert
    expect(queryByTestId('page-home')).toBeNull()
    expect(queryByTestId('page-not-found')).not.toBeNull()
  })

  it('mounts the fluid chrome overlay on /landing', () => {
    // Arrange
    setPath('/landing')
    // Act
    const { queryByTestId } = render(<App />)
    // Assert
    expect(queryByTestId('fluid-chrome-overlay')).not.toBeNull()
    expect(queryByTestId('page-landing')).not.toBeNull()
  })

  it('mounts the fluid chrome overlay on /globe', () => {
    // Arrange
    setPath('/globe')
    // Act
    const { queryByTestId } = render(<App />)
    // Assert
    expect(queryByTestId('fluid-chrome-overlay')).not.toBeNull()
    expect(queryByTestId('page-globe')).not.toBeNull()
  })

  it('redirects /weather to /today?tab=conditions (D4 — /weather absorbed into Today) instead of rendering a page', () => {
    // Arrange — /weather is now a redirect shim, not a route; it renders
    // neither the fluid chrome nor any page component. jsdom's
    // `window.location.replace` is not spy-able in place (non-configurable),
    // so the whole `location` object is swapped for one with a mock
    // `replace`, then restored after the assertion.
    setPath('/weather')
    const originalLocation = window.location
    const replaceMock = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, replace: replaceMock },
    })
    // Act
    const { queryByTestId } = render(<App />)
    // Assert
    expect(replaceMock).toHaveBeenCalledWith('/today?tab=conditions')
    expect(queryByTestId('fluid-chrome-overlay')).toBeNull()
    expect(queryByTestId('page-today')).toBeNull()
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
  })

  it('mounts the fluid chrome overlay on /today (Wave 2A — WeatherHero replaced the always-visible PM2.5 HUD/Answer hero, so the floating AqiCapsule no longer doubles it up)', () => {
    // Arrange
    setPath('/today')
    // Act
    const { queryByTestId } = render(<App />)
    // Assert
    expect(queryByTestId('fluid-chrome-overlay')).not.toBeNull()
    expect(queryByTestId('mock-capsule')?.getAttribute('data-variant')).toBe('day')
    expect(queryByTestId('page-today')).not.toBeNull()
  })

  it('mounts the fluid chrome overlay on /insights', async () => {
    // Arrange — the SDID hub is a light Paper-Ink surface, so it takes the same
    // day capsule as /weather rather than the night one. The page itself is
    // lazy (it carries the dotted map's land-point table), so the assertion on
    // it has to await the chunk; the chrome around it is immediate.
    setPath('/insights')
    // Act
    const { queryByTestId, findByTestId } = render(<App />)
    // Assert
    expect(queryByTestId('fluid-chrome-overlay')).not.toBeNull()
    expect(queryByTestId('mock-capsule')?.getAttribute('data-variant')).toBe('day')
    expect(await findByTestId('page-insights')).not.toBeNull()
  })

  it('renders the capsule in its day variant on /today and /insights, night on /landing', () => {
    // Arrange / Act — /today and /insights keep the light Paper-Ink day
    // tint; /landing keeps the default night variant unchanged.
    // render() queries default to document.body, so each render must be
    // cleaned up before the next to avoid picking up both mock capsules.
    setPath('/today')
    const today = render(<App />)
    const todayVariant = today.getByTestId('mock-capsule').getAttribute('data-variant')
    cleanup()

    setPath('/insights')
    const insights = render(<App />)
    const insightsVariant = insights.getByTestId('mock-capsule').getAttribute('data-variant')
    cleanup()

    setPath('/landing')
    const landing = render(<App />)
    const landingVariant = landing.getByTestId('mock-capsule').getAttribute('data-variant')

    // Assert
    expect(todayVariant).toBe('day')
    expect(insightsVariant).toBe('day')
    expect(landingVariant).toBe('night')
  })
})

// PR-N1: App.tsx now wraps every matched route in SiteChrome, which decides
// whether GlobalNav mounts (and in which variant) from the route's `chrome`
// field. This block is scoped to that wrapping decision — GlobalNav's own
// interaction behavior (dropdowns, Escape, aria-current) is covered by
// GlobalNav.test.tsx, not duplicated here.
describe('App — SiteChrome routing (PR-N1)', () => {
  it('mounts GlobalNav and SiteFooter in the site variant on Home', () => {
    // Arrange
    setPath('/')
    // Act
    const { container } = render(<App />)
    // Assert
    expect(container.querySelector('.chrome-nav--site')).not.toBeNull()
    expect(container.querySelector('.chrome-shell--site')).not.toBeNull()
    expect(container.querySelector('.chrome-footer')).not.toBeNull()
  })

  it('mounts GlobalNav in the overlay variant on /globe, with no footer (100vh stage)', () => {
    // Arrange
    setPath('/globe')
    // Act
    const { container } = render(<App />)
    // Assert
    expect(container.querySelector('.chrome-nav--overlay')).not.toBeNull()
    expect(container.querySelector('.chrome-nav--site')).toBeNull()
    expect(container.querySelector('.chrome-footer')).toBeNull()
  })

  it('mounts no chrome at all on /landing (bare — the immersive flight owns its own chrome)', () => {
    // Arrange
    setPath('/landing')
    // Act
    const { container, queryByTestId } = render(<App />)
    // Assert
    expect(container.querySelector('.chrome-nav')).toBeNull()
    expect(container.querySelector('.chrome-shell')).toBeNull()
    expect(queryByTestId('page-landing')).not.toBeNull()
  })

  it('mounts no chrome on /design and /probe (bare dev-only surfaces)', () => {
    // Arrange / Act
    setPath('/design')
    const design = render(<App />)
    const designChrome = design.container.querySelector('.chrome-nav')
    cleanup()

    setPath('/probe')
    const probe = render(<App />)
    const probeChrome = probe.container.querySelector('.chrome-nav')

    // Assert
    expect(designChrome).toBeNull()
    expect(probeChrome).toBeNull()
  })

  it('gives NotFound the site chrome (a recovery surface, not another dead end)', () => {
    // Arrange
    setPath('/some-unknown-path')
    // Act
    const { container, queryByTestId } = render(<App />)
    // Assert
    expect(container.querySelector('.chrome-nav--site')).not.toBeNull()
    expect(queryByTestId('page-not-found')).not.toBeNull()
  })
})

// Legacy path redirects — `WEB_PRD.md:871` keeps all six ("Redirect 6종 (전부
// 유지) — 옛 링크·SEO 호환"). They were never ported into this repo, so every
// one of them landed on NotFound; these tests are the gate that they resolve.
describe('App — legacy redirects (WEB_PRD §3.14.1)', () => {
  const SIX = [
    { from: '/our-story', to: '/about' },
    { from: '/policy', to: '/insights' },
    { from: '/analytics', to: '/insights' },
    { from: '/news', to: '/dispatch' },
    { from: '/camera', to: '/today' },
    { from: '/legal', to: '/legal/privacy' },
  ]

  it.each(SIX)('redirects $from to $to instead of falling through to NotFound', ({ from, to }) => {
    // Arrange
    setPath(from)
    const { replaceMock, restore } = stubLocationReplace()
    try {
      // Act
      const { queryByTestId } = render(<App />)
      // Assert — the shim replaces (never pushes) so the dead URL stays out of
      // history, and it renders nothing: no page, no NotFound flash.
      expect(replaceMock).toHaveBeenCalledWith(to)
      expect(queryByTestId('page-not-found')).toBeNull()
    } finally {
      // `finally` so a failed assertion does not leak the stubbed location
      // into the tests that follow and turn one red into a cascade.
      restore()
    }
  })

  it('points every redirect at a path that is itself a real route', () => {
    // A redirect whose target 404s is worse than no redirect — it costs the
    // visitor an extra hop to reach the same dead end.
    const broken = LEGACY_REDIRECTS.filter(
      ({ to }) => matchRoute(to.split('?')[0], routes) === null,
    ).map(({ from, to }) => `${from} -> ${to}`)
    expect(broken, `redirect targets with no matching route: ${broken.join(', ')}`).toEqual([])
  })

  it('registers each redirect source exactly once in the route table', () => {
    // matchRoute takes the first hit, so a duplicate path — a redirect shim
    // sitting in front of a real page, or two shims for one source — would
    // silently swallow whichever entry comes second.
    const duplicates = routes
      .map((route) => route.path)
      .filter((path, i, all) => all.indexOf(path) !== i)
    expect(duplicates, `paths registered more than once: ${duplicates.join(', ')}`).toEqual([])
  })
})
