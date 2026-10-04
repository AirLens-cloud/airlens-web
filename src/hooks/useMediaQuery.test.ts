import { describe, it, expect, afterEach, vi } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { useMediaQuery } from './useMediaQuery'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** A controllable `matchMedia`: `set(true)` flips the match and fires `change` like a real resize. */
function stubMatchMedia(initial: boolean) {
  let matches = initial
  const listeners = new Set<() => void>()
  const queries: string[] = []
  vi.stubGlobal('matchMedia', (query: string) => {
    queries.push(query)
    return {
      get matches() {
        return matches
      },
      media: query,
      addEventListener: (_type: string, cb: () => void) => listeners.add(cb),
      removeEventListener: (_type: string, cb: () => void) => listeners.delete(cb),
    }
  })
  return {
    queries,
    listeners,
    set(next: boolean) {
      matches = next
      listeners.forEach((cb) => cb())
    },
  }
}

describe('useMediaQuery', () => {
  it('reports the current match for the query it was given', () => {
    // Arrange
    const mm = stubMatchMedia(true)
    // Act
    const { result } = renderHook(() => useMediaQuery('(max-width: 768px)'))
    // Assert
    expect(result.current).toBe(true)
    expect(mm.queries).toContain('(max-width: 768px)')
  })

  it('follows the viewport when the query starts or stops matching', () => {
    // Arrange
    const mm = stubMatchMedia(false)
    const { result } = renderHook(() => useMediaQuery('(max-width: 768px)'))
    expect(result.current).toBe(false)
    // Act — a phone rotated into portrait
    act(() => mm.set(true))
    // Assert
    expect(result.current).toBe(true)
    // Act — and back
    act(() => mm.set(false))
    // Assert
    expect(result.current).toBe(false)
  })

  it('stops listening once unmounted', () => {
    // Arrange
    const mm = stubMatchMedia(false)
    const { unmount } = renderHook(() => useMediaQuery('(max-width: 768px)'))
    expect(mm.listeners.size).toBe(1)
    // Act
    unmount()
    // Assert
    expect(mm.listeners.size).toBe(0)
  })

  it('is false, without throwing, where matchMedia does not exist', () => {
    // Arrange — jsdom ships no working matchMedia unless a test stubs one;
    // the property can still exist with a non-function value
    vi.stubGlobal('matchMedia', undefined)
    // Act
    const { result } = renderHook(() => useMediaQuery('(max-width: 768px)'))
    // Assert
    expect(result.current).toBe(false)
  })
})
