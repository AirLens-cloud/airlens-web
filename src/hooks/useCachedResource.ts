/**
 * useCachedResource — React binding over `lib/resourceCache`.
 *
 * The ported Globe layers reach for their feeds through this hook the way the
 * monorepo's do through `useQuery`: many callers, one request. A rejected
 * loader leaves the fallback in place, matching those layers'
 * data-independent-load contract — a failed feed must not blank the scene.
 */
import { useEffect, useState } from 'react'
import { readCached } from '../lib/resourceCache'

/**
 * Subscribe to a cached resource. Returns `fallback` until the first load
 * settles, and again on failure — callers that must tell "no data" from "load
 * failed" should encode that in `T` (see `api/predictions.ts`'s
 * `CityPredictionsResult`) rather than reading it out of this hook.
 */
export function useCachedResource<T>(
  key: string,
  loader: () => Promise<T>,
  ttlMs: number,
  fallback: T,
): T {
  // Seeded from `fallback` rather than peeked out of the cache during render:
  // the freshness test needs `Date.now()`, which is impure and belongs in the
  // effect below. A cache hit still costs no request — `readCached` resolves
  // immediately, so the real value lands in the very next microtask.
  const [value, setValue] = useState<T>(fallback)

  useEffect(() => {
    let cancelled = false
    readCached(key, loader, ttlMs)
      .then((v) => {
        if (!cancelled) setValue(v)
      })
      .catch(() => {
        /* keep the fallback — a failed feed must not blank the scene */
      })
    return () => {
      cancelled = true
    }
    // `loader` is intentionally not a dependency: callers pass module-level
    // functions, and `key` is the identity that matters for the cache.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ttlMs])

  return value
}
