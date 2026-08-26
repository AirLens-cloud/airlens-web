/**
 * useDataHealth — polls the mac free-tier CDN's `health.json` and keeps
 * `dataHealthStore` current. Ported verbatim from AirLens-platform apps/web
 * `src/hooks/useDataHealth.ts`.
 *
 * A failed poll (network error, non-2xx, malformed JSON) leaves the store
 * untouched — last-good over fabricated-bad. One missed poll doesn't flip
 * the whole app to "degraded".
 */
import { useEffect } from 'react'
import { SNAPSHOT_CDN_BASE } from '../lib/config/dataSources'
import { DATA_HEALTH_CONFIG } from '../lib/config/dataHealth'
import { parseCdnHealthDoc } from '../lib/dataHealth'
import { useDataHealthStore } from '../store/dataHealthStore'

async function pollOnce(): Promise<void> {
  try {
    const res = await fetch(`${SNAPSHOT_CDN_BASE}/health.json`, {
      signal: AbortSignal.timeout(DATA_HEALTH_CONFIG.fetchTimeoutMs),
    })
    if (!res.ok) return
    const json: unknown = await res.json()
    const feeds = parseCdnHealthDoc(json, Date.now())
    if (Object.keys(feeds).length === 0) return
    useDataHealthStore.getState().setFeeds(feeds, Date.now())
  } catch {
    // Network error / timeout / bad JSON — keep the last-known feeds.
  }
}

/** Mount once to start the 30-minute poll. Safe to mount more than once —
 *  each instance just re-polls on its own timer, all writing into the same
 *  store. */
export function useDataHealth(): void {
  useEffect(() => {
    void pollOnce()
    const timer = setInterval(() => {
      void pollOnce()
    }, DATA_HEALTH_CONFIG.pollIntervalMs)
    return () => clearInterval(timer)
  }, [])
}
