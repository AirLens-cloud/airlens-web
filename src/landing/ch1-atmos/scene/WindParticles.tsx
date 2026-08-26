// Ported verbatim from AirLens-platform apps/landing-lab
// `src/concepts/atmos/scene/WindParticles.tsx` (Wave L1, 2026-08-26); data/perf
// imports rebound to `shared/data`/`shared/perf`, theme split across the
// chapter-local module (ATMOS) and the shared AQI re-export (AQI_GRADE_HEX).
//
// `react-hooks/purity` and `react-hooks/immutability` are disabled file-wide:
// this is r3f's standard CPU-advection pattern — `Math.random()` seeds
// particle state once inside `useMemo` (keyed on `count`), and `useFrame`
// mutates that same preallocated buffer every frame in place on purpose (the
// comments throughout this file explain why: at `count` particles/frame,
// allocating fresh arrays instead would be thousands of throwaway objects a
// second). react-hooks' React-Compiler-oriented purity/immutability rules
// assume plain React render output, not an imperative WebGL update loop that
// runs outside React's render phase — a documented r3f/React-Compiler
// incompatibility, not a real bug here.
/* eslint-disable react-hooks/purity, react-hooks/immutability */
import { useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { WindField } from '../../shared/data/loaders'
import { useReducedMotion } from '../../shared/perf/useReducedMotion'
import { AQI_GRADE_HEX } from '../../shared/theme/config'
import { ATMOS } from '../theme'
import { latLonToGlobe } from '../globeCoords'

const TRAIL = 8
const R = 1.03
const DEG = Math.PI / 180

interface Props {
  wind: WindField
  count: number
  // 0..1 opacity multiplier, animated by the scroll rig (fade in during S2).
  strengthRef: MutableRefObject<number>
}

// CPU advection: each particle drifts along the wind tangent field; a short
// position history draws a fading trail. All buffers are preallocated and
// mutated in place — no per-frame allocation.
export default function WindParticles({ wind, count, strengthRef }: Props) {
  const reduced = useReducedMotion()
  const matRef = useRef<THREE.LineBasicMaterial>(null)

  // Wind grid pulled out for an inline bilinear sampler — the per-frame loop must
  // not allocate, so we can't use wind.sample() (it returns a fresh [u,v] array).
  const { nx, ny, lo1, la1, dx, dy } = wind.header
  const latLo = la1 - (ny - 1) * dy

  const st = useMemo(() => {
    const lat = new Float32Array(count)
    const lon = new Float32Array(count)
    const age = new Float32Array(count)
    const hist = new Float32Array(count * TRAIL * 3)
    const seed = (i: number) => {
      lat[i] = Math.asin(2 * Math.random() - 1) / DEG
      lon[i] = Math.random() * 360 - 180
      age[i] = Math.random() * 6
      const p = latLonToGlobe(lat[i], lon[i], R)
      for (let t = 0; t < TRAIL; t++) {
        hist[(i * TRAIL + t) * 3] = p[0]
        hist[(i * TRAIL + t) * 3 + 1] = p[1]
        hist[(i * TRAIL + t) * 3 + 2] = p[2]
      }
    }
    for (let i = 0; i < count; i++) seed(i)
    const segVerts = count * (TRAIL - 1) * 2
    const positions = new Float32Array(segVerts * 3)
    const colors = new Float32Array(segVerts * 3)
    return { lat, lon, age, hist, positions, colors, seed }
  }, [count])

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(st.positions, 3))
    g.setAttribute('color', new THREE.BufferAttribute(st.colors, 3))
    return g
  }, [st])

  const slow = useMemo(() => new THREE.Color(ATMOS.accent), [])
  const fast = useMemo(() => new THREE.Color(AQI_GRADE_HEX.MODERATE), [])

  useFrame((_, rawDt) => {
    const strength = strengthRef.current
    if (matRef.current) matRef.current.opacity = strength
    if (reduced || strength <= 0.001) return
    const dt = Math.min(rawDt, 0.05)
    const { lat, lon, age, hist, positions, colors } = st
    const wu = wind.u
    const wv = wind.v
    let vi = 0
    for (let i = 0; i < count; i++) {
      // inline bilinear sample (no allocation) — mirrors loaders.ts wind.sample
      const wl = ((((lon[i] + 180) % 360) + 360) % 360) - 180
      const fx = (wl - lo1) / dx
      let clat = lat[i]
      if (clat < latLo) clat = latLo
      else if (clat > la1) clat = la1
      const fy = (la1 - clat) / dy
      const x0 = Math.floor(fx)
      const c0 = ((x0 % nx) + nx) % nx
      const c1 = (c0 + 1) % nx
      let r0 = Math.floor(fy)
      if (r0 < 0) r0 = 0
      else if (r0 > ny - 1) r0 = ny - 1
      const r1 = r0 + 1 > ny - 1 ? ny - 1 : r0 + 1
      const tx = fx - x0
      const ty = fy - Math.floor(fy)
      const uTop = (wu[r0 * nx + c0] ?? 0) * (1 - tx) + (wu[r0 * nx + c1] ?? 0) * tx
      const uBot = (wu[r1 * nx + c0] ?? 0) * (1 - tx) + (wu[r1 * nx + c1] ?? 0) * tx
      const u = uTop * (1 - ty) + uBot * ty
      const vTop = (wv[r0 * nx + c0] ?? 0) * (1 - tx) + (wv[r0 * nx + c1] ?? 0) * tx
      const vBot = (wv[r1 * nx + c0] ?? 0) * (1 - tx) + (wv[r1 * nx + c1] ?? 0) * tx
      const v = vTop * (1 - ty) + vBot * ty
      const spd = Math.hypot(u, v)
      const cosLat = Math.max(0.15, Math.cos(lat[i] * DEG))
      lon[i] += (u * 0.35 * dt) / cosLat
      lat[i] += v * 0.35 * dt
      age[i] += dt
      if (age[i] > 7 || lat[i] > 85 || lat[i] < -85) {
        st.seed(i)
        continue
      }
      if (lon[i] > 180) lon[i] -= 360
      else if (lon[i] < -180) lon[i] += 360
      const base = i * TRAIL * 3
      hist.copyWithin(base, base + 3, base + TRAIL * 3)
      // Inline the lat/lon → globe transform: latLonToGlobe() returns a fresh [x,y,z],
      // which at `count` particles per frame is thousands of throwaway arrays a second.
      const phi = (90 - lat[i]) * DEG
      const theta = (lon[i] + 180) * DEG
      const sp = Math.sin(phi)
      hist[base + (TRAIL - 1) * 3] = -R * sp * Math.cos(theta)
      hist[base + (TRAIL - 1) * 3 + 1] = R * Math.cos(phi)
      hist[base + (TRAIL - 1) * 3 + 2] = R * sp * Math.sin(theta)
      const cr = slow.r + (fast.r - slow.r) * Math.min(1, spd / 14)
      const cg = slow.g + (fast.g - slow.g) * Math.min(1, spd / 14)
      const cb = slow.b + (fast.b - slow.b) * Math.min(1, spd / 14)
      for (let t = 0; t < TRAIL - 1; t++) {
        const a0 = t / (TRAIL - 1)
        const a1 = (t + 1) / (TRAIL - 1)
        const s0 = base + t * 3
        const s1 = base + (t + 1) * 3
        positions[vi * 3] = hist[s0]; positions[vi * 3 + 1] = hist[s0 + 1]; positions[vi * 3 + 2] = hist[s0 + 2]
        colors[vi * 3] = cr * a0; colors[vi * 3 + 1] = cg * a0; colors[vi * 3 + 2] = cb * a0
        vi++
        positions[vi * 3] = hist[s1]; positions[vi * 3 + 1] = hist[s1 + 1]; positions[vi * 3 + 2] = hist[s1 + 2]
        colors[vi * 3] = cr * a1; colors[vi * 3 + 1] = cg * a1; colors[vi * 3 + 2] = cb * a1
        vi++
      }
    }
    // A respawned particle writes no vertices this frame (the `continue` above), so `vi`
    // stops short of the buffer end. Without a draw range the tail would still be drawn —
    // rendering last frame's vertices as frozen streaks that jump between unrelated
    // particles as the respawn count changes. Draw only what this frame actually wrote.
    geometry.setDrawRange(0, vi)
    geometry.attributes.position.needsUpdate = true
    geometry.attributes.color.needsUpdate = true
  })

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial ref={matRef} vertexColors transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} />
    </lineSegments>
  )
}
