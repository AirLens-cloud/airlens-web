/**
 * CountryLabels — country name labels anchored on the globe surface.
 *
 * Canvas-texture sprites (no troika / drei <Text>) — uses the browser's
 * already-loaded DOM font, so it makes ZERO network requests and is immune
 * to CSP connect-src restrictions. Matches the in-repo CanvasTexture pattern
 * (PollenParticles.createPollenTexture). Front-hemisphere cull hides back-side
 * labels. Largest ~60 countries by bbox area.
 */
import { useMemo, useRef, useEffect } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import type { Polygon, MultiPolygon, Position } from 'geojson'
import { useCountryFeatures } from '../../../../hooks/useCountryData'
import { GLOBE_COLORS } from '../../../../lib/config/globe-v2'
import { latLonToVec3, GLOBE_R } from '../systems/geoUtils'

const LABEL_R = GLOBE_R + 0.012
const MAX_LABELS = 60
const BASE_SCALE = 0.05
const FONT_PX = 32
const TEX_DPR = 2

interface CLabel {
  name: string
  pos: THREE.Vector3
  normal: THREE.Vector3
  texture: THREE.CanvasTexture
  aspect: number
}

function makeLabelTexture(name: string): { texture: THREE.CanvasTexture; aspect: number } {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  const font = `600 ${FONT_PX}px Inter, system-ui, sans-serif`
  ctx.font = font
  const padX = FONT_PX * 0.4
  const padY = FONT_PX * 0.3
  const w = Math.ceil(ctx.measureText(name).width + padX * 2)
  const h = Math.ceil(FONT_PX + padY * 2)
  canvas.width = Math.max(1, w * TEX_DPR)
  canvas.height = Math.max(1, h * TEX_DPR)

  ctx.scale(TEX_DPR, TEX_DPR)
  ctx.font = font
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.lineWidth = FONT_PX * 0.16
  ctx.strokeStyle = GLOBE_COLORS.LABEL_OUTLINE
  ctx.strokeText(name, w / 2, h / 2)
  ctx.fillStyle = GLOBE_COLORS.COUNTRY_LABEL
  ctx.fillText(name, w / 2, h / 2)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.needsUpdate = true
  return { texture, aspect: w / h }
}

const CountryLabels = () => {
  const { camera } = useThree()
  const features = useCountryFeatures()

  const labels = useMemo<CLabel[]>(() => {
    if (!features) return []
    const ranked: { name: string; pos: THREE.Vector3; normal: THREE.Vector3; area: number }[] = []
    for (const f of features.features) {
      const g = f.geometry as Polygon | MultiPolygon
      let ring: Position[] = []
      if (g.type === 'Polygon') {
        ring = g.coordinates[0]
      } else if (g.type === 'MultiPolygon') {
        for (const poly of g.coordinates) if (poly[0].length > ring.length) ring = poly[0]
      }
      if (ring.length < 3) continue

      const name = ((f.properties ?? {}) as Record<string, unknown>).name as string | undefined
      if (!name) continue

      let minLon = 180, maxLon = -180, minLat = 90, maxLat = -90, sLon = 0, sLat = 0
      for (const [lon, lat] of ring) {
        sLon += lon
        sLat += lat!
        if (lon < minLon) minLon = lon
        if (lon > maxLon) maxLon = lon
        if (lat! < minLat) minLat = lat!
        if (lat! > maxLat) maxLat = lat!
      }
      const cLon = sLon / ring.length
      const cLat = sLat / ring.length
      const pos = latLonToVec3(cLat, cLon, LABEL_R)
      ranked.push({ name, pos, normal: pos.clone().normalize(), area: (maxLon - minLon) * (maxLat - minLat) })
    }
    ranked.sort((a, b) => b.area - a.area)
    return ranked.slice(0, MAX_LABELS).map((l) => {
      const { texture, aspect } = makeLabelTexture(l.name)
      return { name: l.name, pos: l.pos, normal: l.normal, texture, aspect }
    })
  }, [features])

  // Dispose canvas textures on change / unmount.
  useEffect(() => {
    return () => { for (const l of labels) l.texture.dispose() }
  }, [labels])

  const refs = useRef<(THREE.Sprite | null)[]>([])

  useFrame(() => {
    const camDir = camera.position.clone().normalize()
    for (let i = 0; i < labels.length; i++) {
      const s = refs.current[i]
      if (s) s.visible = labels[i].normal.dot(camDir) > 0.15
    }
  })

  if (labels.length === 0) return null

  return (
    <>
      {labels.map((l, i) => (
        <sprite
          key={l.name}
          position={l.pos}
          scale={[BASE_SCALE * l.aspect, BASE_SCALE, 1]}
          ref={(n) => { refs.current[i] = n }}
        >
          <spriteMaterial map={l.texture} transparent depthWrite={false} depthTest={false} />
        </sprite>
      ))}
    </>
  )
}

export default CountryLabels
