// Ported verbatim from AirLens-platform apps/landing-lab
// `src/concepts/atmos/sections/HotspotLeaders.tsx` (Wave L1, 2026-08-26) — no
// path changes needed (only imports `../types` and `../globeCoords`, same
// relative depth in both repos).
import { useEffect, useRef, type MutableRefObject } from 'react'
import type { HotspotScreen } from '../types'
import { HOTSPOTS } from '../globeCoords'

// HTML overlay drawing a dot + leader + value label at each hotspot's projected
// screen position, so the S1 numbers sit ON the globe where they actually are.
// Positions are written imperatively every rAF from the projector's screenRef —
// React state is avoided on purpose: screenRef.current is a stable array mutated
// in place, so setState(...) would bail on identity and freeze the leaders.
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

export default function HotspotLeaders({
  screenRef,
  progressRef,
}: {
  screenRef: MutableRefObject<HotspotScreen[]>
  progressRef: MutableRefObject<number>
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const items = useRef<Array<{ wrap: HTMLDivElement; val: HTMLSpanElement } | null>>([])

  useEffect(() => {
    let raf = 0
    const loop = () => {
      const root = rootRef.current
      const pts = screenRef.current
      const progress = progressRef.current
      // S1 is the active section around progress 0.2–0.25; fade the whole overlay
      // in/out with it, and count values up with the reveal.
      const local = progress * 5 - 1
      const vis =
        local > -0.25 && local < 1.25 ? clamp01(Math.min((local + 0.25) * 3, (1.25 - local) * 3)) : 0
      const reveal = clamp01((progress - 0.16) / 0.06)

      if (root) root.style.opacity = String(vis)
      for (let i = 0; i < items.current.length; i++) {
        const it = items.current[i]
        const p = pts[i]
        if (!it) continue
        if (vis <= 0.01 || !p || !p.front) {
          it.wrap.style.display = 'none'
          continue
        }
        it.wrap.style.display = 'block'
        it.wrap.style.left = `${p.x * 100}%`
        it.wrap.style.top = `${p.y * 100}%`
        // `reveal` fades the label in; it must never scale the number. Counting up from
        // 0 to the real value prints understated concentrations — with a real µg/m³ unit
        // beside them — for the whole reveal window.
        it.wrap.style.opacity = String(reveal)
        it.val.textContent = p.pm25.toFixed(1)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [screenRef, progressRef])

  return (
    <div className="ch1-leaders" ref={rootRef} style={{ opacity: 0 }} aria-hidden="true">
      {HOTSPOTS.map((h, i) => (
        <div
          className="ch1-leader"
          key={h.name}
          style={{ display: 'none' }}
          ref={(el) => {
            items.current[i] = el ? { wrap: el, val: el.querySelector('.ch1-leader__val') as HTMLSpanElement } : null
          }}
        >
          <span className="ch1-leader__dot" />
          <span className="ch1-leader__stem" />
          <span className="ch1-leader__label">
            <b>{h.name.toUpperCase()}</b>
            <span className="ch1-leader__val">—</span>
            <span className="ch1-leader__unit">µg/m³</span>
          </span>
        </div>
      ))}
    </div>
  )
}
