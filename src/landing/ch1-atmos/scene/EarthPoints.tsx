// Ported verbatim from AirLens-platform apps/landing-lab
// `src/concepts/atmos/scene/EarthPoints.tsx` (Wave L1, 2026-08-26); data/perf
// imports rebound to `shared/data`/`shared/perf`, theme split across the
// chapter-local module (EARTH) and the shared AQI re-export (AQI_GRADE_HEX).
import { useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { EarthPoints as EarthPointsData, Pm25Grid } from '../../shared/data/loaders'
import { useReducedMotion } from '../../shared/perf/useReducedMotion'
import { AQI_GRADE_HEX } from '../../shared/theme/config'
import { EARTH } from '../theme'
import { earthFrag, earthVert } from './shaders'

interface Props {
  points: EarthPointsData
  pm25: Pm25Grid
  pmStrengthRef: MutableRefObject<number>
  introRef: MutableRefObject<number>
  size?: number
}

export default function EarthPoints({ points, pm25, pmStrengthRef, introRef, size = 2.4 }: Props) {
  const matRef = useRef<THREE.ShaderMaterial>(null)
  const reduced = useReducedMotion()

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(points.positions, 3))
    g.setAttribute('aIntensity', new THREE.BufferAttribute(points.intensity, 1))
    return g
  }, [points])

  const texture = useMemo(() => {
    const tex = new THREE.DataTexture(pm25.data, pm25.meta.nLon, pm25.meta.nLat, THREE.RedFormat, THREE.UnsignedByteType)
    tex.wrapS = THREE.RepeatWrapping
    tex.minFilter = THREE.LinearFilter
    tex.magFilter = THREE.LinearFilter
    tex.needsUpdate = true
    return tex
  }, [pm25])

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPmStrength: { value: 0 },
      uIntro: { value: 0 },
      uSize: { value: size },
      uPixelRatio: { value: Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2) },
      uPmTex: { value: texture },
      uOcean: { value: new THREE.Color(EARTH.ocean) },
      uLand: { value: new THREE.Color(EARTH.land) },
      uAmber: { value: new THREE.Color(AQI_GRADE_HEX.MODERATE) },
      uRed: { value: new THREE.Color(AQI_GRADE_HEX.UNHEALTHY) },
      uPurple: { value: new THREE.Color(AQI_GRADE_HEX.HAZARDOUS) },
    }),
    [texture, size],
  )

  useFrame((_, dt) => {
    const m = matRef.current
    if (!m) return
    if (!reduced) m.uniforms.uTime.value += dt // breathing off under reduced-motion
    m.uniforms.uPmStrength.value = pmStrengthRef.current // data reveal is not motion
    m.uniforms.uIntro.value = introRef.current // first-impression fade-in
  })

  return (
    <points geometry={geometry}>
      <shaderMaterial
        ref={matRef}
        vertexShader={earthVert}
        fragmentShader={earthFrag}
        uniforms={uniforms}
        transparent
        depthWrite
      />
    </points>
  )
}
