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

  it('falls back to Home for an unmatched path', () => {
    // Arrange
    setPath('/some-unknown-path')
    // Act
    const { queryByTestId } = render(<App />)
    // Assert
    expect(queryByTestId('page-home')).not.toBeNull()
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

  it('mounts the fluid chrome overlay on /today', () => {
    // Arrange
    setPath('/today')
    // Act
    const { queryByTestId } = render(<App />)
    // Assert
    expect(queryByTestId('fluid-chrome-overlay')).not.toBeNull()
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

  it('renders the capsule in its day variant on /insights, night on /today (obs dark surface) and /landing', () => {
    // Arrange / Act — /insights keeps its light Paper-Ink day tint; /today is
    // an obs dark surface like /globe, so it takes the default night variant.
    // render() queries default to document.body, so each render must be
    // cleaned up before the next to avoid picking up both mock capsules.
    setPath('/today')
    const today = render(<App />)
    const todayVariant = today.getByTestId('mock-capsule').getAttribute('data-variant')
    cleanup()

    setPath('/landing')
    const landing = render(<App />)
    const landingVariant = landing.getByTestId('mock-capsule').getAttribute('data-variant')

    // Assert
    expect(todayVariant).toBe('night')
    expect(landingVariant).toBe('night')
  })
})
