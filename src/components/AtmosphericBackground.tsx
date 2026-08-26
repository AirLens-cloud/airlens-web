// AtmosphericBackground — Brownian drifting dots + cursor-trail fountain-pen drops.
// Ported from AirLens-platform apps/web/src/components/AtmosphericBackground.tsx.
// Colors: porting brief decision — the K4 4-color palette (good/moderate/usg/
// unhealthy AQI tones) instead of the source's full PM2.5 gradient scale
// (see src/lib/atmosphericBackgroundConfig.ts). reduced-motion (no init) and
// pointer:coarse (cursor-trail no init) guards preserved verbatim.
// OBSERVATORY surface signal (html[data-surface], owned by the flight):
// 'void' = flight darkness — drift dots pause, the trail becomes cyan
// condensation on the instrument glass (no gravity, low alpha). 'paper' and
// pages without the signal keep the original ink behaviour.
import { useEffect, useRef, type ReactElement } from 'react'
import { K4_PALETTE, OBS_CYAN_HEX } from '../lib/atmosphericBackgroundConfig'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  color: string
  a: number
}

interface TrailDrop {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  life: number
  max: number
  color: string
  mode: 'ink' | 'condense'
}

function surfaceIsVoid(): boolean {
  return document.documentElement.dataset.surface === 'void'
}

const BG_COUNT = 36
const BG_DRIFT = 0.12
const BG_BROWNIAN = 0.22
const BG_DAMPING = 0.985

const TRAIL_MAX = 22
const TRAIL_SPAWN = 4
const TRAIL_LIFE = 36

function randomK4Color(): string {
  return K4_PALETTE[Math.floor(Math.random() * K4_PALETTE.length)] ?? K4_PALETTE[0]!
}

export default function AtmosphericBackground(): ReactElement {
  const bgRef = useRef<HTMLCanvasElement>(null)
  const trailRef = useRef<HTMLCanvasElement>(null)

  // Brownian dots
  useEffect(() => {
    const canvas = bgRef.current
    if (!canvas) return
    if (typeof window === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    let w = 0
    let h = 0
    let particles: Particle[] = []
    let raf = 0

    const resize = (): void => {
      const dpr = window.devicePixelRatio || 1
      w = window.innerWidth
      h = window.innerHeight
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.scale(dpr, dpr)
    }

    const init = (): void => {
      particles = Array.from({ length: BG_COUNT }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * BG_DRIFT,
        vy: (Math.random() - 0.5) * BG_DRIFT,
        r: 1.2 + Math.random() * 1.8,
        color: randomK4Color(),
        a: 0.42 + Math.random() * 0.22,
      }))
    }

    const step = (): void => {
      ctx.clearRect(0, 0, w, h)
      // drift dots belong to the paper world — the flight's void keeps its own sky
      if (surfaceIsVoid()) {
        raf = requestAnimationFrame(step)
        return
      }
      for (const p of particles) {
        p.vx += (Math.random() - 0.5) * BG_BROWNIAN * 0.12
        p.vy += (Math.random() - 0.5) * BG_BROWNIAN * 0.12
        p.vx *= BG_DAMPING
        p.vy *= BG_DAMPING
        p.x += p.vx
        p.y += p.vy
        if (p.x < -10) p.x = w + 10
        else if (p.x > w + 10) p.x = -10
        if (p.y < -10) p.y = h + 10
        else if (p.y > h + 10) p.y = -10
        ctx.beginPath()
        ctx.fillStyle = p.color
        ctx.globalAlpha = p.a
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
      raf = requestAnimationFrame(step)
    }

    const onResize = (): void => {
      resize()
      init()
    }

    resize()
    init()
    raf = requestAnimationFrame(step)
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  // Cursor trail (fountain-pen drops)
  useEffect(() => {
    const canvas = trailRef.current
    if (!canvas) return
    if (typeof window === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (window.matchMedia('(pointer: coarse)').matches) return

    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    let w = 0
    let h = 0
    const drops: TrailDrop[] = []
    let mx = -999
    let my = -999
    let lx = -999
    let ly = -999
    let frame = 0
    let raf = 0

    const resize = (): void => {
      const dpr = window.devicePixelRatio || 1
      w = window.innerWidth
      h = window.innerHeight
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.scale(dpr, dpr)
    }

    const onMove = (e: MouseEvent): void => {
      mx = e.clientX
      my = e.clientY
    }

    const spawn = (): void => {
      const moved = lx === -999 || Math.abs(mx - lx) + Math.abs(my - ly) > 2
      if (!moved) return
      lx = mx
      ly = my
      if (drops.length >= TRAIL_MAX) drops.shift()
      // on the void the cursor wipes condensation onto the instrument glass:
      // cyan, weightless, faint — everywhere else it stays fountain-pen ink
      const condense = surfaceIsVoid()
      drops.push({
        x: mx + (Math.random() - 0.5) * 4,
        y: my + (Math.random() - 0.5) * 4,
        vx: (Math.random() - 0.5) * (condense ? 0.25 : 0.6),
        vy: condense ? (Math.random() - 0.5) * 0.25 : 0.3 + Math.random() * 0.5,
        r: condense ? 1.6 + Math.random() * 2.2 : 1.2 + Math.random() * 1.6,
        life: TRAIL_LIFE,
        max: TRAIL_LIFE,
        color: condense ? OBS_CYAN_HEX : randomK4Color(),
        mode: condense ? 'condense' : 'ink',
      })
    }

    const step = (): void => {
      frame++
      if (frame % TRAIL_SPAWN === 0) spawn()
      ctx.clearRect(0, 0, w, h)
      for (let i = drops.length - 1; i >= 0; i--) {
        const p = drops[i]
        if (!p) continue
        p.life--
        if (p.life <= 0) {
          drops.splice(i, 1)
          continue
        }
        p.x += p.vx
        p.y += p.vy
        if (p.mode === 'ink') p.vy += 0.04 // condensation is weightless
        const a = (p.life / p.max) * (p.mode === 'condense' ? 0.28 : 0.78)
        ctx.beginPath()
        ctx.fillStyle = p.color
        ctx.globalAlpha = a
        ctx.arc(p.x, p.y, p.r * (p.life / p.max), 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
      raf = requestAnimationFrame(step)
    }

    resize()
    raf = requestAnimationFrame(step)
    window.addEventListener('resize', resize)
    window.addEventListener('mousemove', onMove)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', onMove)
    }
  }, [])

  return (
    <>
      <canvas ref={bgRef} className="bg-particles" aria-hidden="true" />
      <canvas ref={trailRef} className="cursor-trail" aria-hidden="true" />
    </>
  )
}
