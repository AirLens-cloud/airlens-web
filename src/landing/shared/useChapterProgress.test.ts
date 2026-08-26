/**
 * useChapterProgress — AAA tests. jsdom's `requestAnimationFrame` is
 * timer-based and doesn't advance predictably with fake timers, so rAF is
 * stubbed via a microtask (a synchronous inline call would run the callback
 * before the hook finishes assigning the rAF id, corrupting its own
 * re-entrancy guard) — the throttling itself is not under test here, only
 * the progress math and event wiring. `flushRaf()` awaits past that
 * microtask so the rAF-throttled `progress` state has committed.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { RefObject } from 'react'
import { useChapterProgress } from './useChapterProgress'

const VIEWPORT_HEIGHT = 800

// Plain reassignment (not `vi.spyOn`, which errors on a property that's
// already spied) so a test can move the mocked rect more than once.
function mockRect(el: HTMLElement, top: number, height: number) {
  el.getBoundingClientRect = () => ({
    top,
    height,
    bottom: top + height,
    left: 0,
    right: 0,
    width: 0,
    x: 0,
    y: top,
    toJSON: () => ({}),
  })
}

function refTo(el: HTMLElement | null): RefObject<HTMLElement | null> {
  return { current: el }
}

async function flushRaf() {
  await act(async () => {
    await Promise.resolve()
  })
}

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    queueMicrotask(() => cb(0))
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  Object.defineProperty(window, 'innerHeight', { value: VIEWPORT_HEIGHT, configurable: true })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('useChapterProgress', () => {
  it('reports 0 when the section top has just reached the viewport bottom', async () => {
    // Arrange — rect.top === viewportHeight (section entering from below)
    const el = document.createElement('section')
    mockRect(el, VIEWPORT_HEIGHT, 2000)
    // Act
    const { result } = renderHook(() => useChapterProgress(refTo(el)))
    await flushRaf()
    // Assert
    expect(result.current.progress).toBe(0)
    expect(result.current.progressRef.current).toBe(0)
  })

  it('reports 1 when the section bottom has just reached the viewport top', async () => {
    // Arrange — rect.top === -height (section exiting past the top)
    const height = 2000
    const el = document.createElement('section')
    mockRect(el, -height, height)
    // Act
    const { result } = renderHook(() => useChapterProgress(refTo(el)))
    await flushRaf()
    // Assert
    expect(result.current.progress).toBe(1)
  })

  it('updates progressRef and progress on scroll, clamped to [0, 1]', async () => {
    // Arrange — start at 0, then move to a mid-travel position
    const height = 2000
    const el = document.createElement('section')
    mockRect(el, VIEWPORT_HEIGHT, height)
    const { result } = renderHook(() => useChapterProgress(refTo(el)))
    await flushRaf()
    expect(result.current.progress).toBe(0)
    // Act — scroll halfway through the element's travel span
    const span = VIEWPORT_HEIGHT + height
    mockRect(el, VIEWPORT_HEIGHT - span / 2, height)
    act(() => {
      window.dispatchEvent(new Event('scroll'))
    })
    await flushRaf()
    // Assert
    expect(result.current.progress).toBeCloseTo(0.5, 5)
    expect(result.current.progressRef.current).toBeCloseTo(0.5, 5)
  })

  it('clamps beyond-range positions instead of exceeding [0, 1]', async () => {
    // Arrange
    const height = 2000
    const el = document.createElement('section')
    mockRect(el, VIEWPORT_HEIGHT, height)
    const { result } = renderHook(() => useChapterProgress(refTo(el)))
    await flushRaf()
    // Act — scroll far past the exit point
    mockRect(el, -(height * 3), height)
    act(() => {
      window.dispatchEvent(new Event('scroll'))
    })
    await flushRaf()
    // Assert
    expect(result.current.progress).toBe(1)
  })

  it('stays at 0 and never throws when ref.current is null (SSR / unmounted)', async () => {
    // Arrange / Act
    const { result } = renderHook(() => useChapterProgress(refTo(null)))
    await flushRaf()
    window.dispatchEvent(new Event('scroll'))
    await flushRaf()
    // Assert
    expect(result.current.progress).toBe(0)
  })

  it('removes scroll/resize listeners on unmount', () => {
    // Arrange
    const el = document.createElement('section')
    mockRect(el, VIEWPORT_HEIGHT, 2000)
    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => useChapterProgress(refTo(el)))
    const scrollCalls = addSpy.mock.calls.filter(([type]) => type === 'scroll').length
    const resizeCalls = addSpy.mock.calls.filter(([type]) => type === 'resize').length
    // Act
    unmount()
    // Assert
    expect(scrollCalls).toBeGreaterThan(0)
    expect(resizeCalls).toBeGreaterThan(0)
    expect(removeSpy.mock.calls.filter(([type]) => type === 'scroll').length).toBe(scrollCalls)
    expect(removeSpy.mock.calls.filter(([type]) => type === 'resize').length).toBe(resizeCalls)
  })
})
