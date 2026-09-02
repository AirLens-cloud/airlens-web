import { describe, it, expect } from 'vitest'
import { countryName } from './countryName'

describe('countryName', () => {
  it('resolves a known ISO alpha-2 code to its English name', () => {
    // Arrange / Act / Assert
    expect(countryName('SO')).toBe('Somalia')
    expect(countryName('kr')).toBe('South Korea') // case-insensitive
  })

  it('returns null for null/undefined/empty input', () => {
    expect(countryName(null)).toBeNull()
    expect(countryName(undefined)).toBeNull()
    expect(countryName('')).toBeNull()
  })

  it('returns null (never the raw code as a fake name) for a non-2-letter or unrecognized code', () => {
    expect(countryName('SOM')).toBeNull()
    expect(countryName('ZZ')).toBeNull()
  })
})
