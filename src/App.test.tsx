// Route-level check: FluidChrome (and the AQI capsule it mounts) wraps only
// /landing and /globe, never /design or the default DataProbe. Heavy page
// internals (LandingFlight's chapter scenes, AqiCapsule's own data/motion
// wiring) are stubbed out here — they have their own dedicated coverage —
// so this test stays scoped to App.tsx's routing decision.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'

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

import App from './App'

function setPath(path: string): void {
  window.history.pushState({}, '', path)
}

afterEach(() => {
  cleanup()
  setPath('/')
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

  it('renders Today (not FluidChrome) on /today', () => {
    // Arrange — Today is its own briefing/decision surface (own HUD + Answer
    // hero), so it is not wrapped in FluidChrome — same reasoning as Home,
    // and the reason /insights and /globe are (they have no such hero).
    setPath('/today')
    // Act
    const { queryByTestId } = render(<App />)
    // Assert
    expect(queryByTestId('fluid-chrome-overlay')).toBeNull()
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

  it('renders the capsule in its day variant on /insights, night on /landing — /today has none of its own', () => {
    // Arrange / Act — /insights keeps its light Paper-Ink day tint; /landing
    // keeps the default night variant unchanged. /today mounts no capsule at
    // all (its own HUD/Answer hero is the readout — see the FluidChrome test
    // above), so there is nothing to assert a variant on there.
    // render() queries default to document.body, so each render must be
    // cleaned up before the next to avoid picking up both mock capsules.
    setPath('/insights')
    const insights = render(<App />)
    const insightsVariant = insights.getByTestId('mock-capsule').getAttribute('data-variant')
    cleanup()

    setPath('/landing')
    const landing = render(<App />)
    const landingVariant = landing.getByTestId('mock-capsule').getAttribute('data-variant')

    // Assert
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
