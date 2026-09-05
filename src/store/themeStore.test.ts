// AAA coverage for themeStore: system-default fallback, persist on setMode,
// system removes the stored key instead of writing 'system', a malformed
// stored value falls back to 'system', localStorage failure tolerance, and
// the data-theme attribute this store's whole job is to keep correct.
//
// Same module-reload pattern as locationChoiceStore.test.ts: the store reads
// localStorage once, synchronously, at import (a Zustand `create()`
// initializer), so each test stubs `window.localStorage` and re-imports via
// `vi.resetModules()` so the read happens after the stub is in place.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

function createMemoryStorage(): Storage {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size
    },
  }
}

let originalDescriptor: PropertyDescriptor | undefined

beforeEach(() => {
  originalDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')
  vi.resetModules()
})

afterEach(() => {
  if (originalDescriptor) Object.defineProperty(window, 'localStorage', originalDescriptor)
  else delete (window as { localStorage?: Storage }).localStorage
  delete document.documentElement.dataset.theme
  document.documentElement.classList.remove('theme-transitioning')
  vi.resetModules()
  vi.useRealTimers()
})

describe('themeStore', () => {
  it("defaults to mode='system' (no override) when nothing is stored", async () => {
    // Arrange
    Object.defineProperty(window, 'localStorage', { value: createMemoryStorage(), configurable: true })
    // Act
    const { useThemeStore } = await import('./themeStore')
    // Assert
    expect(useThemeStore.getState().mode).toBe('system')
  })

  it('ignores a malformed stored value rather than throwing', async () => {
    // Arrange
    const storage = createMemoryStorage()
    storage.setItem('airlens-theme', 'sepia')
    Object.defineProperty(window, 'localStorage', { value: storage, configurable: true })
    // Act
    const { useThemeStore } = await import('./themeStore')
    // Assert
    expect(useThemeStore.getState().mode).toBe('system')
  })

  it('falls back to mode=system when localStorage throws (private window etc.)', async () => {
    // Arrange
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: () => {
          throw new Error('storage blocked')
        },
        setItem: () => {
          throw new Error('storage blocked')
        },
      },
      configurable: true,
    })
    // Act
    const { useThemeStore } = await import('./themeStore')
    // Assert
    expect(useThemeStore.getState().mode).toBe('system')
  })

  it('setMode(dark) updates state, persists, and sets data-theme', async () => {
    // Arrange
    const storage = createMemoryStorage()
    Object.defineProperty(window, 'localStorage', { value: storage, configurable: true })
    const { useThemeStore } = await import('./themeStore')
    // Act
    useThemeStore.getState().setMode('dark')
    // Assert
    expect(useThemeStore.getState().mode).toBe('dark')
    expect(storage.getItem('airlens-theme')).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('setMode(system) clears the stored key and removes data-theme', async () => {
    // Arrange
    const storage = createMemoryStorage()
    Object.defineProperty(window, 'localStorage', { value: storage, configurable: true })
    const { useThemeStore } = await import('./themeStore')
    useThemeStore.getState().setMode('light')
    // Act
    useThemeStore.getState().setMode('system')
    // Assert
    expect(useThemeStore.getState().mode).toBe('system')
    expect(storage.getItem('airlens-theme')).toBeNull()
    expect(document.documentElement.dataset.theme).toBeUndefined()
  })

  it('reloads a persisted mode on the next module import (simulated app restart)', async () => {
    // Arrange
    const storage = createMemoryStorage()
    Object.defineProperty(window, 'localStorage', { value: storage, configurable: true })
    const first = await import('./themeStore')
    first.useThemeStore.getState().setMode('light')
    // Act — fresh module instance, same underlying storage (mirrors a reload)
    vi.resetModules()
    const { useThemeStore: reloadedStore } = await import('./themeStore')
    // Assert
    expect(reloadedStore.getState().mode).toBe('light')
  })

  it('applies the theme-transitioning class during the crossfade window, then removes it', async () => {
    // Arrange
    const storage = createMemoryStorage()
    Object.defineProperty(window, 'localStorage', { value: storage, configurable: true })
    const originalMatchMedia = window.matchMedia
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia
    vi.useFakeTimers()
    const { useThemeStore } = await import('./themeStore')
    // Act
    useThemeStore.getState().setMode('dark')
    // Assert — class present immediately, theme already applied
    expect(document.documentElement.classList.contains('theme-transitioning')).toBe(true)
    expect(document.documentElement.dataset.theme).toBe('dark')
    // Act — advance past the 280ms crossfade window
    vi.advanceTimersByTime(280)
    // Assert — class cleared once the transition would have finished
    expect(document.documentElement.classList.contains('theme-transitioning')).toBe(false)
    window.matchMedia = originalMatchMedia
  })

  it('skips the crossfade class when prefers-reduced-motion is set', async () => {
    // Arrange
    const storage = createMemoryStorage()
    Object.defineProperty(window, 'localStorage', { value: storage, configurable: true })
    const originalMatchMedia = window.matchMedia
    window.matchMedia = ((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia
    const { useThemeStore } = await import('./themeStore')
    // Act
    useThemeStore.getState().setMode('light')
    // Assert
    expect(document.documentElement.classList.contains('theme-transitioning')).toBe(false)
    expect(document.documentElement.dataset.theme).toBe('light')
    window.matchMedia = originalMatchMedia
  })
})
