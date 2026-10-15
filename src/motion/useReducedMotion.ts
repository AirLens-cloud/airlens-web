// Ported verbatim from AirLens-platform apps/landing-lab
// `src/shared/perf/useReducedMotion.ts` (Wave L0, 2026-08-26).
import { useEffect, useState } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

// SSR-safe: defaults to false, subscribes to the media query on mount.
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() =>
    typeof window !== 'undefined' && 'matchMedia' in window
      ? window.matchMedia(QUERY).matches
      : false,
  )

  useEffect(() => {
    if (typeof window === 'undefined' || !('matchMedia' in window)) return
    const mql = window.matchMedia(QUERY)
    const onChange = () => setReduced(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return reduced
}
