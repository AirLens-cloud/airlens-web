// AAA tests for the globe coordinate convention this chapter's scene and
// hotspot markers both depend on (point cloud, hotspot rings, camera facing).
import { describe, it, expect } from 'vitest'
import { GLOBE_R, HOTSPOTS, latLonToGlobe, rotationToFace } from './globeCoords'

describe('latLonToGlobe', () => {
  it('places (lat=0, lon=-180) on the +x axis at the given radius', () => {
    // Arrange — phi = 90 - 0 = 90deg, theta = -180 + 180 = 0deg
    const lat = 0
    const lon = -180
    // Act
    const [x, y, z] = latLonToGlobe(lat, lon, 2)
    // Assert
    expect(x).toBeCloseTo(-2, 5)
    expect(y).toBeCloseTo(0, 5)
    expect(z).toBeCloseTo(0, 5)
  })

  it('places the north pole (lat=90) on the +y axis regardless of longitude', () => {
    // Arrange / Act
    const [x, y, z] = latLonToGlobe(90, 47)
    // Assert
    expect(y).toBeCloseTo(GLOBE_R, 5)
    expect(x).toBeCloseTo(0, 5)
    expect(z).toBeCloseTo(0, 5)
  })

  it('always returns a point at the requested radius from the origin', () => {
    // Arrange
    const r = 1.012
    // Act
    const [x, y, z] = latLonToGlobe(28.61, 77.21, r)
    // Assert
    expect(Math.hypot(x, y, z)).toBeCloseTo(r, 5)
  })
})

describe('rotationToFace', () => {
  it('returns finite euler angles for every cataloged hotspot', () => {
    // Arrange / Act / Assert
    for (const h of HOTSPOTS) {
      const { x, y } = rotationToFace(h.lat, h.lon)
      expect(Number.isFinite(x)).toBe(true)
      expect(Number.isFinite(y)).toBe(true)
    }
  })

  it('is deterministic — the same coordinate always produces the same rotation', () => {
    // Arrange — one of CameraRig's own keyframes (S1: South Asia hotspots)
    // Act
    const a = rotationToFace(27, 78)
    const b = rotationToFace(27, 78)
    // Assert
    expect(a).toEqual(b)
  })
})
