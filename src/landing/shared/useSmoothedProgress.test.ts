// useSmoothedProgress — AAA tests. Real rAF timing can't be driven
// deterministically by fake timers (same constraint useChapterProgress.test.ts
// documents), so `requestAnimationFrame` is replaced with a tiny FIFO frame
// queue: each `flush(n)` call pops whatever callbacks are currently queued
// and invokes them with a fixed 16ms-per-frame timestamp, iteratively (not
// recursively), so both this hook's own poll loop and `SpringEngine`'s
// internal tick can each reschedule themselves across frames without
// blowing the call stack.
// Vitest's `@testing-library/react` auto-cleanup is not registered globally
// in this repo, so `afterEach(cleanup)` is explicit here — without it a
// prior test's `renderHook` component (and its still-scheduled rAF poll
// loop) never unmounts, and its callback keeps enqueuing itself into
// whichever `requestAnimationFrame` stub a later test installs.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import type { MutableRefObject } from 'react'
import { useSmoothedProgress } from './useSmoothedProgress'

interface FrameQueueEntry {
  id: number
  cb: FrameRequestCallback
}

function makeFrameQueue() {
  let queue: FrameQueueEntry[] = []
  let nextId = 1
  let time = 0
  const raf = (cb: FrameRequestCallback): number => {
    const id = nextId++
    queue.push({ id, cb })
    return id
  }
  const caf = (id: number): void => {
    queue = queue.filter((entry) => entry.id !== id)
  }
  const flush = (frames: number, dtMs = 16): void => {
    for (let i = 0; i < frames; i++) {
      time += dtMs
      const due = queue
      queue = []
      for (const entry of due) entry.cb(time)
    }
  }
  return { raf, caf, flush }
}

function stubReducedMotion(reduced: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduced && query.includes('reduced-motion'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('useSmoothedProgress — reduced motion', () => {
  beforeEach(() => stubReducedMotion(true))

  it('passes the input ref straight through without starting an rAF loop', () => {
    // Arrange
    const rafSpy = vi.fn()
    vi.stubGlobal('requestAnimationFrame', rafSpy)
    const progressRef: MutableRefObject<number> = { current: 0.3 }
    // Act
    const { result } = renderHook(() => useSmoothedProgress(progressRef))
    // Assert — same object identity, no polling started
    expect(result.current).toBe(progressRef)
    expect(result.current.current).toBe(0.3)
    expect(rafSpy).not.toHaveBeenCalled()
  })
})

describe('useSmoothedProgress — motion enabled', () => {
  // One shared queue for the whole block, not a fresh one per test: the
  // module-singleton `SpringEngine` (src/motion/spring.ts) leaves its
  // internal `rafId` set after `.remove()` — in a real browser the frame
  // already scheduled against it still fires once and self-heals `rafId`
  // back to null, but a *new* fake queue swapped in for the next test would
  // abandon that scheduled id forever, permanently wedging `ensureRunning()`
  // into thinking a frame is already pending. Sharing one queue across
  // tests lets that leftover callback actually run (and self-heal) the same
  // way a real browser's rAF would.
  const frames = makeFrameQueue()

  beforeEach(() => {
    stubReducedMotion(false)
    vi.stubGlobal('requestAnimationFrame', frames.raf)
    vi.stubGlobal('cancelAnimationFrame', frames.caf)
  })

  it('lags behind an updated target instead of snapping to it', () => {
    // Arrange
    const progressRef: MutableRefObject<number> = { current: 0 }
    const { result } = renderHook(() => useSmoothedProgress(progressRef))
    // Act — scroll jumps the raw ref to 1, then a handful of frames tick
    progressRef.current = 1
    act(() => {
      frames.flush(3)
    })
    // Assert — moving toward 1, but not there yet (this is the whole point
    // of smoothing: an instant readout would already read 1).
    expect(result.current.current).toBeGreaterThan(0)
    expect(result.current.current).toBeLessThan(1)
  })

  it('converges to the target once enough frames have ticked', () => {
    // Arrange
    const progressRef: MutableRefObject<number> = { current: 0 }
    const { result } = renderHook(() => useSmoothedProgress(progressRef))
    // Act
    progressRef.current = 1
    act(() => {
      frames.flush(120)
    })
    // Assert — settled within the spring's own epsilon of the target.
    expect(result.current.current).toBeCloseTo(1, 1)
  })

  it('idles once the target stops changing — no re-activation after settling', () => {
    // Arrange
    const progressRef: MutableRefObject<number> = { current: 0 }
    const { result } = renderHook(() => useSmoothedProgress(progressRef))
    // Act — converge to the target, then keep the raw ref pinned and run
    // many more frames. Before the fix, the poll loop called spring.set()
    // every frame regardless of whether the target had changed, which
    // re-added the settled spring to `SpringEngine` and perturbed it again.
    progressRef.current = 1
    act(() => {
      frames.flush(120)
    })
    const settledValue = result.current.current
    act(() => {
      frames.flush(50)
    })
    // Assert — value is bit-for-bit unchanged (a settled spring snaps
    // exactly to its target, so any re-activation would be observable).
    expect(result.current.current).toBe(settledValue)
    expect(result.current.current).toBe(1)
  })

  it('returns a different ref object than the raw input (smoothed, not passthrough)', () => {
    // Arrange / Act
    const progressRef: MutableRefObject<number> = { current: 0 }
    const { result } = renderHook(() => useSmoothedProgress(progressRef))
    // Assert
    expect(result.current).not.toBe(progressRef)
  })
})
