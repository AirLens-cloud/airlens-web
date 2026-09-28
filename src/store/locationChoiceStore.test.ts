// AAA coverage for locationChoiceStore: null-until-chosen default, setChoice
// persistence, clearChoice, and localStorage failure tolerance.
//
// The store reads localStorage once, synchronously, at module import (a
// Zustand `create()` initializer) — matching how it runs once at real app
// boot. Each test therefore stubs `window.localStorage` and re-imports the
// module fresh via `vi.resetModules()` so the read happens after the stub is
// in place, the same reason `useGeolocation.test.ts` documents jsdom's
// missing `window.localStorage` here.
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
  // Some tests below `vi.doMock` the approx module for a single import —
  // undo it here so it never leaks into a later test's fresh import.
  vi.doUnmock('../lib/geo/approxLocation')
  vi.resetModules()
})

describe('locationChoiceStore', () => {
  it('defaults to choice=null (never a silent guess) when nothing is stored', async () => {
    // Arrange
    Object.defineProperty(window, 'localStorage', { value: createMemoryStorage(), configurable: true })
    // Act
    const { useLocationChoiceStore } = await import('./locationChoiceStore')
    // Assert
    expect(useLocationChoiceStore.getState().choice).toBeNull()
  })

  it('setChoice updates state and persists to localStorage', async () => {
    // Arrange
    const storage = createMemoryStorage()
    Object.defineProperty(window, 'localStorage', { value: storage, configurable: true })
    const { useLocationChoiceStore } = await import('./locationChoiceStore')
    // Act
    useLocationChoiceStore
      .getState()
      .setChoice({ lat: 37.5665, lon: 126.978, label: 'Seoul, KR', source: 'search' })
    // Assert
    expect(useLocationChoiceStore.getState().choice).toEqual({
      lat: 37.5665,
      lon: 126.978,
      label: 'Seoul, KR',
      source: 'search',
    })
    expect(JSON.parse(storage.getItem('airlens-location-choice')!)).toEqual({
      lat: 37.5665,
      lon: 126.978,
      label: 'Seoul, KR',
      source: 'search',
    })
  })

  it('reloads a persisted search pick on the next module import (simulated app restart)', async () => {
    // Arrange
    const storage = createMemoryStorage()
    Object.defineProperty(window, 'localStorage', { value: storage, configurable: true })
    const first = await import('./locationChoiceStore')
    first.useLocationChoiceStore
      .getState()
      .setChoice({ lat: 48.8566, lon: 2.3522, label: 'Paris, FR', source: 'search' })
    // Act — fresh module instance, same underlying storage (mirrors a reload)
    vi.resetModules()
    const { useLocationChoiceStore: reloadedStore } = await import('./locationChoiceStore')
    // Assert
    expect(reloadedStore.getState().choice).toEqual({
      lat: 48.8566,
      lon: 2.3522,
      label: 'Paris, FR',
      source: 'search',
    })
  })

  it('G1: never writes a geolocation pick to localStorage — memory only', async () => {
    // Arrange
    const storage = createMemoryStorage()
    Object.defineProperty(window, 'localStorage', { value: storage, configurable: true })
    const { useLocationChoiceStore } = await import('./locationChoiceStore')
    // Act
    useLocationChoiceStore
      .getState()
      .setChoice({ lat: 37.5, lon: 127.0, label: 'My location', source: 'geolocation' })
    // Assert — in-memory state has it immediately...
    expect(useLocationChoiceStore.getState().choice).toEqual({
      lat: 37.5,
      lon: 127.0,
      label: 'My location',
      source: 'geolocation',
    })
    // ...but nothing was ever written to disk
    expect(storage.getItem('airlens-location-choice')).toBeNull()
  })

  it('G1: a geolocation pick does not survive a simulated reload', async () => {
    // Arrange
    const storage = createMemoryStorage()
    Object.defineProperty(window, 'localStorage', { value: storage, configurable: true })
    const first = await import('./locationChoiceStore')
    first.useLocationChoiceStore
      .getState()
      .setChoice({ lat: 37.5, lon: 127.0, label: 'My location', source: 'geolocation' })
    // Act — fresh module instance, same underlying storage (mirrors a reload)
    vi.resetModules()
    const { useLocationChoiceStore: reloadedStore } = await import('./locationChoiceStore')
    // Assert — back to null (the honest fallback), not a resurrected pick
    expect(reloadedStore.getState().choice).toBeNull()
  })

  it('G1: a geolocation pick is a true no-op on disk — an earlier persisted search choice survives, and a reload restores it', async () => {
    // Arrange — an earlier session searched a city (persisted)...
    const storage = createMemoryStorage()
    Object.defineProperty(window, 'localStorage', { value: storage, configurable: true })
    const first = await import('./locationChoiceStore')
    first.useLocationChoiceStore
      .getState()
      .setChoice({ lat: 48.8566, lon: 2.3522, label: 'Paris, FR', source: 'search' })
    expect(storage.getItem('airlens-location-choice')).not.toBeNull()
    // Act — ...then this session also tries geolocation. The decision is
    // about not writing the GPS fix to disk, not about erasing the
    // visitor's own earlier explicit choice — the store has no standing to
    // clear a pick it wasn't asked to clear.
    first.useLocationChoiceStore
      .getState()
      .setChoice({ lat: 37.5, lon: 127.0, label: 'My location', source: 'geolocation' })
    // Assert — untouched on disk...
    expect(JSON.parse(storage.getItem('airlens-location-choice')!)).toEqual({
      lat: 48.8566,
      lon: 2.3522,
      label: 'Paris, FR',
      source: 'search',
    })
    // ...and a reload restores the search pick, not the global fallback
    vi.resetModules()
    const { useLocationChoiceStore: reloadedStore } = await import('./locationChoiceStore')
    expect(reloadedStore.getState().choice).toEqual({
      lat: 48.8566,
      lon: 2.3522,
      label: 'Paris, FR',
      source: 'search',
    })
  })

  it('G1: discards a pre-existing geolocation record left over from before this guard shipped', async () => {
    // Arrange — simulates a browser that already had a geolocation choice
    // persisted (Home's CTA wrote these before this store had the guard)
    const storage = createMemoryStorage()
    storage.setItem(
      'airlens-location-choice',
      JSON.stringify({ lat: 37.5, lon: 127.0, label: 'My location', source: 'geolocation' }),
    )
    Object.defineProperty(window, 'localStorage', { value: storage, configurable: true })
    // Act
    const { useLocationChoiceStore } = await import('./locationChoiceStore')
    // Assert — ignored, not resurrected as a stale personalized reading...
    expect(useLocationChoiceStore.getState().choice).toBeNull()
    // ...and self-heals the stale key rather than re-discarding it forever
    expect(storage.getItem('airlens-location-choice')).toBeNull()
  })

  it('clearChoice resets state and removes the stored value', async () => {
    // Arrange
    const storage = createMemoryStorage()
    Object.defineProperty(window, 'localStorage', { value: storage, configurable: true })
    const { useLocationChoiceStore } = await import('./locationChoiceStore')
    useLocationChoiceStore.getState().setChoice({ lat: 1, lon: 2, label: 'X', source: 'search' })
    // Act
    useLocationChoiceStore.getState().clearChoice()
    // Assert
    expect(useLocationChoiceStore.getState().choice).toBeNull()
    expect(storage.getItem('airlens-location-choice')).toBeNull()
  })

  it('falls back to choice=null when localStorage throws (private window etc.)', async () => {
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
    const { useLocationChoiceStore } = await import('./locationChoiceStore')
    // Assert
    expect(useLocationChoiceStore.getState().choice).toBeNull()
  })

  it('ignores a malformed stored payload (missing lat/lon) rather than throwing', async () => {
    // Arrange
    const storage = createMemoryStorage()
    storage.setItem('airlens-location-choice', JSON.stringify({ label: 'broken' }))
    Object.defineProperty(window, 'localStorage', { value: storage, configurable: true })
    // Act
    const { useLocationChoiceStore } = await import('./locationChoiceStore')
    // Assert
    expect(useLocationChoiceStore.getState().choice).toBeNull()
  })

  describe('legacy migration (airlens-weather-location -> airlens-location-choice)', () => {
    it('an existing valid new-key record wins — the legacy key is discarded untouched', async () => {
      // Arrange
      const storage = createMemoryStorage()
      storage.setItem(
        'airlens-location-choice',
        JSON.stringify({ lat: 10, lon: 20, label: 'Existing, XX', source: 'search' }),
      )
      storage.setItem(
        'airlens-weather-location',
        JSON.stringify({ lat: 48.8566, lon: 2.3522, source: 'user', label: 'Paris, FR' }),
      )
      Object.defineProperty(window, 'localStorage', { value: storage, configurable: true })
      // Act
      const { useLocationChoiceStore } = await import('./locationChoiceStore')
      // Assert — new key's own record wins...
      expect(useLocationChoiceStore.getState().choice).toEqual({
        lat: 10,
        lon: 20,
        label: 'Existing, XX',
        source: 'search',
      })
      // ...and the legacy key is gone either way
      expect(storage.getItem('airlens-weather-location')).toBeNull()
    })

    it('a legacy city-search pick (source "user", "<Name>, <CC>" label) is migrated to the new key', async () => {
      // Arrange
      const storage = createMemoryStorage()
      storage.setItem(
        'airlens-weather-location',
        JSON.stringify({ lat: 51.5074, lon: -0.1278, source: 'user', label: 'London, GB' }),
      )
      Object.defineProperty(window, 'localStorage', { value: storage, configurable: true })
      // Act
      const { useLocationChoiceStore } = await import('./locationChoiceStore')
      // Assert
      expect(useLocationChoiceStore.getState().choice).toEqual({
        lat: 51.5074,
        lon: -0.1278,
        label: 'London, GB',
        source: 'search',
      })
      expect(JSON.parse(storage.getItem('airlens-location-choice')!)).toEqual({
        lat: 51.5074,
        lon: -0.1278,
        label: 'London, GB',
        source: 'search',
      })
      expect(storage.getItem('airlens-weather-location')).toBeNull()
    })

    it('a legacy geolocation pick ("My location") is discarded, never migrated', async () => {
      // Arrange
      const storage = createMemoryStorage()
      storage.setItem(
        'airlens-weather-location',
        JSON.stringify({ lat: 37.5, lon: 127.0, source: 'user', label: 'My location' }),
      )
      Object.defineProperty(window, 'localStorage', { value: storage, configurable: true })
      // Act
      const { useLocationChoiceStore } = await import('./locationChoiceStore')
      // Assert
      expect(useLocationChoiceStore.getState().choice).toBeNull()
      expect(storage.getItem('airlens-location-choice')).toBeNull()
      expect(storage.getItem('airlens-weather-location')).toBeNull()
    })

    it.each(['default', 'approx'] as const)(
      'a legacy %s-source record is discarded, never migrated',
      async (source) => {
        // Arrange
        const storage = createMemoryStorage()
        storage.setItem(
          'airlens-weather-location',
          JSON.stringify({ lat: 1, lon: 2, source, label: 'Somewhere, XX' }),
        )
        Object.defineProperty(window, 'localStorage', { value: storage, configurable: true })
        // Act
        const { useLocationChoiceStore } = await import('./locationChoiceStore')
        // Assert
        expect(useLocationChoiceStore.getState().choice).toBeNull()
        expect(storage.getItem('airlens-weather-location')).toBeNull()
      },
    )

    it('a legacy record with non-numeric coordinates is discarded without throwing', async () => {
      // Arrange
      const storage = createMemoryStorage()
      storage.setItem(
        'airlens-weather-location',
        JSON.stringify({ lat: 'not-a-number', lon: 2, source: 'user', label: 'Broken, XX' }),
      )
      Object.defineProperty(window, 'localStorage', { value: storage, configurable: true })
      // Act
      const { useLocationChoiceStore } = await import('./locationChoiceStore')
      // Assert
      expect(useLocationChoiceStore.getState().choice).toBeNull()
      expect(storage.getItem('airlens-weather-location')).toBeNull()
    })

    it('an unparsable (non-JSON) legacy payload is discarded without throwing', async () => {
      // Arrange
      const storage = createMemoryStorage()
      storage.setItem('airlens-weather-location', 'not json at all')
      Object.defineProperty(window, 'localStorage', { value: storage, configurable: true })
      // Act
      const { useLocationChoiceStore } = await import('./locationChoiceStore')
      // Assert
      expect(useLocationChoiceStore.getState().choice).toBeNull()
      expect(storage.getItem('airlens-weather-location')).toBeNull()
    })

    it('privacy: migrating a discarded "My location" record never lands that fix\'s coordinates in any stored key', async () => {
      // Arrange
      const storage = createMemoryStorage()
      const FIX_LAT = 37.123456
      const FIX_LON = 127.654321
      storage.setItem(
        'airlens-weather-location',
        JSON.stringify({ lat: FIX_LAT, lon: FIX_LON, source: 'user', label: 'My location' }),
      )
      Object.defineProperty(window, 'localStorage', { value: storage, configurable: true })
      // Act
      await import('./locationChoiceStore')
      // Assert — scan every remaining key, not just the ones this test expects
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i)
        const value = key ? storage.getItem(key) : null
        if (value === null) continue
        expect(value).not.toContain(String(FIX_LAT))
        expect(value).not.toContain(String(FIX_LON))
      }
    })
  })

  describe('approx / loadApprox / requesting / denied', () => {
    it('starts pending, and loadApprox() resolves it to ready on a successful lookup', async () => {
      // Arrange
      const storage = createMemoryStorage()
      Object.defineProperty(window, 'localStorage', { value: storage, configurable: true })
      const mockGetApprox = vi.fn().mockResolvedValue({ lat: 1, lon: 2, city: 'Testville' })
      vi.doMock('../lib/geo/approxLocation', () => ({ getApproxLocation: mockGetApprox }))
      const { useLocationChoiceStore } = await import('./locationChoiceStore')
      // Assert — pending before any load
      expect(useLocationChoiceStore.getState().approx).toEqual({ status: 'pending' })
      // Act
      useLocationChoiceStore.getState().loadApprox()
      await mockGetApprox.mock.results[0]!.value
      // Assert
      expect(useLocationChoiceStore.getState().approx).toEqual({
        status: 'ready',
        location: { lat: 1, lon: 2, city: 'Testville' },
      })
    })

    it('resolves to failed when the lookup fails (resolves null)', async () => {
      // Arrange
      const storage = createMemoryStorage()
      Object.defineProperty(window, 'localStorage', { value: storage, configurable: true })
      const mockGetApprox = vi.fn().mockResolvedValue(null)
      vi.doMock('../lib/geo/approxLocation', () => ({ getApproxLocation: mockGetApprox }))
      const { useLocationChoiceStore } = await import('./locationChoiceStore')
      // Act
      useLocationChoiceStore.getState().loadApprox()
      await mockGetApprox.mock.results[0]!.value
      // Assert
      expect(useLocationChoiceStore.getState().approx).toEqual({ status: 'failed' })
    })

    it('loadApprox() is idempotent — calling it repeatedly only fetches once (shared across mounted consumers)', async () => {
      // Arrange
      const storage = createMemoryStorage()
      Object.defineProperty(window, 'localStorage', { value: storage, configurable: true })
      const mockGetApprox = vi.fn().mockResolvedValue(null)
      vi.doMock('../lib/geo/approxLocation', () => ({ getApproxLocation: mockGetApprox }))
      const { useLocationChoiceStore } = await import('./locationChoiceStore')
      // Act — simulates two consumers (Home's hero + the floating capsule) mounting together
      useLocationChoiceStore.getState().loadApprox()
      useLocationChoiceStore.getState().loadApprox()
      useLocationChoiceStore.getState().loadApprox()
      // Assert
      expect(mockGetApprox).toHaveBeenCalledTimes(1)
      await mockGetApprox.mock.results[0]!.value
      expect(useLocationChoiceStore.getState().approx).toEqual({ status: 'failed' })
    })

    it('setRequesting and setDenied update their respective flags', async () => {
      // Arrange
      const storage = createMemoryStorage()
      Object.defineProperty(window, 'localStorage', { value: storage, configurable: true })
      const { useLocationChoiceStore } = await import('./locationChoiceStore')
      expect(useLocationChoiceStore.getState().requesting).toBe(false)
      expect(useLocationChoiceStore.getState().denied).toBe(false)
      // Act
      useLocationChoiceStore.getState().setRequesting(true)
      useLocationChoiceStore.getState().setDenied(true)
      // Assert
      expect(useLocationChoiceStore.getState().requesting).toBe(true)
      expect(useLocationChoiceStore.getState().denied).toBe(true)
    })
  })
})
