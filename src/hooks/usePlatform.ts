import { useEffect, useState } from 'react'
import { BP } from '../lib/breakpoints'

export type PlatformKind = 'mobile' | 'tablet' | 'desktop'

interface PlatformState {
  kind: PlatformKind
  isTouch: boolean
  prefersReducedMotion: boolean
}

function detect(): PlatformState {
  if (typeof window === 'undefined') {
    return { kind: 'desktop', isTouch: false, prefersReducedMotion: false }
  }
  const w = window.innerWidth
  const kind: PlatformKind = w < BP.MD ? 'mobile' : w < BP.XL ? 'tablet' : 'desktop'
  const isTouch = window.matchMedia('(hover: none) and (pointer: coarse)').matches
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  return { kind, isTouch, prefersReducedMotion }
}

export function usePlatform(): PlatformState {
  const [state, setState] = useState<PlatformState>(detect)

  useEffect(() => {
    function update() {
      setState(detect())
    }
    window.addEventListener('resize', update)
    const mqMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const mqHover = window.matchMedia('(hover: none) and (pointer: coarse)')
    mqMotion.addEventListener('change', update)
    mqHover.addEventListener('change', update)
    return () => {
      window.removeEventListener('resize', update)
      mqMotion.removeEventListener('change', update)
      mqHover.removeEventListener('change', update)
    }
  }, [])

  return state
}
