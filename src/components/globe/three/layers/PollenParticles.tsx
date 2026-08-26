/**
 * PollenParticles — floating pollen-grain particles driven by real concentration.
 *
 * Samples the "total pollen" grid (Open-Meteo CAMS, Europe) and importance-samples
 * spawn locations weighted by grains/m³, so particles cluster over regions where
 * pollen is actually reported and vanish entirely where the CAMS domain has no data
 * (honest — no decorative particles outside coverage). Each grain is tinted by the
 * shared POLLEN_COLOR_SCALE (green → gold → red) so density and intensity read at a
 * glance. Particles drift with wind, oscillate, and rotate for a natural float.
 */
import { useRef, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { useGlobeStore } from '../../../../store/globeStore'
import { GLOBE_CONFIG } from '../../../../lib/config/globe'
import { useWindTexture } from '../../../../hooks/useWindTexture'
import { fetchPollenTotalGrid } from '../../../../api/airQualityGrid'
import { valueToRgb } from '../systems/idwCore'
import { POLLEN_COLOR_SCALE } from '../../../../lib/earth/config'
import { latLonToVec3 } from '../systems/geoUtils'
import type { PollenParticle } from '../../../../types/globe'
import type { OverlayGridData } from '../../../../types/globe';

const CFG = GLOBE_CONFIG.POLLEN_PARTICLES
const WIND = GLOBE_CONFIG.GLOBE_V2.WIND_TEXTURE
const POLLEN_SCALE_MAX = POLLEN_COLOR_SCALE[POLLEN_COLOR_SCALE.length - 1][0]

const _dummy = new THREE.Object3D()
const _color = new THREE.Color()

/** Non-zero grid cell weighted for importance sampling. */
interface PollenCell {
  lat: number
  lon: number
  value: number
}

function getPollenCount(tier: string): number {
  return CFG.PARTICLE_COUNTS[tier] ?? CFG.PARTICLE_COUNTS.low
}

/** Collect grid cells with pollen > 0 and their cumulative weights (∝ grains/m³). */
function buildCells(grid: OverlayGridData): { cells: PollenCell[]; cumulative: number[]; total: number } {
  const cells: PollenCell[] = []
  const cumulative: number[] = []
  let total = 0
  for (let latIdx = 0; latIdx < grid.nLat; latIdx++) {
    for (let lonIdx = 0; lonIdx < grid.nLon; lonIdx++) {
      const v = grid.values[latIdx * grid.nLon + lonIdx]
      if (!Number.isFinite(v) || v <= 0) continue
      cells.push({ lat: grid.latMin + latIdx * grid.dLat, lon: grid.lonMin + lonIdx * grid.dLon, value: v })
      total += v
      cumulative.push(total)
    }
  }
  return { cells, cumulative, total }
}

/** Soft white radial grain — hue comes from per-instance vertex color. */
function createPollenTexture(): THREE.CanvasTexture {
  const size = CFG.TEXTURE_SIZE
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const cx = size / 2
  const cy = size / 2
  const r = size * 0.42

  ctx.clearRect(0, 0, size, size)

  // 5-lobe pollen grain shape
  ctx.beginPath()
  for (let i = 0; i < 360; i++) {
    const angle = (i * Math.PI) / 180
    const lobeR = r * (0.7 + 0.3 * Math.abs(Math.sin(angle * 2.5)))
    const x = cx + Math.cos(angle) * lobeR
    const y = cy + Math.sin(angle) * lobeR
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()

  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
  grad.addColorStop(0, 'rgba(255,255,255,0.95)')
  grad.addColorStop(0.6, 'rgba(255,255,255,0.55)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = grad
  ctx.fill()

  const tex = new THREE.CanvasTexture(canvas)
  tex.needsUpdate = true
  return tex
}

const PollenParticles = () => {
  const qualityPreset = useGlobeStore((s) => s.qualityPreset)
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const windTex = useWindTexture()
  const particlesRef = useRef<PollenParticle[]>([])
  const cellsRef = useRef<{ cells: PollenCell[]; cumulative: number[]; total: number }>({ cells: [], cumulative: [], total: 0 })
  const activeCountRef = useRef(0)
  const maxCount = getPollenCount(qualityPreset.tier)
  const { camera } = useThree()

  const texture = useMemo(() => createPollenTexture(), [])
  const geometry = useMemo(() => new THREE.PlaneGeometry(1, 1), [])

  /** Weighted-random cell pick (importance sampling by concentration). */
  const pickCell = (): PollenCell | null => {
    const { cells, cumulative, total } = cellsRef.current
    if (cells.length === 0) return null
    const target = Math.random() * total
    // linear scan is fine — a European 2° grid is only a few hundred cells
    for (let i = 0; i < cumulative.length; i++) {
      if (target <= cumulative[i]) return cells[i]
    }
    return cells[cells.length - 1]
  }

  const spawnAt = (p: PollenParticle, cell: PollenCell): void => {
    // small jitter within the cell so grains don't stack on the cell center
    p.lat = cell.lat + (Math.random() - 0.5) * CFG.GLOBE_R
    p.lon = cell.lon + (Math.random() - 0.5) * CFG.GLOBE_R
    p.age = Math.random() * CFG.MAX_AGE
    p.phase = Math.random() * Math.PI * 2
    p.concentrationNorm = Math.min(cell.value / POLLEN_SCALE_MAX, 1)
    const [r, g, b] = valueToRgb(cell.value, POLLEN_COLOR_SCALE)
    _color.setRGB(r / 255, g / 255, b / 255)
    p.colorHex = _color.getHex()
  }

  // Load real pollen grid → build weighted cells → seed particles. Empty grid = no render.
  useEffect(() => {
    let cancelled = false
    fetchPollenTotalGrid().then((grid) => {
      if (cancelled || !meshRef.current) return
      const built = grid ? buildCells(grid) : { cells: [], cumulative: [], total: 0 }
      cellsRef.current = built

      if (built.cells.length === 0) {
        activeCountRef.current = 0
        meshRef.current.count = 0
        return
      }

      const particles: PollenParticle[] = []
      const mesh = meshRef.current
      for (let i = 0; i < maxCount; i++) {
        const cell = pickCell()!
        const p: PollenParticle = { lat: 0, lon: 0, age: 0, phase: 0, concentrationNorm: 0, colorHex: 0xffffff }
        spawnAt(p, cell)
        particles.push(p)
        _color.setHex(p.colorHex)
        mesh.setColorAt(i, _color)
      }
      particlesRef.current = particles
      activeCountRef.current = maxCount
      mesh.count = maxCount
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    })
    return () => { cancelled = true }
  }, [maxCount])

  useEffect(() => {
    return () => {
      texture.dispose()
      geometry.dispose()
    }
  }, [texture, geometry])

  useFrame(({ clock }) => {
    const mesh = meshRef.current
    if (!mesh || activeCountRef.current === 0) return

    const particles = particlesRef.current
    const t = clock.getElapsedTime()
    const camPos = camera.position

    const texData = windTex ? (windTex.image.data as Float32Array) : null
    const tw = WIND.WIDTH
    const th = WIND.HEIGHT
    const range = WIND.SCALE_MAX - WIND.SCALE_MIN
    let colorDirty = false

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i]
      p.age += 1

      if (p.age >= CFG.MAX_AGE) {
        const cell = pickCell()
        if (cell) {
          spawnAt(p, cell)
          _color.setHex(p.colorHex)
          mesh.setColorAt(i, _color)
          colorDirty = true
        } else {
          p.age = 0
        }
      }

      // Wind advection (gentle)
      if (texData) {
        const tx = Math.floor(((p.lon + 180) / 360) * tw) % tw
        const ty = Math.floor(((90 - p.lat) / 180) * th)
        const tidx = (ty * tw + tx) * 4
        const uNorm = texData[tidx] ?? 0.5
        const vNorm = texData[tidx + 1] ?? 0.5
        const u = uNorm * range + WIND.SCALE_MIN
        const v = vNorm * range + WIND.SCALE_MIN
        p.lon += u * CFG.SPEED_FACTOR
        p.lat += v * CFG.SPEED_FACTOR
      }

      p.lat = Math.max(-85, Math.min(85, p.lat))
      if (p.lon > 180) p.lon -= 360
      if (p.lon < -180) p.lon += 360

      // Vertical float oscillation
      const floatOffset = Math.sin(t * CFG.FLOAT_SPEED + p.phase) * CFG.FLOAT_AMPLITUDE
      const pos = latLonToVec3(p.lat, p.lon, CFG.GLOBE_R + floatOffset)

      // Fade in/out
      const ageFrac = p.age / CFG.MAX_AGE
      const fadeIn = Math.min(ageFrac * 5, 1)
      const fadeOut = Math.min((1 - ageFrac) * 5, 1)
      const fade = fadeIn * fadeOut

      const scale = (CFG.SIZE_MIN + p.concentrationNorm * (CFG.SIZE_MAX - CFG.SIZE_MIN)) * fade

      _dummy.position.copy(pos)
      _dummy.scale.setScalar(scale)
      _dummy.lookAt(camPos)
      _dummy.rotateZ(t * CFG.ROTATION_SPEED + p.phase)
      _dummy.updateMatrix()
      mesh.setMatrixAt(i, _dummy.matrix)
    }

    mesh.instanceMatrix.needsUpdate = true
    if (colorDirty && mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, undefined, maxCount]}
      frustumCulled={false}
    >
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={CFG.OPACITY}
        depthWrite={false}
        blending={THREE.NormalBlending}
        alphaTest={0.1}
        side={THREE.DoubleSide}
        vertexColors
      />
    </instancedMesh>
  )
}

export default PollenParticles
