/**
 * useNow — the ticking wall clock behind "obs age" / "Updated N ago" (GNET1).
 *
 * The regression this file exists to catch: an elapsed-time label frozen at
 * the moment the page mounted (the old lazy `useState(() => Date.now())`),
 * so a tab left open — or offline — keeps claiming its reading is as fresh
 * as it was at load.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { useNow } from './useNow'
import { ELAPSED_LABEL_TICK_MS } from '../lib/config/readingCadence'

const T0 = new Date('2026-09-29T03:00:00Z').getTime()

function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(T0)
  setVisibility('visible')
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  setVisibility('visible')
})

describe('useNow', () => {
  it('starts at the wall clock of the first render', () => {
    // Arrange / Act
    const { result } = renderHook(() => useNow())
    // Assert
    expect(result.current).toBe(T0)
  })

  it('ticks forward once per minute by default, never staying at the mount time', () => {
    // Arrange
    const { result } = renderHook(() => useNow())
    // Act
    act(() => {
      vi.advanceTimersByTime(ELAPSED_LABEL_TICK_MS)
    })
    const afterOne = result.current
    act(() => {
      vi.advanceTimersByTime(ELAPSED_LABEL_TICK_MS * 9)
    })
    // Assert
    expect(ELAPSED_LABEL_TICK_MS).toBe(60_000)
    expect(afterOne).toBe(T0 + 60_000)
    expect(result.current).toBe(T0 + 10 * 60_000)
  })

  it('does not tick before a full interval has passed', () => {
    // Arrange
    const { result } = renderHook(() => useNow())
    // Act
    act(() => {
      vi.advanceTimersByTime(ELAPSED_LABEL_TICK_MS - 1)
    })
    // Assert
    expect(result.current).toBe(T0)
  })

  it('honours a custom interval', () => {
    // Arrange
    const { result } = renderHook(() => useNow(5_000))
    // Act
    act(() => {
      vi.advanceTimersByTime(5_000)
    })
    // Assert
    expect(result.current).toBe(T0 + 5_000)
  })

  it('re-reads the clock at once when the tab becomes visible again', () => {
    // Arrange — the clock moved 7 minutes while no interval fired (a
    // background tab's timers are throttled).
    const { result } = renderHook(() => useNow())
    vi.setSystemTime(T0 + 7 * 60_000)
    // Act
    act(() => {
      setVisibility('visible')
      document.dispatchEvent(new Event('visibilitychange'))
    })
    // Assert
    expect(result.current).toBe(T0 + 7 * 60_000)
  })

  it('ignores a visibilitychange that hides the tab', () => {
    // Arrange
    const { result } = renderHook(() => useNow())
    vi.setSystemTime(T0 + 3 * 60_000)
    // Act
    act(() => {
      setVisibility('hidden')
      document.dispatchEvent(new Event('visibilitychange'))
    })
    // Assert
    expect(result.current).toBe(T0)
  })

  it('re-reads the clock at once when the browser comes back online', () => {
    // Arrange
    const { result } = renderHook(() => useNow())
    vi.setSystemTime(T0 + 42 * 60_000)
    // Act
    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    // Assert
    expect(result.current).toBe(T0 + 42 * 60_000)
  })

  it('stops its interval and removes the very listeners it added on unmount', () => {
    // Arrange — capture the handlers actually registered, so removing some
    // other function (which would leak the real listener) fails here.
    const addDoc = vi.spyOn(document, 'addEventListener')
    const addWin = vi.spyOn(window, 'addEventListener')
    const removeDoc = vi.spyOn(document, 'removeEventListener')
    const removeWin = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => useNow())
    const addedVisibility = addDoc.mock.calls.find(([type]) => type === 'visibilitychange')?.[1]
    const addedOnline = addWin.mock.calls.find(([type]) => type === 'online')?.[1]
    // Act
    unmount()
    // Assert
    expect(vi.getTimerCount()).toBe(0)
    expect(addedVisibility).toBeTypeOf('function')
    expect(addedOnline).toBeTypeOf('function')
    expect(removeDoc).toHaveBeenCalledWith('visibilitychange', addedVisibility)
    expect(removeWin).toHaveBeenCalledWith('online', addedOnline)
    for (const spy of [addDoc, addWin, removeDoc, removeWin]) spy.mockRestore()
  })
})
