/**
 * stationIconAtlas — procedural 64×64 canvas with station antenna icon.
 * White outline on transparent background — vertex color provides AQI tint.
 * Satellite-sourced stations are distinguished by cyan vertex color.
 */
import * as THREE from 'three'

const SIZE = 64

let _cachedTexture: THREE.CanvasTexture | null = null

export function getStationIconTexture(): THREE.CanvasTexture {
  if (_cachedTexture) return _cachedTexture

  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, SIZE, SIZE)

  const cx = SIZE / 2
  const bot = SIZE - 8

  ctx.strokeStyle = '#ffffff'
  ctx.fillStyle = '#ffffff'
  ctx.lineWidth = 2.5
  ctx.lineCap = 'round'

  // Vertical mast
  ctx.beginPath()
  ctx.moveTo(cx, 12)
  ctx.lineTo(cx, bot)
  ctx.stroke()

  // Horizontal bars (antenna)
  const bars = [16, 24, 32]
  const widths = [18, 14, 10]
  for (let i = 0; i < bars.length; i++) {
    ctx.beginPath()
    ctx.moveTo(cx - widths[i] / 2, bars[i])
    ctx.lineTo(cx + widths[i] / 2, bars[i])
    ctx.stroke()
  }

  // Top dot
  ctx.beginPath()
  ctx.arc(cx, 10, 3, 0, Math.PI * 2)
  ctx.fill()

  // Base triangle
  ctx.beginPath()
  ctx.moveTo(cx - 12, bot)
  ctx.lineTo(cx + 12, bot)
  ctx.lineTo(cx, bot - 8)
  ctx.closePath()
  ctx.stroke()

  const tex = new THREE.CanvasTexture(canvas)
  tex.needsUpdate = true
  _cachedTexture = tex
  return tex
}

export function isSatelliteSource(source?: string, sensorType?: string): boolean {
  if (!source && !sensorType) return false
  const s = (source ?? '').toLowerCase()
  return s.includes('satellite') || s.includes('maiac') || s.includes('aod') || sensorType === 'satellite'
}
