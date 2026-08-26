import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from '../../landing/shared/perf/useReducedMotion'
import WfSkeleton from '../wireframe/WfSkeleton'
import WfDataState from '../wireframe/WfDataState'
import { sectionDataState } from './sectionState'
import type { WeatherPageStatus } from '../../hooks/useWeatherPageData'
import type { WindField } from '../../lib/windField'
import type { WeatherGridMslp } from '../../api/weatherProxy'

export interface WindMinimapProps {
  status: WeatherPageStatus
  configured: boolean
  wind: WindField | null
  mslp: WeatherGridMslp | null
  lat: number
  lon: number
  onRetry: () => void
}

/** Tunable constants for the local particle field — half-width of the
 * sampled box (degrees), particle count, device-pixel-ratio cap, particle
 * max age (frames), and drift-per-step scale, all grouped so no bare magic
 * number appears inline in the drawing code below. */
const WIND_MINIMAP_CONFIG = {
  boxDeg: 8,
  particleCount: 70,
  dprCap: 2,
  maxParticleAge: 180,
  degPerStep: 0.00006,
}

interface Particle {
  lat: number
  lon: number
  age: number
}

function spawnParticle(lat: number, lon: number): Particle {
  const box = WIND_MINIMAP_CONFIG.boxDeg
  return {
    lat: lat + (Math.random() - 0.5) * 2 * box,
    lon: lon + (Math.random() - 0.5) * 2 * box,
    age: Math.random() * WIND_MINIMAP_CONFIG.maxParticleAge,
  }
}

/** Reads a `--wx-wind-*` CSS custom property (weather.css `:root`) rather
 * than hardcoding a color literal in JS — same pattern as SkyOrb's
 * `readCssColor`. Canvas fillStyle/strokeStyle accepts any CSS color
 * string, so no rgb-tuple parsing is needed here. */
function readCssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') return fallback
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return raw || fallback
}

/**
 * WindMinimap — S5. Local wind-vector particle canvas around the viewed
 * location, plus the nearest-cell sea-level pressure reading. Canvas guards
 * per core-rules: non-finite values are skipped before any drawing call, a
 * zero-size container bails before touching the canvas, and DPR is capped.
 */
export default function WindMinimap({ status, configured, wind, mslp, lat, lon, onRetry }: WindMinimapProps) {
  const reduced = useReducedMotion()
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [visible, setVisible] = useState(true)

  const state = sectionDataState(status, configured, wind !== null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const io = new IntersectionObserver((entries) => setVisible(entries[0]?.isIntersecting ?? true))
    io.observe(el)
    return () => io.disconnect()
  }, [state.kind])

  useEffect(() => {
    if (state.kind !== 'ready' || !wind) return
    // Rebind to non-nullable-typed consts: `if (!x) return` narrows the
    // original binding in this scope, but that narrowing isn't retained
    // inside the nested function declarations below (a TS closure gap) —
    // a fresh const with a fixed, non-null type sidesteps it entirely.
    const field: WindField = wind
    const canvas = canvasRef.current
    if (!canvas) return
    const ctxOrNull = canvas.getContext('2d')
    if (!ctxOrNull) return
    const ctx: CanvasRenderingContext2D = ctxOrNull

    const cssW = canvas.clientWidth
    const cssH = canvas.clientHeight
    if (cssW <= 0 || cssH <= 0) return // container-size guard

    const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, WIND_MINIMAP_CONFIG.dprCap)
    canvas.width = Math.round(cssW * dpr)
    canvas.height = Math.round(cssH * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const bgColor = readCssVar('--wx-wind-bg', '#0c1018')
    const lineColor = readCssVar('--wx-wind-line', '#f0f4fa')
    const markerColor = readCssVar('--wx-wind-marker', '#ff5c00')

    const originLat = lat
    const originLon = lon
    const box = WIND_MINIMAP_CONFIG.boxDeg

    function toXY(plat: number, plon: number): [number, number] | null {
      const x = ((plon - (originLon - box)) / (2 * box)) * cssW
      const y = ((originLat + box - plat) / (2 * box)) * cssH
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null
      return [x, y]
    }

    const particles = Array.from({ length: WIND_MINIMAP_CONFIG.particleCount }, () => spawnParticle(originLat, originLon))
    let raf = 0
    let running = true

    function step(): void {
      for (const p of particles) {
        const { u, v } = field.interpolate(p.lat, p.lon)
        if (Number.isFinite(u) && Number.isFinite(v)) {
          p.lon += u * WIND_MINIMAP_CONFIG.degPerStep
          p.lat += v * WIND_MINIMAP_CONFIG.degPerStep
        }
        p.age += 1
        const drifted = Math.abs(p.lon - originLon) > box || Math.abs(p.lat - originLat) > box
        if (p.age > WIND_MINIMAP_CONFIG.maxParticleAge || drifted) {
          const fresh = spawnParticle(originLat, originLon)
          p.lat = fresh.lat
          p.lon = fresh.lon
          p.age = 0
        }
      }
    }

    function draw(): void {
      ctx.fillStyle = bgColor
      ctx.fillRect(0, 0, cssW, cssH)
      ctx.strokeStyle = lineColor
      ctx.lineWidth = 1
      for (const p of particles) {
        const head = toXY(p.lat, p.lon)
        if (!head) continue
        const { u, v } = field.interpolate(p.lat, p.lon)
        if (!Number.isFinite(u) || !Number.isFinite(v)) continue
        const [hx, hy] = head
        const tailScale = 0.6
        const tx = hx - u * tailScale
        const ty = hy + v * tailScale
        if (!Number.isFinite(tx) || !Number.isFinite(ty)) continue
        ctx.beginPath()
        ctx.moveTo(tx, ty)
        ctx.lineTo(hx, hy)
        ctx.stroke()
      }
      const center = toXY(originLat, originLon)
      if (center) {
        const [cx, cy] = center
        const markerRadius = 3
        ctx.fillStyle = markerColor
        ctx.beginPath()
        ctx.arc(cx, cy, markerRadius, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    function frame(): void {
      if (!running) return
      step()
      draw()
      raf = requestAnimationFrame(frame)
    }

    if (reduced || !visible) {
      draw()
    } else {
      raf = requestAnimationFrame(frame)
    }

    return () => {
      running = false
      if (raf) cancelAnimationFrame(raf)
    }
  }, [state.kind, wind, lat, lon, reduced, visible])

  return (
    <section className="wx-section" aria-label="Wind">
      <div className="wx-section__head">
        <span className="t-tag">Wind</span>
      </div>
      {state.kind === 'loading' && <WfSkeleton height={220} />}
      {state.kind !== 'loading' && state.kind !== 'ready' && (
        <WfDataState state={state} onRetry={state.kind === 'error' ? onRetry : undefined} />
      )}
      {state.kind === 'ready' && (
        <div className="wx-wind" ref={wrapRef}>
          <canvas ref={canvasRef} className="wx-wind__canvas" aria-hidden="true" />
          <span className="wx-wind__mslp">{mslp !== null ? `${Math.round(mslp.mslp)} hPa` : 'MSLP —'}</span>
        </div>
      )}
    </section>
  )
}
