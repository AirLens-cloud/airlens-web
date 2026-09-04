/**
 * gridPlausibility — verdicts for published PM2.5 grid cells (AAA).
 *
 * Fixtures use values measured on the live artifact on 2026-09-04 rather than
 * round synthetic numbers, so a regression here is a regression against data
 * that actually shipped.
 *
 * Every assertion is about the *verdict*. None of them asserts that a value
 * got smaller — if one ever does, someone has turned this classifier into a
 * clamp, which is the exact thing it exists to avoid.
 */
import { describe, it, expect } from 'vitest'
import { EPA_PM25_BREAKPOINTS } from './aqi'
import { REPORTABLE_MAX_UGM3, classifyPm25, isReportable } from './gridPlausibility'

describe('REPORTABLE_MAX_UGM3', () => {
  it('is derived from the EPA table, not typed in beside it', () => {
    // Arrange — the last breakpoint's upper PM2.5 bound is the whole scale's top.
    const lastBreakpoint = EPA_PM25_BREAKPOINTS[EPA_PM25_BREAKPOINTS.length - 1]
    // Act / Assert — drift gate: revising the table must carry this with it.
    expect(REPORTABLE_MAX_UGM3).toBe(lastBreakpoint[3])
    expect(REPORTABLE_MAX_UGM3).toBe(500.4)
  })
})

describe('classifyPm25', () => {
  it('calls the global median reportable — ordinary background air', () => {
    // Arrange — p50 of the live artifact, 2026-09-04.
    const pm25 = 4.97
    // Act
    const result = classifyPm25(pm25)
    // Assert
    expect(result.verdict).toBe('reportable')
    expect(result.reason).toBe('')
  })

  it('keeps the top of the EPA scale reportable (boundary, inclusive)', () => {
    expect(classifyPm25(REPORTABLE_MAX_UGM3).verdict).toBe('reportable')
  })

  it('calls the first value past the top of the scale beyond-scale', () => {
    // Arrange — one tick past 500.4, where pm25ToAqi starts returning a flat 500.
    const result = classifyPm25(500.5)
    // Assert
    expect(result.verdict).toBe('beyond-scale')
    expect(result.reason).toContain('cannot verify')
  })

  it('calls the artifact-max cell beyond-scale', () => {
    // Arrange — the real maximum published on 2026-09-04, at 65°N 116°E.
    const result = classifyPm25(15867.96)
    // Assert
    expect(result.verdict).toBe('beyond-scale')
  })

  it('treats a non-finite reading as broken rather than letting it pass', () => {
    // Arrange — `NaN > 500.4` is false, so a naive comparison would call this
    // reportable. That is the bug this case exists to pin.
    expect(classifyPm25(Number.NaN).verdict).toBe('beyond-scale')
    expect(classifyPm25(Number.POSITIVE_INFINITY).verdict).toBe('beyond-scale')
  })

  it('never reports a different number than it was given', () => {
    // Arrange — the classifier has no channel to return a value at all; this
    // asserts the shape stays that way.
    const result = classifyPm25(15867.96)
    expect(Object.keys(result).sort()).toEqual(['reason', 'verdict'])
  })
})

describe('isReportable', () => {
  it('treats an absent verdict as reportable — pre-check fixtures stay valid', () => {
    expect(isReportable(undefined)).toBe(true)
  })

  it('rejects anything past the top of the scale', () => {
    expect(isReportable(classifyPm25(600))).toBe(false)
    expect(isReportable(classifyPm25(15867.96))).toBe(false)
  })
})
