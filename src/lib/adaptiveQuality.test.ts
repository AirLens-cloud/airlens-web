// AAA coverage for the two adaptive-quality deltas: GPU renderer-string
// scoring in `detectQualityTier` (via injected `probeRenderer`, since jsdom
// implements no real WebGL context) and the `airlens.globe.quality.v1`
// localStorage cache (sig match / mismatch / expiry / storage absent).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { detectQualityTier, persistQualityTier, probeGpuRenderer } from './adaptiveQuality'

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

// Fixed hardware baseline: cores(8)=+3, mem(4)=+2, small screen=+0, no touch
// = 0 → score 5 → 'medium' with no GPU signal. Chosen so a +2 GPU bonus
// promotes to 'high' (score 7) and a -3 penalty demotes to 'low' (score 2),
// giving each branch of the renderer heuristic a visible effect on the tier.
function stubHardwareBaseline() {
  vi.stubGlobal('navigator', { hardwareConcurrency: 8, deviceMemory: 4 })
  vi.stubGlobal('screen', { width: 800, height: 600 })
  vi.stubGlobal('devicePixelRatio', 1)
}

beforeEach(() => {
  stubHardwareBaseline()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('probeGpuRenderer', () => {
  it('never throws and returns null when the environment has no usable WebGL context', () => {
    // Arrange / Act — jsdom's canvas.getContext('webgl'|'webgl2') returns null
    expect(() => probeGpuRenderer()).not.toThrow()
    // Assert
    expect(probeGpuRenderer()).toBeNull()
  })
})

describe('detectQualityTier — GPU renderer scoring', () => {
  it('leaves the hardware-based tier untouched when the probe returns null (safe fallback)', () => {
    // Arrange
    const probeRenderer = () => null
    // Act
    const tier = detectQualityTier({ probeRenderer, storage: null })
    // Assert
    expect(tier).toBe('medium')
  })

  it('forces low immediately for a software renderer (SwiftShader), regardless of hardware score', () => {
    // Arrange
    const probeRenderer = () => 'Google SwiftShader'
    // Act
    const tier = detectQualityTier({ probeRenderer, storage: null })
    // Assert
    expect(tier).toBe('low')
  })

  it('forces low immediately for a software renderer (llvmpipe)', () => {
    // Arrange
    const probeRenderer = () => 'llvmpipe (LLVM 12.0.0, 256 bits)'
    // Act
    const tier = detectQualityTier({ probeRenderer, storage: null })
    // Assert
    expect(tier).toBe('low')
  })

  it('demotes an old mobile GPU (Mali-4xx) below the hardware-only baseline', () => {
    // Arrange
    const probeRenderer = () => 'Mali-400 MP'
    // Act
    const tier = detectQualityTier({ probeRenderer, storage: null })
    // Assert
    expect(tier).toBe('low')
  })

  it('demotes an old mobile GPU (Adreno 3xx) below the hardware-only baseline', () => {
    // Arrange
    const probeRenderer = () => 'Qualcomm Adreno 330'
    // Act
    const tier = detectQualityTier({ probeRenderer, storage: null })
    // Assert
    expect(tier).toBe('low')
  })

  it('demotes the trademark-form driver string "Adreno (TM) 330" the same way', () => {
    // Arrange — 실제 Qualcomm 드라이버가 흔히 노출하는 상표 삽입 형식
    const probeRenderer = () => 'Adreno (TM) 330'
    // Act
    const tier = detectQualityTier({ probeRenderer, storage: null })
    // Assert
    expect(tier).toBe('low')
  })

  it('does not demote a modern Adreno (6xx/7xx) via the 3xx pattern', () => {
    // Arrange
    const baseline = detectQualityTier({ probeRenderer: () => null, storage: null })
    // Act — 6xx 는 3xx 감점 패턴에 걸리면 안 된다 (no-signal 과 동일 결과)
    const tier = detectQualityTier({ probeRenderer: () => 'Adreno (TM) 640', storage: null })
    // Assert
    expect(tier).toBe(baseline)
  })

  it('promotes a strong discrete/integrated GPU (Apple) above the hardware-only baseline', () => {
    // Arrange
    const probeRenderer = () => 'Apple M1 Pro'
    // Act
    const tier = detectQualityTier({ probeRenderer, storage: null })
    // Assert
    expect(tier).toBe('high')
  })

  it('promotes a strong discrete GPU (NVIDIA) above the hardware-only baseline', () => {
    // Arrange
    const probeRenderer = () => 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Direct3D11 vs_5_0 ps_5_0)'
    // Act
    const tier = detectQualityTier({ probeRenderer, storage: null })
    // Assert
    expect(tier).toBe('high')
  })
})

describe('detectQualityTier — localStorage tier cache', () => {
  it('returns the cached tier and skips the probe entirely on a signature match within TTL', () => {
    // Arrange
    const storage = createMemoryStorage()
    const probeRenderer = vi.fn(() => 'Apple M1 Pro') // would score 'high' if it ran
    const sig = '8|4|480000|1' // matches stubHardwareBaseline()
    storage.setItem('airlens.globe.quality.v1', JSON.stringify({ tier: 'low', sig, ts: Date.now() }))
    // Act
    const tier = detectQualityTier({ probeRenderer, storage })
    // Assert
    expect(tier).toBe('low')
    expect(probeRenderer).not.toHaveBeenCalled()
  })

  it('re-detects (and calls the probe) when the signature no longer matches the device', () => {
    // Arrange
    const storage = createMemoryStorage()
    const probeRenderer = vi.fn(() => 'Apple M1 Pro')
    storage.setItem(
      'airlens.globe.quality.v1',
      JSON.stringify({ tier: 'low', sig: 'stale-sig-from-another-device', ts: Date.now() }),
    )
    // Act
    const tier = detectQualityTier({ probeRenderer, storage })
    // Assert
    expect(probeRenderer).toHaveBeenCalledTimes(1)
    expect(tier).toBe('high')
  })

  it('re-detects (and calls the probe) once the cached entry is older than the 30-day TTL', () => {
    // Arrange
    const storage = createMemoryStorage()
    const probeRenderer = vi.fn(() => 'Apple M1 Pro')
    const sig = '8|4|480000|1'
    const THIRTY_ONE_DAYS_MS = 31 * 24 * 60 * 60 * 1000
    storage.setItem(
      'airlens.globe.quality.v1',
      JSON.stringify({ tier: 'low', sig, ts: Date.now() - THIRTY_ONE_DAYS_MS }),
    )
    // Act
    const tier = detectQualityTier({ probeRenderer, storage })
    // Assert
    expect(probeRenderer).toHaveBeenCalledTimes(1)
    expect(tier).toBe('high')
  })

  it('detects fresh every call (never throws) when storage is unavailable', () => {
    // Arrange
    const probeRenderer = vi.fn(() => 'Apple M1 Pro')
    // Act
    const tier = detectQualityTier({ probeRenderer, storage: null })
    // Assert
    expect(probeRenderer).toHaveBeenCalledTimes(1)
    expect(tier).toBe('high')
  })

  it('recovers from a corrupted cache entry by re-detecting instead of throwing', () => {
    // Arrange
    const storage = createMemoryStorage()
    storage.setItem('airlens.globe.quality.v1', 'not valid json{{{')
    const probeRenderer = vi.fn(() => null)
    // Act
    const tier = detectQualityTier({ probeRenderer, storage })
    // Assert
    expect(tier).toBe('medium')
  })

  it('writes the detected tier back to storage for the next visit', () => {
    // Arrange
    const storage = createMemoryStorage()
    const probeRenderer = () => 'Apple M1 Pro'
    // Act
    detectQualityTier({ probeRenderer, storage })
    // Assert
    const raw = storage.getItem('airlens.globe.quality.v1')
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw!) as { tier: string; sig: string; ts: number }
    expect(parsed.tier).toBe('high')
    expect(parsed.sig).toBe('8|4|480000|1')
  })
})

describe('persistQualityTier', () => {
  it('writes {tier, sig, ts} through to the given storage', () => {
    // Arrange
    const storage = createMemoryStorage()
    // Act
    persistQualityTier('low', storage)
    // Assert
    const raw = storage.getItem('airlens.globe.quality.v1')
    const parsed = JSON.parse(raw!) as { tier: string; sig: string; ts: number }
    expect(parsed.tier).toBe('low')
    expect(parsed.sig).toBe('8|4|480000|1')
    expect(typeof parsed.ts).toBe('number')
  })

  it('never throws when storage.setItem throws (private mode / quota)', () => {
    // Arrange
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota exceeded')
      },
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    } as Storage
    // Act / Assert
    expect(() => persistQualityTier('high', storage)).not.toThrow()
  })

  it('is a no-op when storage is null', () => {
    // Arrange / Act / Assert
    expect(() => persistQualityTier('medium', null)).not.toThrow()
  })
})
