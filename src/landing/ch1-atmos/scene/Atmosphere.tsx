// Ported verbatim from AirLens-platform apps/landing-lab
// `src/concepts/atmos/scene/Atmosphere.tsx` (Wave L1, 2026-08-26); theme
// import rebound to the chapter-local theme module.
import { useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { ATMOS } from '../theme'
import { atmoFrag, atmoVert } from './shaders'

const RIM_INTENSITY = 0.6

// BackSide fresnel rim glow — thin cyan halo, exponential falloff, brighter at
// the top (virtual light from above) so it reads as an atmosphere, not a donut.
// Blooms in with the first-impression ramp (introRef).
export default function Atmosphere({ introRef }: { introRef: MutableRefObject<number> }) {
  const matRef = useRef<THREE.ShaderMaterial>(null)
  const uniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color(ATMOS.accent) },
      uIntensity: { value: 0 },
      uPower: { value: 4.5 },
    }),
    [],
  )

  useFrame(() => {
    const m = matRef.current
    if (m) m.uniforms.uIntensity.value = RIM_INTENSITY * introRef.current
  })

  return (
    <mesh scale={1.135}>
      <sphereGeometry args={[1, 48, 48]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={atmoVert}
        fragmentShader={atmoFrag}
        uniforms={uniforms}
        transparent
        side={THREE.BackSide}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  )
}
