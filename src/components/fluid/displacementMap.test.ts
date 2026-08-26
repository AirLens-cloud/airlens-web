import { describe, it, expect, afterEach, vi } from 'vitest'
import { edgeProfile, buildDisplacementMap } from './displacementMap'

describe('edgeProfile', () => {
  it('is 0 at the bezel depth (dist = -bezel)', () => {
    // Arrange / Act
    const result = edgeProfile(-10, 10)
    // Assert
    expect(result).toBe(0)
  })

  it('approaches 1 as dist approaches the edge (0, exclusive)', () => {
    // Arrange / Act
    const result = edgeProfile(-0.001, 10)
    // Assert
    expect(result).toBeGreaterThan(0.99)
    expect(result).toBeLessThan(1)
  })

  it('is 0 outside the [-bezel, 0) band', () => {
    // Arrange / Act / Assert
    expect(edgeProfile(-11, 10)).toBe(0) // deeper than the bezel
    expect(edgeProfile(0, 10)).toBe(0) // the edge itself is excluded
    expect(edgeProfile(1, 10)).toBe(0) // outside the shape
  })

  it('follows a squared (t^2) falloff, not a linear one', () => {
    // Arrange: dist = -5, bezel = 10 -> t = 0.5 -> t^2 = 0.25
    // Act
    const result = edgeProfile(-5, 10)
    // Assert
    expect(result).toBeCloseTo(0.25, 5)
  })
})

describe('buildDisplacementMap', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('caches by (w,h,radius,bezel) — a repeat call reuses the cached URL without recomputing', () => {
    // Arrange: fake canvas/context so we can count how many times a map is built.
    const fakeCtx = {
      createImageData: vi.fn((w: number, h: number) => ({
        data: new Uint8ClampedArray(w * h * 4),
      })),
      putImageData: vi.fn(),
    }
    const fakeCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => fakeCtx),
      toDataURL: vi.fn(() => 'data:image/png;base64,fake'),
    }
    const createElementSpy = vi
      .spyOn(document, 'createElement')
      .mockReturnValue(fakeCanvas as unknown as HTMLCanvasElement)

    // Act
    const first = buildDisplacementMap(40, 30, 8, 12)
    const second = buildDisplacementMap(40, 30, 8, 12)

    // Assert
    expect(first).toBe('data:image/png;base64,fake')
    expect(second).toBe(first)
    expect(createElementSpy).toHaveBeenCalledTimes(1)
    expect(fakeCanvas.getContext).toHaveBeenCalledTimes(1)
  })

  it('returns a different cache entry for a different key', () => {
    // Arrange
    const fakeCtx = {
      createImageData: vi.fn((w: number, h: number) => ({
        data: new Uint8ClampedArray(w * h * 4),
      })),
      putImageData: vi.fn(),
    }
    let calls = 0
    const fakeCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => fakeCtx),
      toDataURL: vi.fn(() => `data:image/png;base64,fake-${++calls}`),
    }
    vi.spyOn(document, 'createElement').mockReturnValue(fakeCanvas as unknown as HTMLCanvasElement)

    // Act
    const a = buildDisplacementMap(20, 20, 4, 6)
    const b = buildDisplacementMap(21, 20, 4, 6)

    // Assert
    expect(a).not.toBe(b)
  })

  it('returns an empty string when there is no usable 2D context (jsdom default, no `canvas` pkg)', () => {
    // Arrange / Act: real jsdom canvas — no mocking. This repo has no `canvas`
    // npm package installed, so jsdom's getContext('2d') returns null.
    const result = buildDisplacementMap(99, 88, 3, 5)
    // Assert
    expect(result).toBe('')
  })

  it('returns an empty string outside a DOM environment', () => {
    // Arrange
    const originalDocument = globalThis.document
    // @ts-expect-error -- deliberately simulating an SSR environment
    delete globalThis.document
    try {
      // Act
      const result = buildDisplacementMap(999, 999, 1, 1)
      // Assert
      expect(result).toBe('')
    } finally {
      globalThis.document = originalDocument
    }
  })
})
