import { describe, it, expect } from 'vitest'
import { pickNearestCity } from './nearestCity'
import type { ForecastCity } from '../../types/forecast'

function city(name: string, lat: number, lon: number): ForecastCity {
  return { name, lat, lon, country_code: 'XX', hourly: [] }
}

describe('pickNearestCity', () => {
  it('returns null for an empty list', () => {
    expect(pickNearestCity([], 37.5665, 126.978)).toBeNull()
  })

  it('picks the city with the smallest haversine distance, not list order', () => {
    // Arrange — Seoul is far away; Incheon is the closest of the three.
    const cities = [city('Busan', 35.1796, 129.0756), city('Tokyo', 35.6762, 139.6503), city('Incheon', 37.4563, 126.7052)]
    // Act
    const result = pickNearestCity(cities, 37.5665, 126.978)
    // Assert
    expect(result?.city.name).toBe('Incheon')
    expect(result?.distanceKm).toBeGreaterThan(0)
  })

  it('returns 0 distance for an exact coordinate match', () => {
    const cities = [city('Seoul', 37.5665, 126.978)]
    const result = pickNearestCity(cities, 37.5665, 126.978)
    expect(result?.distanceKm).toBeCloseTo(0, 5)
  })
})
