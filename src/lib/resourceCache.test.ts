import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { readCached, clearResourceCache } from './resourceCache'

const TTL = 1000

describe('readCached', () => {
  beforeEach(() => {
    clearResourceCache()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('coalesces concurrent callers into a single loader call', async () => {
    // Arrange
    let resolve!: (v: string) => void
    const loader = vi.fn(() => new Promise<string>((r) => { resolve = r }))
    // Act
    const a = readCached('k', loader, TTL)
    const b = readCached('k', loader, TTL)
    resolve('value')
    // Assert
    expect(await a).toBe('value')
    expect(await b).toBe('value')
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('serves the cached value while inside the TTL', async () => {
    // Arrange
    const loader = vi.fn(async () => 'first')
    await readCached('k', loader, TTL)
    // Act
    vi.advanceTimersByTime(TTL - 1)
    const again = await readCached('k', loader, TTL)
    // Assert
    expect(again).toBe('first')
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('reloads once the TTL has elapsed', async () => {
    // Arrange
    let n = 0
    const loader = vi.fn(async () => `load-${++n}`)
    await readCached('k', loader, TTL)
    // Act
    vi.advanceTimersByTime(TTL)
    const again = await readCached('k', loader, TTL)
    // Assert
    expect(again).toBe('load-2')
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('keys are independent', async () => {
    // Arrange
    const loader = vi.fn(async () => 'v')
    // Act
    await readCached('a', loader, TTL)
    await readCached('b', loader, TTL)
    // Assert
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('does not cache a rejection, and retries on the next call', async () => {
    // Arrange — a failed feed must stay retryable, not be pinned for the TTL.
    const loader = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce('recovered')
    // Act
    await expect(readCached('k', loader, TTL)).rejects.toThrow('network')
    const second = await readCached('k', loader, TTL)
    // Assert
    expect(second).toBe('recovered')
    expect(loader).toHaveBeenCalledTimes(2)
  })
})
