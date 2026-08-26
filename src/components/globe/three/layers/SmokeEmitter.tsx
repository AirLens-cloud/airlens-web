/**
 * SmokeEmitter — smoke particles drifting downwind from fire hotspots.
 *
 * Spawns particles at fire locations, advects them along wind vectors
 * sampled from the shared wind DataTexture. Particles fade and grow
 * as they drift away from the source.
 */
import { useRef, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useGlobeStore } from '../../../../store/globeStore'
import { GLOBE_CONFIG } from '../../../../lib/config/globe'
import { useWindTexture } from '../../../../hooks/useWindTexture'
import { useFireSources } from '../../../../hooks/useFireSources'
import { latLonToVec3 } from '../systems/geoUtils'

const CFG = GLOBE_CONFIG.SMOKE_EMITTER
const WIND = GLOBE_CONFIG.GLOBE_V2.WIND_TEXTURE

const colorLow = new THREE.Color(CFG.COLOR_LOW)
const colorHigh = new THREE.Color(CFG.COLOR_HIGH)
const _dummy = new THREE.Object3D()

interface SmokeParticle {
  lat: number
  lon: number
  age: number
  fireIdx: number
  frpNorm: number
}

function getSmokeCount(tier: string): number {
  const counts = CFG.PARTICLE_COUNTS
  if (tier === 'high') return counts.high
  if (tier === 'medium') return counts.medium
  return counts.low
}

const SmokeEmitter = () => {
  const qualityPreset = useGlobeStore((s) => s.qualityPreset)
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const windTex = useWindTexture()
  const fires = useFireSources()
  const particlesRef = useRef<SmokeParticle[]>([])
  const maxCount = getSmokeCount(qualityPreset.tier)

  useEffect(() => {
    if (fires.length === 0) return
    const particles: SmokeParticle[] = []
    for (let i = 0; i < maxCount; i++) {
      const fireIdx = i % fires.length
      const fire = fires[fireIdx]
      particles.push({
        lat: fire.lat,
        lon: fire.lon,
        age: Math.random() * CFG.MAX_AGE,
        fireIdx,
        frpNorm: Math.min((fire.frp ?? GLOBE_CONFIG.FIRE_HOTSPOTS.FRP_MAX * 0.1) / GLOBE_CONFIG.FIRE_HOTSPOTS.FRP_MAX, 1),
      })
    }
    particlesRef.current = particles
  }, [fires, maxCount])

  const geometry = useMemo(() => new THREE.SphereGeometry(1, 4, 4), [])

  useFrame(() => {
    const mesh = meshRef.current
    if (!mesh || !windTex || fires.length === 0) return

    const particles = particlesRef.current
    const texData = windTex.image.data as Float32Array
    const tw = WIND.WIDTH
    const th = WIND.HEIGHT
    const range = WIND.SCALE_MAX - WIND.SCALE_MIN

    let visibleCount = 0

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i]
      p.age += 1

      if (p.age >= CFG.MAX_AGE) {
        const fire = fires[p.fireIdx]
        p.lat = fire.lat + (Math.random() - 0.5) * 2
        p.lon = fire.lon + (Math.random() - 0.5) * 2
        p.age = 0
      }

      const tx = Math.floor(((p.lon + 180) / 360) * tw) % tw
      const ty = Math.floor(((90 - p.lat) / 180) * th)
      const tidx = (ty * tw + tx) * 4
      const uNorm = texData[tidx] ?? 0.5
      const vNorm = texData[tidx + 1] ?? 0.5
      const u = uNorm * range + WIND.SCALE_MIN
      const v = vNorm * range + WIND.SCALE_MIN

      p.lon += u * CFG.SPEED_FACTOR
      p.lat += v * CFG.SPEED_FACTOR

      if (p.lat > 88 || p.lat < -88) {
        p.age = CFG.MAX_AGE
        continue
      }

      const ageFrac = p.age / CFG.MAX_AGE
      const scale = CFG.SIZE_START + ageFrac * (CFG.SIZE_END - CFG.SIZE_START)
      const pos = latLonToVec3(p.lat, p.lon, CFG.GLOBE_R + ageFrac * CFG.RISE_HEIGHT)

      _dummy.position.copy(pos)
      _dummy.scale.setScalar(scale)
      _dummy.updateMatrix()
      mesh.setMatrixAt(i, _dummy.matrix)

      const color = colorLow.clone().lerp(colorHigh, ageFrac)
      mesh.setColorAt(i, color)

      visibleCount = i + 1
    }

    mesh.count = visibleCount
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })

  if (fires.length === 0) return null

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, undefined, maxCount]}
      frustumCulled={false}
    >
      <meshBasicMaterial
        transparent
        opacity={CFG.OPACITY_START}
        depthWrite={false}
        blending={THREE.NormalBlending}
        vertexColors
      />
    </instancedMesh>
  )
}

export default SmokeEmitter
