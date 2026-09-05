// Fullscreen entry veil: pulsing brand mark + a typing concept line. Used both
// as a Suspense fallback and as an explicit data-loading veil (pass `done` to
// fade it out). reduced-motion → no typing/pulse, veil dismisses instantly.
// Ported from AirLens-platform apps/landing-lab/src/shared/ui/LoadingVeil.tsx
// — ATMOS.{bg,ink,dim} swapped for tokens.css's --bg-0/--ink-0/--ink-2 so the
// veil follows the site's light/dark theme instead of the landing lab's fixed
// dark palette; the `lv-pulse` keyframe lives in motion.css (not an inline
// <style> tag, per this repo's convention — see AirLensMark's own comment).
import { useEffect, useState } from 'react'
import AirLensMark from './AirLensMark'
import { useReducedMotion } from '../landing/shared/perf/useReducedMotion'

interface Props {
  label?: string
  done?: boolean
}

export default function LoadingVeil({ label = 'LOADING', done = false }: Props) {
  const reduced = useReducedMotion()
  const [typed, setTyped] = useState('')
  const [fadedOut, setFadedOut] = useState(false)

  useEffect(() => {
    // reduced-motion shows the full label via render-time derivation below —
    // no typing interval, and no synchronous setState inside the effect.
    if (reduced) return
    let i = 0
    const id = window.setInterval(() => {
      i += 1
      setTyped(label.slice(0, i))
      if (i >= label.length) window.clearInterval(id)
    }, 55)
    return () => window.clearInterval(id)
  }, [label, reduced])

  useEffect(() => {
    if (!done || reduced) return
    const id = window.setTimeout(() => setFadedOut(true), 420)
    return () => window.clearTimeout(id)
  }, [done, reduced])

  const shown = reduced ? label : typed
  if (fadedOut || (done && reduced)) return null

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1.1rem',
        background: 'var(--bg-0)',
        color: 'var(--ink-0)',
        opacity: done && !reduced ? 0 : 1,
        transition: reduced ? 'none' : 'opacity 400ms ease',
      }}
    >
      <div style={{ animation: reduced ? 'none' : 'lv-pulse 1.6s ease-in-out infinite' }}>
        <AirLensMark size={44} />
      </div>
      <span className="t-tag" style={{ letterSpacing: '0.3em', color: 'var(--ink-2)', minHeight: 16 }}>
        {shown}
        {!reduced && shown.length < label.length ? '█' : ''}
      </span>
    </div>
  )
}
