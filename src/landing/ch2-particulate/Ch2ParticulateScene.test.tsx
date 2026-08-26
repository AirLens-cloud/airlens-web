// AAA smoke test for the pre-data-resolved path. Unlike Ch1AtmosScene (a
// WebGL-only globe gated on `supportsWebGL()`), PARTICULATE has no upfront
// capability gate — the loading/error/empty states are what a WebGL2-less
// jsdom actually exercises here (jsdom has neither a 'webgl'/'webgl2' 2D
// context nor a global `fetch`, so `useParticulateData`'s fetch call would
// reject asynchronously — this test asserts the *synchronous* pre-fetch
// render, the same "never a fabricated field" guard Ch1's test checks for
// its own WebGL-less path).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QualityProvider } from '../shared/perf/QualityProvider'
import Ch2ParticulateScene from './Ch2ParticulateScene'

beforeEach(() => {
  // QualityProvider's FPS probe uses rAF; stub it so the effect settles
  // without depending on real animation-frame timing in CI.
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    queueMicrotask(() => cb(0))
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  // jsdom in this repo's vitest config has no `matchMedia` — unlike Ch1's
  // no-WebGL smoke test (whose early `!webgl` return never reaches
  // `useReducedMotion`), this scene calls `useReducedMotion()` unconditionally
  // before its own loading/error/empty branches, so the stub is needed here.
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Ch2ParticulateScene — before data resolves', () => {
  it('renders the loading placeholder instead of a blank stage', () => {
    // Arrange
    const progressRef = { current: 0 }
    // Act
    render(
      <QualityProvider>
        <Ch2ParticulateScene progress={0} progressRef={progressRef} />
      </QualityProvider>,
    )
    // Assert
    const loading = screen.getByText(/loading the particulate field/i)
    expect(loading.textContent).toMatch(/loading the particulate field/i)
  })
})
