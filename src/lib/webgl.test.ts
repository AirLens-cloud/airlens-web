import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { isWebGLSupported, resetWebGLProbeCache } from './webgl'

beforeEach(() => {
  resetWebGLProbeCache()
})

afterEach(() => {
  vi.restoreAllMocks()
  resetWebGLProbeCache()
})

describe('isWebGLSupported', () => {
  it('reports support when a context can be created', () => {
    // Arrange
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as RenderingContext)
    // Act / Assert
    expect(isWebGLSupported()).toBe(true)
  })

  it('reports no support when every context request comes back empty', () => {
    // Arrange
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    // Act / Assert
    expect(isWebGLSupported()).toBe(false)
  })

  it('treats a throwing getContext as unsupported rather than propagating', () => {
    // Arrange — some drivers throw instead of returning null.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      throw new Error('context creation failed')
    })
    // Act / Assert
    expect(isWebGLSupported()).toBe(false)
  })

  it('probes once and reuses the answer', () => {
    // Arrange — repeated probes can exhaust the driver's context pool.
    const spy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as RenderingContext)
    // Act
    isWebGLSupported()
    isWebGLSupported()
    isWebGLSupported()
    // Assert
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
