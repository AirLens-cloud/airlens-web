// Ported verbatim from AirLens-platform apps/landing-lab
// `src/concepts/seoul/scene/Haze.tsx` (Wave L3, 2026-08-26); `theme/config`
// import rebound to this chapter's local `../theme`.
import { useMemo } from 'react'
import * as THREE from 'three'
import { pmToColor } from '../projection'
import { SEOUL } from '../theme'

// A layered-plane haze, not a volumetric sim — three translucent sheets over
// the city whose color and combined opacity track the mean of the 25 district
// centroid readings. Simple on purpose: the PM2.5 number is the honest part,
// the haze is an illustration of it.
const LAYERS = [
  { y: 0.35, scale: 1.0 },
  { y: 0.75, scale: 1.12 },
  { y: 1.2, scale: 1.28 },
] as const

// City extent is ~37km E-W × 31km N-S (see projection.ts SEOUL_CENTER derivation);
// this plane comfortably overshoots it so the haze never clips at the city edge.
const PLANE_KM = 46

export default function Haze({ meanPm25 }: { meanPm25: number }) {
  const color = useMemo(
    () => new THREE.Color(pmToColor(meanPm25, SEOUL.pmClean, SEOUL.pmWarm, SEOUL.pmHot)),
    [meanPm25],
  )
  // 0..1 of the grid's own cap (150 µg/m³) — drives how much of each layer shows.
  const intensity = Math.min(1, meanPm25 / 150)
  if (intensity <= 0.01) return null

  return (
    <group>
      {LAYERS.map((l, i) => (
        <mesh key={i} position={[0, l.y, 0]} rotation-x={-Math.PI / 2} renderOrder={1}>
          <planeGeometry args={[PLANE_KM * l.scale, PLANE_KM * l.scale]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={intensity * (0.16 - i * 0.035)}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  )
}
