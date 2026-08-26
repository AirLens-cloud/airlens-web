// AAA smoke test for the pre-data-resolved path. jsdom has no global `fetch`,
// so `useSeoulData`'s fetch calls reject asynchronously — this test asserts
// the *synchronous* pre-fetch render (the loading placeholder), the same
// "never a fabricated skyline" guard Ch1's and Ch2's own smoke tests check
// for their own pre-resolved/WebGL-less paths. The webgl branch itself is not
// exercised here: jsdom's canvas has neither a 'webgl'/'webgl2' 2D context, so
// `supportsWebGL()` always resolves false in this environment regardless of
// which branch a real browser would take — but the loading check returns
// before that branch is ever evaluated, so this test doesn't depend on it.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QualityProvider } from '../shared/perf/QualityProvider'
import Ch3AirshedScene from './Ch3AirshedScene'

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

describe('Ch3AirshedScene — before data resolves', () => {
  it('renders the loading placeholder instead of a blank stage', () => {
    // Arrange
    const progressRef = { current: 0 }
    // Act
    render(
      <QualityProvider>
        <Ch3AirshedScene progress={0} progressRef={progressRef} />
      </QualityProvider>,
    )
    // Assert
    const loading = screen.getByText(/loading seoul's air/i)
    expect(loading.textContent).toMatch(/loading seoul's air/i)
  })
})
