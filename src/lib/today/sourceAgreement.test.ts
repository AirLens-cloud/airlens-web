import { describe, it, expect } from 'vitest'
import { computeSourceAgreement } from './sourceAgreement'

describe('computeSourceAgreement', () => {
  it('returns null when either source is unavailable — never a guessed diff', () => {
    expect(computeSourceAgreement(null, 40)).toBeNull()
    expect(computeSourceAgreement(40, null)).toBeNull()
    expect(computeSourceAgreement(null, null)).toBeNull()
  })

  it('reports agreement within the 5 µg/m³ threshold', () => {
    expect(computeSourceAgreement(40, 43)).toEqual({ diff: 3, agree: true })
  })

  it('reports disagreement beyond the threshold, with the real diff (never averaged)', () => {
    expect(computeSourceAgreement(40, 55)).toEqual({ diff: 15, agree: false })
  })

  it('is symmetric — order of arguments does not change the diff', () => {
    expect(computeSourceAgreement(55, 40)).toEqual({ diff: 15, agree: false })
  })
})
