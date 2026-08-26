// Ported verbatim (TRAIL/BOUNDS/WIND_TIME_SCALE tuning constants and every
// comment below unchanged) from AirLens-platform apps/landing-lab
// `src/concepts/seoul/scene/WindStreaks.tsx` (Wave L3, 2026-08-26).
// `theme/config` import rebound to this chapter's local `../theme`, and
// `React.MutableRefObject<...>` (used bare, no `React` import, in the source)
// rewritten as an explicit `import type { MutableRefObject }` — same
// adjustment Ch2's `FlowField.tsx` port made.
//
// `react-hooks/purity` and `react-hooks/immutability` are disabled file-wide:
// this is r3f's standard CPU-advection pattern — `Math.random()` seeds
// particle state once inside `useMemo` (keyed on `count`) and again whenever a
// particle respawns inside `useFrame`, and `useFrame` mutates that same
// preallocated buffer every frame in place on purpose. Same documented
// r3f/React-Compiler incompatibility as Ch1's `WindParticles.tsx` and Ch2's
// `FlowField.tsx` (both disable the same two rules for the same reason).
/* eslint-disable react-hooks/purity, react-hooks/immutability */
import { useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { WindField } from '../../shared/data/loaders'
import { useReducedMotion } from '../../shared/perf/useReducedMotion'
import { SEOUL } from '../theme'
import { SEOUL_CENTER } from '../projection'

const TRAIL = 6
const KM_PER_DEG_LAT = 111.32
// Real m/s wind is imperceptible at 1:1 wall-clock (a 5 m/s surface wind needs
// minutes to visibly cross a 37 km city) — this is the same honesty trade the
// PARTICULATE concept makes (see its FlowField TIME_SCALE comment): scale wall
// time up so the transport reads, and say so in the HUD rather than pretend
// the field moves at its literal physical rate.
export const WIND_TIME_SCALE = 900

// Bounding box (city bbox ± margin) particles drift within before respawning.
const BOUNDS = { x: 26, z: 22 }

interface Props {
  wind: WindField
  count: number
  strengthRef: MutableRefObject<number>
}

// CPU advection on the local plane (km), not lat/lon on a sphere — this concept
// has no globe. Wind is still sampled from the real GFS grid via inline
// bilinear interpolation (mirrors loaders.ts wind.sample(), inlined because the
// per-frame loop must not allocate a fresh [u,v] array per particle per frame).
export default function WindStreaks({ wind, count, strengthRef }: Props) {
  const reduced = useReducedMotion()
  const matRef = useRef<THREE.LineBasicMaterial>(null)

  const { nx, ny, lo1, la1, dx, dy } = wind.header
  const latLo = la1 - (ny - 1) * dy
  const cosLat0 = Math.cos((SEOUL_CENTER.lat * Math.PI) / 180)

  const st = useMemo(() => {
    const x = new Float32Array(count)
    const z = new Float32Array(count)
    const y = new Float32Array(count) // fixed per-particle height, set once at seed
    const age = new Float32Array(count)
    const hist = new Float32Array(count * TRAIL * 3)
    const seed = (i: number) => {
      x[i] = (Math.random() * 2 - 1) * BOUNDS.x
      z[i] = (Math.random() * 2 - 1) * BOUNDS.z
      y[i] = 0.25 + Math.random() * 0.9
      age[i] = Math.random() * 8
      for (let t = 0; t < TRAIL; t++) {
        hist[(i * TRAIL + t) * 3] = x[i]
        hist[(i * TRAIL + t) * 3 + 1] = y[i]
        hist[(i * TRAIL + t) * 3 + 2] = z[i]
      }
    }
    for (let i = 0; i < count; i++) seed(i)
    const segVerts = count * (TRAIL - 1) * 2
    const positions = new Float32Array(segVerts * 3)
    const colors = new Float32Array(segVerts * 3)
    return { x, z, y, age, hist, positions, colors, seed }
  }, [count])

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(st.positions, 3))
    g.setAttribute('color', new THREE.BufferAttribute(st.colors, 3))
    return g
  }, [st])

  const slow = useMemo(() => new THREE.Color(SEOUL.pmClean), [])
  const fast = useMemo(() => new THREE.Color(SEOUL.accent), [])

  useFrame((_, rawDt) => {
    const strength = strengthRef.current
    if (matRef.current) matRef.current.opacity = strength * 0.85
    if (reduced || strength <= 0.001) return
    const dt = Math.min(rawDt, 0.05) * WIND_TIME_SCALE
    const { x, z, y, age, hist, positions, colors } = st
    const wu = wind.u
    const wv = wind.v
    let vi = 0
    for (let i = 0; i < count; i++) {
      // world x,z (km) → lon,lat, for sampling the wind grid only.
      const lon = SEOUL_CENTER.lon + x[i] / (KM_PER_DEG_LAT * cosLat0)
      const lat = SEOUL_CENTER.lat + z[i] / KM_PER_DEG_LAT
      const wl = ((((lon + 180) % 360) + 360) % 360) - 180
      const fx = (wl - lo1) / dx
      const clat = lat < latLo ? latLo : lat > la1 ? la1 : lat
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
      // u,v are m/s; dt already carries WIND_TIME_SCALE, so this is (m/s × scaled-s) / 1000 → km.
      x[i] += (u * dt) / 1000
      z[i] -= (v * dt) / 1000 // v is +north; world z is +south, so subtract
      age[i] += rawDt
      if (age[i] > 9 || Math.abs(x[i]) > BOUNDS.x || Math.abs(z[i]) > BOUNDS.z) {
        st.seed(i)
        continue
      }
      const base = i * TRAIL * 3
      hist.copyWithin(base, base + 3, base + TRAIL * 3)
      hist[base + (TRAIL - 1) * 3] = x[i]
      hist[base + (TRAIL - 1) * 3 + 1] = y[i]
      hist[base + (TRAIL - 1) * 3 + 2] = z[i]
      const cr = slow.r + (fast.r - slow.r) * Math.min(1, spd / 12)
      const cg = slow.g + (fast.g - slow.g) * Math.min(1, spd / 12)
      const cb = slow.b + (fast.b - slow.b) * Math.min(1, spd / 12)
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
