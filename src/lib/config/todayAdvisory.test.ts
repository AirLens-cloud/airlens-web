import { describe, it, expect } from 'vitest'
import { ANSWER_SENTENCE, GENERAL_ADVISORY, SENSITIVE_ADVISORY } from './todayAdvisory'
import type { AqiTier } from '../../components/wireframe/AqiDot'

const ALL_TIERS: AqiTier[] = ['good', 'moderate', 'usg', 'unhealthy', 'very-unhealthy', 'hazardous', 'unknown']

describe('todayAdvisory config', () => {
  it('defines a fixed sentence for every tier — a finite config map, never a generated string', () => {
    for (const tier of ALL_TIERS) {
      expect(typeof ANSWER_SENTENCE[tier]).toBe('string')
      expect(typeof GENERAL_ADVISORY[tier]).toBe('string')
      expect(typeof SENSITIVE_ADVISORY[tier]).toBe('string')
    }
  })

  it('never uses directive medical-diagnosis language ("must"/"diagnose") in Answer/What-next sentences', () => {
    const banned = /\b(must|diagnose|prescri)/i
    for (const tier of ALL_TIERS) {
      expect(ANSWER_SENTENCE[tier]).not.toMatch(banned)
      expect(GENERAL_ADVISORY[tier]).not.toMatch(banned)
      expect(SENSITIVE_ADVISORY[tier]).not.toMatch(banned)
    }
  })
})
