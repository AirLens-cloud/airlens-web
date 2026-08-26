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
vi.mock('./pages/GlobePlaceholder', () => ({ default: () => <div data-testid="page-globe" /> }))
vi.mock('./pages/Weather', () => ({ default: () => <div data-testid="page-weather" /> }))
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

  it('does not mount the fluid chrome overlay on the default DataProbe route', () => {
    // Arrange
    setPath('/')
    // Act
    const { queryByTestId } = render(<App />)
    // Assert
    expect(queryByTestId('fluid-chrome-overlay')).toBeNull()
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

  it('mounts the fluid chrome overlay on /weather', () => {
    // Arrange — /weather gets the same site-nav-return capsule as /landing
    // and /globe (weather-review finding); the hero no longer embeds its
    // own AqiCapsule instance, so there is exactly one per page.
    setPath('/weather')
    // Act
    const { queryByTestId } = render(<App />)
    // Assert
    expect(queryByTestId('fluid-chrome-overlay')).not.toBeNull()
    expect(queryByTestId('page-weather')).not.toBeNull()
  })

  it('renders the capsule in its day variant on /weather, night everywhere else', () => {
    // Arrange / Act — /weather's light sky-glass hero needs the day glass
    // tint; /landing and /globe keep the default night variant unchanged.
    // render() queries default to document.body, so each render must be
    // cleaned up before the next to avoid picking up both mock capsules.
    setPath('/weather')
    const weather = render(<App />)
    const weatherVariant = weather.getByTestId('mock-capsule').getAttribute('data-variant')
    cleanup()

    setPath('/landing')
    const landing = render(<App />)
    const landingVariant = landing.getByTestId('mock-capsule').getAttribute('data-variant')

    // Assert
    expect(weatherVariant).toBe('day')
    expect(landingVariant).toBe('night')
  })
})
