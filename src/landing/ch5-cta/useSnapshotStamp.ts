// Tiny data hook for the CTA chapter's one honesty requirement: the
// provenance line must name the real snapshot date, not a hardcoded literal
// that silently goes stale. `loadPm25()` is already resolved by the time a
// visitor scrolls this far (Ch1/Ch4 both fetch it first) — `once()` in
// `loaders.ts` caches by URL, so this call is effectively free.
import { useEffect, useState } from 'react'
import { loadPm25 } from '../shared/data/loaders'

/** `YYYY-MM-DD` (UTC) of the PM2.5 grid's snapshot timestamp, or `null` before it resolves. */
export function useSnapshotStamp(): string | null {
  const [stamp, setStamp] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    loadPm25()
      .then((grid) => {
        if (alive) setStamp(new Date(grid.meta.timestamp).toISOString().slice(0, 10))
      })
      .catch(() => {
        // Honesty over a broken layout: the provenance line just omits the
        // date rather than fabricating one (see Ch5CtaLanding's fallback text).
      })
    return () => {
      alive = false
    }
  }, [])

  return stamp
}
