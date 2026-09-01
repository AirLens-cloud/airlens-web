/**
 * pm25ToGrade must reuse `api/gridSnapshot.ts`'s exported `gradeFromPm25` cut
 * (15/35/75 µg/m³) rather than hand-copying it — a second copy only agrees
 * with the first by discipline, not by construction (code review Minor-2,
 * 2026-09-01).
 */
import { describe, it, expect } from 'vitest'
import { pm25ToGrade } from './gradeColor'
import { gradeFromPm25 } from '../../api/gridSnapshot'

describe('pm25ToGrade', () => {
  it('is the same function gridSnapshot.ts exports, not a hand-copied cut', () => {
    // Assert — literal identity, not just matching output: a re-copied
    // function with the right cut today would still pass a value-only test
    // and drift again tomorrow.
    expect(pm25ToGrade).toBe(gradeFromPm25)
  })

  it.each([
    [15, 'Good'],
    [15.1, 'Moderate'],
    [35, 'Moderate'],
    [35.1, 'Unhealthy'],
    [75, 'Unhealthy'],
    [75.1, 'Very Unhealthy'],
  ] as const)('grades %d µg/m³ as %s', (pm25, grade) => {
    expect(pm25ToGrade(pm25)).toBe(grade)
  })
})
