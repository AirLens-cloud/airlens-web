import { useCallback, useSyncExternalStore } from 'react'

function hasMatchMedia(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
}

/**
 * useMediaQuery — whether a media query matches right now, kept live as the
 * viewport changes (rotation, window resize). Build the query from
 * `src/lib/breakpoints.ts` (`maxWidthQuery(BP.LG)`), never a literal — the
 * design-lint breakpoint axis enforces the canonical set in JS too.
 *
 * False wherever `matchMedia` does not exist (server render, jsdom without a
 * stub), so a caller's wide-viewport layout is the fallback.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!hasMatchMedia()) return () => {}
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    [query],
  )
  return useSyncExternalStore(
    subscribe,
    () => hasMatchMedia() && window.matchMedia(query).matches,
    () => false,
  )
}
