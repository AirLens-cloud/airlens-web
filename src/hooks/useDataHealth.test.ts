/**
 * useDataHealth — AAA tests (mocked fetch + fake timers). Ported verbatim
 * from AirLens-platform apps/web `src/hooks/useDataHealth.test.ts`.
 *
 * Covers: initial poll on mount, 30-min re-poll cadence, last-good-on-failure
 * (a bad poll must not wipe the store), and interval cleanup on unmount.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useDataHealth } from './useDataHealth'
import { useDataHealthStore } from '../store/dataHealthStore'
import { DATA_HEALTH_CONFIG } from '../lib/config/dataHealth'

const fetchMock = vi.fn()

function okResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response
}
function failedResponse(): Response {
  return { ok: false, status: 500, json: async () => ({}) } as unknown as Response
}

const HEALTH_DOC = {
  generatedAt: '2026-08-19T04:24:41Z',
  sources: {
    cams: { generatedAt: '2026-08-19T04:21:30Z', expiresAt: '2026-08-19T16:21:30Z', servedFrom: 'fresh', available: true },
  },
}

/**
 * A point inside the fixture's valid window (generatedAt 04:21:30Z ~
 * expiresAt 16:21:30Z). Without pinning this, `stale` judgment rides the
 * real wall clock and the test dies the day the fixture's own window expires
 * — nothing else changes. Pin the clock instead of pushing the fixture date out.
 */
const FIXTURE_NOW = new Date('2026-08-19T04:30:00Z')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(FIXTURE_NOW)
  fetchMock.mockReset()
  globalThis.fetch = fetchMock as unknown as typeof fetch
  useDataHealthStore.getState().reset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useDataHealth', () => {
  it('polls health.json once on mount and populates the store', async () => {
    // Arrange
    fetchMock.mockResolvedValue(okResponse(HEALTH_DOC))
    // Act — mount triggers the immediate poll (a microtask chain, no timer
    // involved); flush it with a 0ms fake-timer advance rather than
    // `vi.waitFor` on the mock call count, which would resolve the instant
    // `fetch()` is *invoked* — before its `.then`/`await` chain finishes.
    renderHook(() => useDataHealth())
    await vi.advanceTimersByTimeAsync(0)
    // Assert
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(useDataHealthStore.getState().feeds.cams).toBeDefined()
    expect(useDataHealthStore.getState().feeds.cams.stale).toBe(false)
  })

  it('re-polls after the configured interval elapses', async () => {
    // Arrange
    fetchMock.mockResolvedValue(okResponse(HEALTH_DOC))
    renderHook(() => useDataHealth())
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    // Act
    await vi.advanceTimersByTimeAsync(DATA_HEALTH_CONFIG.pollIntervalMs)
    // Assert
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('a failed poll leaves previously-good feeds untouched (last-good over fabricated-bad)', async () => {
    // Arrange — first poll succeeds, second fails
    fetchMock.mockResolvedValueOnce(okResponse(HEALTH_DOC)).mockResolvedValueOnce(failedResponse())
    renderHook(() => useDataHealth())
    await vi.advanceTimersByTimeAsync(0)
    const afterFirstPoll = useDataHealthStore.getState().feeds
    expect(afterFirstPoll.cams).toBeDefined()
    // Act
    await vi.advanceTimersByTimeAsync(DATA_HEALTH_CONFIG.pollIntervalMs)
    // Assert — store still has the first poll's good data
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(useDataHealthStore.getState().feeds).toEqual(afterFirstPoll)
  })

  it('clears its interval on unmount — no further polls fire', async () => {
    // Arrange
    fetchMock.mockResolvedValue(okResponse(HEALTH_DOC))
    const { unmount } = renderHook(() => useDataHealth())
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    // Act
    unmount()
    await vi.advanceTimersByTimeAsync(DATA_HEALTH_CONFIG.pollIntervalMs * 2)
    // Assert
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
