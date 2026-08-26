// Ported verbatim from AirLens-platform apps/landing-lab
// `src/concepts/atmos/scene/Stars.tsx` (Wave L1, 2026-08-26); perf/theme
// imports rebound to this repo's `shared/perf` and chapter-local theme module.
//
// `react-hooks/purity` is disabled file-wide: `Math.random()` seeds this
// starfield's position buffer once inside `useMemo`, keyed on `count` — the
// standard r3f pattern for procedural geometry that must not reshuffle on
// every render (react-hooks' React-Compiler-oriented purity rule doesn't
// recognize `useMemo`'s one-time-per-key contract as an exemption; see
// WindParticles.tsx for the same pattern, more heavily commented).
/* eslint-disable react-hooks/purity */
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useReducedMotion } from '../../shared/perf/useReducedMotion'
import { ATMOS } from '../theme'
import { starFrag, starVert } from './shaders'

export default function Stars({ count = 2000 }: { count?: number }) {
  const matRef = useRef<THREE.ShaderMaterial>(null)
  const reduced = useReducedMotion()

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const pos = new Float32Array(count * 3)
    const seed = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      const th = 2 * Math.PI * Math.random()
      const ph = Math.acos(2 * Math.random() - 1)
      const r = 8 + Math.random() * 9
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th)
      pos[i * 3 + 1] = r * Math.cos(ph)
      pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th)
      seed[i] = Math.random()
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
    return g
  }, [count])

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(ATMOS.ink) },
      uPixelRatio: { value: Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2) },
    }),
    [],
  )

  useFrame((_, dt) => {
    if (matRef.current && !reduced) matRef.current.uniforms.uTime.value += dt
  })

  return (
    <points geometry={geometry}>
      <shaderMaterial ref={matRef} vertexShader={starVert} fragmentShader={starFrag} uniforms={uniforms} transparent depthWrite={false} />
    </points>
  )
}
