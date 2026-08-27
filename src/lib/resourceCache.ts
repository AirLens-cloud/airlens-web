/**
 * resourceCache — request coalescing + TTL memory cache.
 *
 * The slice of TanStack Query the ported Globe tree actually relied on: one
 * in-flight request per key and a shared TTL cache, so five layers asking for
 * the same feed produce one network request. This repo has no query client
 * (adding one for a handful of call sites would be the larger change), so the
 * guarantee lives here instead.
 *
 * Deliberately not a query library: no refetch-on-focus, no retry, no
 * mutation. It sits in `lib/` rather than `hooks/` because `api/` modules read
 * it too, and `api/` must not depend on `hooks/`.
 */

interface Entry<T> {
  value: T
  fetchedAt: number
}

const cache = new Map<string, Entry<unknown>>()
const inflight = new Map<string, Promise<unknown>>()

/** Cache hit within `ttlMs` → cached value; otherwise one shared in-flight request. */
export async function readCached<T>(
  key: string,
  loader: () => Promise<T>,
  ttlMs: number,
): Promise<T> {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.fetchedAt < ttlMs) return hit.value as T

  const pending = inflight.get(key)
  if (pending) return pending as Promise<T>

  const p = loader()
    .then((value) => {
      cache.set(key, { value, fetchedAt: Date.now() })
      return value
    })
    .finally(() => {
      inflight.delete(key)
    })
  inflight.set(key, p)
  return p as Promise<T>
}

/** Test seam — drops every cached value and in-flight handle. */
export function clearResourceCache(): void {
  cache.clear()
  inflight.clear()
}
