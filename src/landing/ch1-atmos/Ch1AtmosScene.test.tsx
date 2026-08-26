// AAA smoke test for the WebGL-unavailable path. jsdom's canvas 2D-only
// `getContext` returns null for 'webgl'/'webgl2', so this exercises the real
// `supportsWebGL()` probe (no mocking) — the same "never a fabricated globe"
// guard a real WebGL-less device would hit. The ready/error data-fetch paths
// are not covered here: they need a `@react-three/fiber` <Canvas> mounted in
// jsdom (no WebGL context) to test meaningfully, which is out of scope for a
// Wave L1 port smoke test.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QualityProvider } from '../shared/perf/QualityProvider'
import Ch1AtmosScene from './Ch1AtmosScene'

beforeEach(() => {
  // QualityProvider's FPS probe uses rAF; stub it so the effect settles
  // without depending on real animation-frame timing in CI.
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    queueMicrotask(() => cb(0))
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Ch1AtmosScene — no WebGL', () => {
  it('renders the static globe fallback instead of a black canvas', () => {
    // Arrange
    const progressRef = { current: 0 }
    // Act
    render(
      <QualityProvider>
        <Ch1AtmosScene progress={0} progressRef={progressRef} />
      </QualityProvider>,
    )
    // Assert — `getByText` throws (failing the test) if the fallback copy
    // isn't present; `@testing-library/jest-dom` isn't set up in this repo,
    // so the match itself (not a `.toBeInTheDocument()` matcher) is the check.
    const fallback = screen.getByText(/showing a static globe instead/i)
    expect(fallback.textContent).toMatch(/showing a static globe instead/i)
  })
})
