import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { detectGlassTier, __resetGlassTierForTest } from './glassTier'

beforeEach(() => {
  __resetGlassTierForTest()
})

afterEach(() => {
  vi.unstubAllGlobals()
  __resetGlassTierForTest()
})

describe('detectGlassTier', () => {
  it('falls back to tint in this repo\'s default jsdom (no matchMedia, no CSS.supports)', () => {
    // Arrange / Act
    const tier = detectGlassTier()
    // Assert
    expect(tier).toBe('tint')
  })

  it('caches the result — a second call does not re-run detection', () => {
    // Arrange
    const first = detectGlassTier()
    // Act: flip the environment after the first call: if detection re-ran,
    // this would flip the tier too.
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    const second = detectGlassTier()
    // Assert
    expect(second).toBe(first)
  })

  it('returns tint when prefers-reduced-transparency is set, even on Chromium', () => {
    // Arrange
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 Chrome/120.0 Safari/537.36' })
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('reduced-transparency'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    vi.stubGlobal('CSS', { supports: () => true })
    // Act
    const tier = detectGlassTier()
    // Assert
    expect(tier).toBe('tint')
  })

  it('returns refract on Chromium with backdrop-filter support', () => {
    // Arrange
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 Chrome/120.0 Safari/537.36' })
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    vi.stubGlobal('CSS', { supports: (prop: string) => prop === 'backdrop-filter' })
    // Act
    const tier = detectGlassTier()
    // Assert
    expect(tier).toBe('refract')
  })

  it('returns blur on a non-Chromium browser with backdrop-filter support (e.g. Safari)', () => {
    // Arrange
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    })
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    vi.stubGlobal('CSS', { supports: (prop: string) => prop === '-webkit-backdrop-filter' })
    // Act
    const tier = detectGlassTier()
    // Assert
    expect(tier).toBe('blur')
  })

  it('returns tint when nothing supports backdrop-filter', () => {
    // Arrange
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' })
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    vi.stubGlobal('CSS', { supports: () => false })
    // Act
    const tier = detectGlassTier()
    // Assert
    expect(tier).toBe('tint')
  })
})
