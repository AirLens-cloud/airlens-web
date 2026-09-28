/**
 * resolveLocation.ts — the pure priority chain (choice > approx-ready >
 * approx-failed -> Seoul > still-resolving null). Pure and React-free, so
 * every branch is exercised directly with plain objects (AAA).
 */
import { describe, it, expect } from 'vitest'
import { resolveLocation, SEOUL_DEFAULT } from './resolveLocation'
import type { LocationChoice } from '../../store/locationChoiceStore'
import type { ApproxState } from './resolveLocation'

const PENDING: ApproxState = { status: 'pending' }
const FAILED: ApproxState = { status: 'failed' }

describe('resolveLocation', () => {
  it('priority 1: an opt-in choice always wins, regardless of approx state', () => {
    // Arrange
    const choice: LocationChoice = { lat: 48.8566, lon: 2.3522, label: 'Paris, FR', source: 'search' }
    const readyApprox: ApproxState = { status: 'ready', location: { lat: 1, lon: 2, city: 'Ignored' } }
    // Act
    const result = resolveLocation(choice, readyApprox)
    // Assert
    expect(result).toEqual({ lat: 48.8566, lon: 2.3522, label: 'Paris, FR', source: 'search' })
  })

  it('priority 1: a geolocation choice carries its own source through untouched', () => {
    // Arrange
    const choice: LocationChoice = { lat: 37.5, lon: 127.0, label: 'My location', source: 'geolocation' }
    // Act
    const result = resolveLocation(choice, PENDING)
    // Assert
    expect(result).toEqual({ lat: 37.5, lon: 127.0, label: 'My location', source: 'geolocation' })
  })

  it('priority 2: no choice, approx ready — uses the approximate location, source "approx"', () => {
    // Arrange
    const approx: ApproxState = { status: 'ready', location: { lat: 51.5074, lon: -0.1278, city: 'London' } }
    // Act
    const result = resolveLocation(null, approx)
    // Assert
    expect(result).toEqual({ lat: 51.5074, lon: -0.1278, label: 'London', source: 'approx' })
  })

  it('priority 2: approx ready but the edge returned no city name — labels it "Approximate area"', () => {
    // Arrange
    const approx: ApproxState = { status: 'ready', location: { lat: 1, lon: 2, city: null } }
    // Act
    const result = resolveLocation(null, approx)
    // Assert
    expect(result).toEqual({ lat: 1, lon: 2, label: 'Approximate area', source: 'approx' })
  })

  it('priority 3: no choice, approx failed — falls through to the fixed Seoul default', () => {
    // Act
    const result = resolveLocation(null, FAILED)
    // Assert
    expect(result).toEqual(SEOUL_DEFAULT)
    expect(result?.source).toBe('default')
  })

  it('priority 4: no choice, approx still pending — null ("still resolving"), never a premature Seoul flash', () => {
    // Act
    const result = resolveLocation(null, PENDING)
    // Assert
    expect(result).toBeNull()
  })
})
