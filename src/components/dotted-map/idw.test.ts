/**
 * dotted-map/idw — density-alpha decay tests (V-W4 delta 3, AAA).
 * Verifies the ported `densityAlphaFactor` semantics: dots resting on sparse
 * observation (far from every station) get a LOWER alpha bucket than dots
 * near a station, and dots outside all coverage stay in the 255 (unknown)
 * group rather than acquiring a fabricated density reading.
 */
import { describe, it, expect } from 'vitest'
import { precomputeDotColorGroups, ALPHA_BUCKETS, alphaBucketToFactor } from './idw'
import type { StationData } from '../../types/dotted-map'

describe('precomputeDotColorGroups — density-alpha decay', () => {
  it('gives a dot exactly at a station the top (most-confident) alpha bucket', () => {
    // Arrange
    const stations: StationData[] = [{ latitude: 37.5, longitude: 127, pm25: 20 }]
    const landPoints: [number, number][] = [[127, 37.5]] // [lng, lat] — exact station hit

    // Act
    const { colorGroups, alphaGroups } = precomputeDotColorGroups(landPoints, stations)

    // Assert
    expect(colorGroups[0]).not.toBe(255)
    expect(alphaGroups[0]).toBe(ALPHA_BUCKETS - 1)
  })

  it('gives a dot far from the nearest station (but within MAX_DISTANCE_DEG) a lower alpha bucket than a dot near it', () => {
    // Arrange — one station; a near dot (1°) and a far dot (25°), both within the 30° search radius
    const stations: StationData[] = [{ latitude: 0, longitude: 0, pm25: 40 }]
    const nearDot: [number, number] = [0, 1] // ~1° away
    const farDot: [number, number] = [0, 25] // ~25° away

    // Act
    const near = precomputeDotColorGroups([nearDot], stations)
    const far = precomputeDotColorGroups([farDot], stations)

    // Assert — both get a real color (in coverage), but the far dot is more faded.
    expect(near.colorGroups[0]).not.toBe(255)
    expect(far.colorGroups[0]).not.toBe(255)
    expect(far.alphaGroups[0]).toBeLessThan(near.alphaGroups[0])
  })

  it('leaves dots outside all station coverage in the 255 (unknown) group — no fabricated density reading', () => {
    // Arrange — station is > MAX_DISTANCE_DEG (30°) from the dot
    const stations: StationData[] = [{ latitude: 0, longitude: 0, pm25: 40 }]
    const outOfRange: [number, number] = [0, 60]

    // Act
    const { colorGroups } = precomputeDotColorGroups([outOfRange], stations)

    // Assert
    expect(colorGroups[0]).toBe(255)
  })

  it('alphaBucketToFactor is monotonic and bounded to [DENSITY_ALPHA_MIN, 1]', () => {
    // Act
    const factors = Array.from({ length: ALPHA_BUCKETS }, (_, i) => alphaBucketToFactor(i))

    // Assert
    for (let i = 1; i < factors.length; i++) {
      expect(factors[i]).toBeGreaterThanOrEqual(factors[i - 1])
    }
    expect(factors[0]).toBeGreaterThan(0)
    expect(factors[factors.length - 1]).toBeCloseTo(1, 5)
  })

  it('returns all-255 color groups (and no crash) when no stations are supplied', () => {
    // Arrange
    const landPoints: [number, number][] = [[0, 0], [10, 10]]

    // Act
    const { colorGroups, alphaGroups } = precomputeDotColorGroups(landPoints, [])

    // Assert
    expect(Array.from(colorGroups)).toEqual([255, 255])
    expect(alphaGroups.length).toBe(2)
  })
})
