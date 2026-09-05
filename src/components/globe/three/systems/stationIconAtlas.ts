/**
 * stationIconAtlas — ground vs. satellite-derived station glyph lookup.
 *
 * White-on-alpha sprite (`station-ground.png` / `station-satellite.png`) —
 * vertex color still supplies the AQI/satellite tint, unchanged. The old
 * procedural mast-icon canvas draw is gone (globe-kit ships both shapes as
 * flat assets now — one less canvas to hand-tune, see docs/design-reports/
 * 2026-09-05-design-audit/03-globe-sprite-kit.md).
 */
import type * as THREE from 'three'
import { getSprite } from './spriteKit'

export function getStationIconTexture(isSatellite: boolean): THREE.Texture {
  return getSprite(isSatellite ? 'station-satellite' : 'station-ground')
}

export function isSatelliteSource(source?: string, sensorType?: string): boolean {
  if (!source && !sensorType) return false
  const s = (source ?? '').toLowerCase()
  return s.includes('satellite') || s.includes('maiac') || s.includes('aod') || sensorType === 'satellite'
}
