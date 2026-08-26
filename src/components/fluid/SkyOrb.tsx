import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useReducedMotion } from '../../landing/shared/perf/useReducedMotion'
import type { QualityTier } from '../../landing/shared/perf/types'

export interface SkyOrbProps {
  /** null/NaN -> neutral idle ambient, never a fabricated reading. */
  pm25: number | null
  tier?: QualityTier
  className?: string
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  phase: number
}

const PARTICLE_CAP: Record<QualityTier, number> = { low: 24, medium: 60, high: 120 }
const NEUTRAL_RGB: [number, number, number] = [139, 134, 120]

type ColorStop = [number, [number, number, number]]

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function readCssColor(varName: string, fallback: [number, number, number]): [number, number, number] {
  if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') return fallback
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName)
  return hexToRgb(raw) ?? fallback
}

/** Continuous good/moderate/unhealthy/hazard interpolation across the same
 * 15/35/75 breakpoints as `useCapsuleData`'s `tierFromPm25`, extended to 150
 * for the hazard end of the curve. */
function buildColorStops(): ColorStop[] {
  const good = readCssColor('--aqi-good', [79, 122, 79])
  const mod = readCssColor('--aqi-mod', [181, 138, 46])
  const unh = readCssColor('--aqi-unh', [159, 58, 46])
  const haz = readCssColor('--aqi-haz', [74, 31, 74])
  return [
    [0, good],
    [15, good],
    [35, mod],
    [75, unh],
    [150, haz],
  ]
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function colorForPm25(pm25: number, stops: ColorStop[]): [number, number, number] {
  const clamped = Math.max(stops[0][0], Math.min(stops[stops.length - 1][0], pm25))
  for (let i = 0; i < stops.length - 1; i++) {
    const [lo, loColor] = stops[i]
    const [hi, hiColor] = stops[i + 1]
    if (clamped >= lo && clamped <= hi) {
      const t = hi === lo ? 0 : (clamped - lo) / (hi - lo)
      return [
        Math.round(lerp(loColor[0], hiColor[0], t)),
        Math.round(lerp(loColor[1], hiColor[1], t)),
        Math.round(lerp(loColor[2], hiColor[2], t)),
      ]
    }
  }
  return stops[stops.length - 1][1]
}

function makeParticles(count: number, w: number, h: number): Particle[] {
  const out: Particle[] = []
  for (let i = 0; i < count; i++) {
    out.push({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 6,
      vy: (Math.random() - 0.5) * 6,
      r: 0.8 + Math.random() * 1.6,
      phase: Math.random() * Math.PI * 2,
    })
  }
  return out
}

/**
 * SkyOrb — ambient canvas orb: PM2.5 drives particle color, density, and
 * breathing speed. Decorative only (never renders a numeric reading), so a
 * null/unknown reading falls back to a calm neutral ambient rather than a
 * blank frame. Rendering guards mirror `displacementMap.ts`'s SSR/jsdom
 * canvas-absence pattern: bail out quietly when there is no usable 2D
 * context instead of throwing.
 */
export default function SkyOrb({ pm25, tier = 'high', className }: SkyOrbProps): ReactNode {
  const reduced = useReducedMotion()
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const el = wrapRef.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const io = new IntersectionObserver((entries) => setVisible(entries[0]?.isIntersecting ?? true))
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const value = pm25 != null && Number.isFinite(pm25) ? pm25 : null
    const stops = buildColorStops()
    const [r, g, b] = value !== null ? colorForPm25(value, stops) : NEUTRAL_RGB
    const density = value !== null ? Math.max(0, Math.min(1, value / 150)) : 0.2
    const count = Math.round(PARTICLE_CAP[tier] * (0.35 + 0.65 * density))
    const breathSpeed = lerp(1.4, 0.5, density)

    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
    const cssW = canvas.clientWidth || 240
    const cssH = canvas.clientHeight || 240
    canvas.width = Math.round(cssW * dpr)
    canvas.height = Math.round(cssH * dpr)
    ctx.scale(dpr, dpr)

    const particles = makeParticles(count, cssW, cssH)
    let raf = 0
    let running = true

    function frame(ts: number): void {
      if (!running) return
      ctx!.clearRect(0, 0, cssW, cssH)
      const t = ts / 1000
      for (const p of particles) {
        p.x += p.vx * 0.016
        p.y += p.vy * 0.016
        if (p.x < 0) p.x += cssW
        if (p.x > cssW) p.x -= cssW
        if (p.y < 0) p.y += cssH
        if (p.y > cssH) p.y -= cssH
        const breath = 0.6 + 0.4 * Math.sin(t * breathSpeed + p.phase)
        ctx!.beginPath()
        ctx!.fillStyle = `rgba(${r},${g},${b},${0.25 + 0.35 * breath})`
        ctx!.arc(p.x, p.y, p.r * (0.7 + 0.3 * breath), 0, Math.PI * 2)
        ctx!.fill()
      }
      raf = requestAnimationFrame(frame)
    }

    function drawStatic(): void {
      ctx!.clearRect(0, 0, cssW, cssH)
      for (const p of particles) {
        ctx!.beginPath()
        ctx!.fillStyle = `rgba(${r},${g},${b},0.4)`
        ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx!.fill()
      }
    }

    if (reduced || !visible) {
      drawStatic()
    } else {
      raf = requestAnimationFrame(frame)
    }

    return () => {
      running = false
      if (raf) cancelAnimationFrame(raf)
    }
  }, [pm25, tier, reduced, visible])

  const classes = ['fluid-sky-orb']
  if (className) classes.push(className)

  return (
    <div ref={wrapRef} className={classes.join(' ')}>
      <canvas ref={canvasRef} className="fluid-sky-orb__canvas" aria-hidden="true" />
    </div>
  )
}
