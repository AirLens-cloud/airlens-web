// Ported from AirLens-platform apps/landing-lab
// `src/concepts/seoul/scene/CameraRig.tsx` (Wave L3, 2026-08-26).
//
// D1 scroll rewiring: the source read a whole-document `scrollY` progress
// (`concepts/seoul/scroll.ts`, 0..1 over the standalone AIRSHED page). This
// chapter is one section of a 5-chapter flight, so `progressRef` here is the
// chapter-scoped 0..1 value from `useChapterProgress` (measured against this
// chapter's own `<section>`, not the whole document) — passed in as a prop by
// `Ch3AirshedScene` instead of read from a page-global hook, the same
// rewiring Ch1's `CameraRig.tsx` did for `scroll.ts`. The KEYS interpolation
// and reduced-motion static hold are unchanged — only the source of
// `progressRef` moved.
import { useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useReducedMotion } from '../../shared/perf/useReducedMotion'

// Scroll keyframes: a dolly across the city, south → west → downtown → east →
// pulled-back overview. Positions/lookAt in scene km (see projection.ts).
// Damped toward the scroll-interpolated target each frame — the scroll
// listener never touches the camera directly (same contract as ATMOS).
const KEYS = [
  { pos: [0, 26, 40], look: [0, 0, 0] }, // S0 hero — whole city, pulled back
  { pos: [-15, 9, 15], look: [-15, 1, 0] }, // S1 west side — haze + interpolation caveat
  { pos: [0, 6, 11], look: [0, 1, -2] }, // S2 downtown — low, following the wind streaks
  { pos: [16, 8, 13], look: [16, 1, 0] }, // S3 east side — district-table context
  { pos: [3, 30, 36], look: [0, 0, 0] }, // S4 pull back — finale overview
] as const

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const smooth = (t: number) => t * t * (3 - 2 * t)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

interface Props {
  progressRef: MutableRefObject<number>
}

export default function CameraRig({ progressRef }: Props) {
  const keys = useMemo(() => KEYS, [])
  const reduced = useReducedMotion()
  const lookTarget = useRef(new THREE.Vector3())
  const settled = useRef(false)

  useFrame((state, dt) => {
    const cam = state.camera

    if (reduced) {
      // Static single frame: hold the pulled-back overview, no scroll-linked scrub.
      if (!settled.current) {
        const key = keys[keys.length - 1]
        cam.position.set(key.pos[0], key.pos[1], key.pos[2])
        lookTarget.current.set(key.look[0], key.look[1], key.look[2])
        cam.lookAt(lookTarget.current)
        settled.current = true
      }
      return
    }

    const p = clamp01(progressRef.current)
    const seg = p * (keys.length - 1)
    const i = Math.min(Math.floor(seg), keys.length - 2)
    const f = smooth(seg - i)
    const a = keys[i]
    const b = keys[i + 1]
    const tx = lerp(a.pos[0], b.pos[0], f)
    const ty = lerp(a.pos[1], b.pos[1], f)
    const tz = lerp(a.pos[2], b.pos[2], f)
    const lx = lerp(a.look[0], b.look[0], f)
    const ly = lerp(a.look[1], b.look[1], f)
    const lz = lerp(a.look[2], b.look[2], f)
    const k = Math.min(1, dt * 2.2)

    cam.position.x += (tx - cam.position.x) * k
    cam.position.y += (ty - cam.position.y) * k
    cam.position.z += (tz - cam.position.z) * k
    lookTarget.current.x += (lx - lookTarget.current.x) * k
    lookTarget.current.y += (ly - lookTarget.current.y) * k
    lookTarget.current.z += (lz - lookTarget.current.z) * k
    cam.lookAt(lookTarget.current)
  })

  return null
}
