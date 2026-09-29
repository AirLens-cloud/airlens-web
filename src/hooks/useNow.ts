/**
 * useNow — the wall clock behind elapsed-time labels ("obs age", "Updated
 * N ago"). Re-reads `Date.now()` every `intervalMs`, and at once when the
 * tab becomes visible again or the browser comes back online — so a tab left
 * open (or offline) never keeps showing the age a reading had at mount
 * (GNET1: `/today` and Home used to freeze it in a lazy `useState`).
 *
 * Only the clock moves; nothing is refetched here. A reading that is not
 * refreshed therefore reads as older and older — the honest outcome.
 */
import { useEffect, useState } from 'react'
import { ELAPSED_LABEL_TICK_MS } from '../lib/config/readingCadence'

export function useNow(intervalMs: number = ELAPSED_LABEL_TICK_MS): number {
  // Lazy initializer: the one non-deterministic read at mount the render
  // purity lint allows; every later read happens in the effect below.
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const refresh = () => setNow(Date.now())
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    const id = window.setInterval(refresh, intervalMs)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('online', refresh)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('online', refresh)
    }
  }, [intervalMs])

  return now
}
