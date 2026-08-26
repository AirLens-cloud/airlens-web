// Render-quality tier for the 3D / shader concepts. Decided from device signals
// (dpr, deviceMemory) plus a ~1s rAF FPS probe, then frozen. Concept scenes read
// `tier` to scale point counts, particle counts, and postprocessing.
//
// Ported verbatim from AirLens-platform apps/landing-lab
// `src/shared/perf/QualityProvider.tsx` (Wave L0, 2026-08-26).
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { DeviceLike, QualityTier, QualityValue } from './types'

const QualityContext = createContext<QualityValue | null>(null)

function baselineTier(): QualityTier {
  if (typeof window === 'undefined') return 'medium'
  const dpr = window.devicePixelRatio || 1
  const mem = (navigator as Navigator & DeviceLike).deviceMemory
  if (mem != null && mem <= 4) return 'low'
  if (dpr > 2.5 && (mem == null || mem < 8)) return 'medium'
  return 'high'
}

// Probe average FPS over ~1s of rAF, then downgrade the baseline if the device
// can't sustain it.
function probeFps(onDone: (fps: number) => void): () => void {
  if (typeof window === 'undefined' || typeof performance === 'undefined') {
    onDone(60)
    return () => {}
  }
  let frames = 0
  let raf = 0
  const start = performance.now()
  const tick = (now: number) => {
    frames += 1
    if (now - start >= 1000) {
      onDone((frames * 1000) / (now - start))
      return
    }
    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)
  return () => cancelAnimationFrame(raf)
}

export function QualityProvider({ children }: { children: ReactNode }) {
  const [tier, setTier] = useState<QualityTier>(() => baselineTier())
  const [measuring, setMeasuring] = useState(true)

  useEffect(() => {
    const cancel = probeFps((fps) => {
      setTier((base) => {
        if (fps < 40) return 'low'
        if (fps < 52 && base === 'high') return 'medium'
        return base
      })
      setMeasuring(false)
    })
    return cancel
  }, [])

  const value = useMemo<QualityValue>(() => ({ tier, measuring }), [tier, measuring])
  return <QualityContext.Provider value={value}>{children}</QualityContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components -- pure hook, not a component
export function useQuality(): QualityValue {
  const ctx = useContext(QualityContext)
  if (!ctx) throw new Error('useQuality must be used within <QualityProvider>')
  return ctx
}
