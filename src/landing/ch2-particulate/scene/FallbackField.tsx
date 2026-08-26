// Ported verbatim from AirLens-platform apps/landing-lab
// `src/concepts/particulate/scene/FallbackField.tsx` (Wave L2, 2026-08-26);
// `theme/config` import rebound to this chapter's local `../theme`.
import { useEffect, useRef } from 'react'
import type { ParticulateData, Window } from '../types'
import { PARTICULATE, SKY_RAMPS } from '../theme'

// Same information, no simulation: a Canvas2D still of the identical PM2.5 window,
// for machines without a float render target (and for reduced-motion). Motes are
// laid on a jittered grid; each takes its size and opacity from the concentration
// it sits in — the encoding the GPU field uses, minus the wind.
export default function FallbackField({
  data,
  win,
  haze,
}: {
  data: ParticulateData
  win: Window
  haze: number
}) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const draw = () => {
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      // Sky ramp, washed toward the veil by the window's own mean concentration.
      const grad = ctx.createLinearGradient(0, h, 0, 0)
      const r = SKY_RAMPS.dusk
      grad.addColorStop(0, r[0])
      grad.addColorStop(0.42, r[1])
      grad.addColorStop(0.72, r[2])
      grad.addColorStop(1, r[3])
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, w, h)
      ctx.globalAlpha = Math.min(0.85, haze * 0.85)
      ctx.fillStyle = PARTICULATE.veil
      ctx.fillRect(0, 0, w, h)
      ctx.globalAlpha = 1

      const cap = data.pm25.meta.cap
      const step = 14
      // Deterministic jitter: a still field must repaint to the *same* still field
      // (a resize or re-render redrawing with fresh randomness reads as a flicker).
      const jitter = (i: number, j: number) => {
        const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453
        return s - Math.floor(s) - 0.5
      }
      let row = 0
      for (let py = step / 2; py < h; py += step, row++) {
        let colIdx = 0
        for (let px = step / 2; px < w; px += step, colIdx++) {
          const jx = px + jitter(colIdx, row) * step * 0.9
          const jy = py + jitter(row + 17, colIdx + 3) * step * 0.9
          const lon = win.lon0 + (jx / w) * win.lonSpan
          const lat = win.lat0 + (1 - jy / h) * win.latSpan
          const pm = data.pm25.sampleAt(lat, lon)
          const t = Math.min(1, pm / (cap * 0.4))
          const color = t < 0.45 ? PARTICULATE.clean : t < 0.8 ? PARTICULATE.warm : PARTICULATE.hot
          ctx.globalAlpha = 0.05 + t * 0.7
          ctx.fillStyle = color
          ctx.beginPath()
          ctx.arc(jx, jy, 0.7 + t * 2.6, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      ctx.globalAlpha = 1
    }

    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [data, win, haze])

  return <canvas ref={ref} className="ch2-pt__canvas" aria-hidden="true" />
}
