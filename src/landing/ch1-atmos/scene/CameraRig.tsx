// Ported from AirLens-platform apps/landing-lab
// `src/concepts/atmos/scene/CameraRig.tsx` (Wave L1, 2026-08-26).
//
// D1 scroll rewiring: the source read a whole-document `scrollY` progress
// (`concepts/atmos/scroll.ts`, 0..1 over the standalone ATMOS page). This
// chapter is one section of a 5-chapter flight, so `progressRef` here is the
// chapter-scoped 0..1 value from `useChapterProgress` (measured against this
// chapter's own `<section>`, not the whole document) — passed in as a prop by
// `Ch1AtmosScene` instead of read from a page-global hook. The KEYS
// interpolation, pmRef/windRef reveal math, and intro ramp are unchanged —
// only the source of `progressRef` moved.
import { useMemo, type MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import type * as THREE from 'three'
import { rotationToFace } from '../globeCoords'
import { useReducedMotion } from '../../shared/perf/useReducedMotion'

// Section keyframes: globe orientation (faces a lat/lon toward camera) + camera
// dolly distance. Scroll progress lerps between them; useFrame damps toward the
// interpolated target — the scroll listener never touches the camera directly.
const KEYS = [
  { face: rotationToFace(15, 30), z: 3.4 }, // S0 hero
  { face: rotationToFace(27, 78), z: 2.3 }, // S1 South Asia hotspots, dead front
  { face: rotationToFace(25, 10), z: 2.7 }, // S2 fire & wind, side
  { face: rotationToFace(15, -50), z: 2.9 }, // S3 forecast, globe left
  { face: rotationToFace(5, 130), z: 3.2 }, // S4 pull back
]

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const smooth = (t: number) => t * t * (3 - 2 * t)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

interface Props {
  groupRef: MutableRefObject<THREE.Group | null>
  progressRef: MutableRefObject<number>
  pmRef: MutableRefObject<number>
  windRef: MutableRefObject<number>
  introRef: MutableRefObject<number>
}

export default function CameraRig({ groupRef, progressRef, pmRef, windRef, introRef }: Props) {
  const keys = useMemo(() => KEYS, [])
  const reduced = useReducedMotion()

  useFrame((state, dt) => {
    // First-impression ramp: points + rim bloom in over ~1.1s (instant if reduced).
    introRef.current = reduced ? 1 : Math.min(1, introRef.current + dt / 1.1)
    const p = clamp01(progressRef.current)
    const seg = p * (keys.length - 1)
    const i = Math.min(Math.floor(seg), keys.length - 2)
    const f = smooth(seg - i)
    const a = keys[i]
    const b = keys[i + 1]
    const tx = lerp(a.face.x, b.face.x, f)
    const ty = lerp(a.face.y, b.face.y, f)
    const tz = lerp(a.z, b.z, f)
    const k = Math.min(1, dt * 2.5)

    const g = groupRef.current
    if (g) {
      g.rotation.x += (tx - g.rotation.x) * k
      g.rotation.y += (ty - g.rotation.y) * k
    }
    const cam = state.camera
    cam.position.z += (tz - cam.position.z) * k
    cam.lookAt(0, 0, 0)

    pmRef.current = clamp01((p - 0.16) / 0.18) // reveal across S1
    windRef.current = clamp01((p - 0.4) / 0.18) // fade in across S2
  })

  return null
}
