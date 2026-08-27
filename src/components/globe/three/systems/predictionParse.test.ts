// parsePredictionData mapping (AAA).
// The parser must preserve the Glass-box fields (p10/p50/p90, source, model) and
// project each city onto the globe surface — it must NOT invent a DQSS score or
// reorder the already-monotone quantiles coming out of the model seam.
import { describe, it, expect } from 'vitest'
import { parsePredictionData, bandRelWidthToAlpha } from './predictionParse'
import { GLOBE_CONFIG } from '../../../../lib/config/globe'
import type { CityPrediction } from '../../../../types/ml'

const ROW: CityPrediction = {
  name: 'Seoul',
  lat: 37.5665,
  lon: 126.978,
  timestamp: '2026-07-21T11:00:00Z',
  predicted_p10: 12.2,
  predicted_p50: 18.4,
  predicted_p90: 25.9,
  uncertainty: 13.7,
  epistemic_std: 0.9,
  uncertainty_normalized: 0.012,
  observed_pm25: 19.1,
  model_version: 'v2.0',
  source: 'ML-AODtoPM25Model-xgb_lgb_gtwr',
  confidence_grade: 'B',
}

describe('parsePredictionData', () => {
  it('maps quantiles + provenance and projects a surface position', () => {
    const [m] = parsePredictionData([ROW])

    expect(m.name).toBe('Seoul')
    expect(m.p10).toBe(12.2)
    expect(m.p50).toBe(18.4)
    expect(m.p90).toBe(25.9)
    expect(m.source).toBe('ML-AODtoPM25Model-xgb_lgb_gtwr')
    expect(m.modelVersion).toBe('v2.0')
    expect(m.observedPm25).toBe(19.1)
    // Position sits on the ML-prediction shell radius (not the origin).
    expect(m.position.length()).toBeCloseTo(GLOBE_CONFIG.ML_PREDICTIONS.GLOBE_R, 5)
  })

  it('does not fabricate a DQSS field and keeps quantile order untouched', () => {
    const [m] = parsePredictionData([ROW])

    expect('dqss' in m).toBe(false)
    expect(m.p10).toBeLessThanOrEqual(m.p50)
    expect(m.p50).toBeLessThanOrEqual(m.p90)
  })

  it('carries observedPm25 = null through when absent', () => {
    const noObs = { ...ROW, observed_pm25: undefined }
    const [m] = parsePredictionData([noObs])
    expect(m.observedPm25).toBeNull()
  })

  it('carries confidenceGrade through when present', () => {
    const [m] = parsePredictionData([ROW])
    expect(m.confidenceGrade).toBe('B')
  })

  it('carries confidenceGrade = null through when absent (fallback prediction)', () => {
    const noConf = { ...ROW, confidence_grade: undefined }
    const [m] = parsePredictionData([noConf])
    expect(m.confidenceGrade).toBeNull()
  })
})

// bandRelWidthToAlpha — p10-p90 band width → marker alpha (uncertainty encoding).
describe('bandRelWidthToAlpha', () => {
  const BAND = GLOBE_CONFIG.ML_PREDICTIONS.BAND_ALPHA

  it('returns DEFAULT (not fully opaque) when the band is missing — does not fabricate certainty', () => {
    // Arrange / Act / Assert — 3-way: null, undefined, and NaN all count as "no band"
    expect(bandRelWidthToAlpha(null, 20, 30)).toBe(BAND.DEFAULT)
    expect(bandRelWidthToAlpha(10, 20, undefined)).toBe(BAND.DEFAULT)
    expect(bandRelWidthToAlpha(10, NaN, 30)).toBe(BAND.DEFAULT)
  })

  it('returns DEFAULT when p50 is non-positive (division would be meaningless)', () => {
    // Arrange / Act / Assert
    expect(bandRelWidthToAlpha(10, 0, 30)).toBe(BAND.DEFAULT)
    expect(bandRelWidthToAlpha(-10, -5, -1)).toBe(BAND.DEFAULT)
  })

  it('returns DEFAULT for an inverted band (p10 > p90) instead of misreading it as fully certain', () => {
    // Arrange — a corrupted/out-of-order quantile pair. Without this guard, the
    // negative relWidth clamps to 0 and alpha comes out 1.0 — a data error
    // rendered as "most confident", the opposite of honest.
    // Act / Assert
    expect(bandRelWidthToAlpha(30, 20, 10)).toBe(BAND.DEFAULT)
  })

  it('returns full opacity (1.0) for a zero-width band', () => {
    // Arrange
    const p = 20
    // Act
    const alpha = bandRelWidthToAlpha(p, p, p)
    // Assert
    expect(alpha).toBe(1)
  })

  it('clamps to MIN once the relative width reaches REL_WIDTH_FULL', () => {
    // Arrange — relWidth = (p90-p10)/p50 = REL_WIDTH_FULL exactly, and beyond it
    const p50 = 20
    const halfWidth = (BAND.REL_WIDTH_FULL * p50) / 2
    // Act
    const atFull = bandRelWidthToAlpha(p50 - halfWidth, p50, p50 + halfWidth)
    const beyondFull = bandRelWidthToAlpha(p50 - halfWidth * 2, p50, p50 + halfWidth * 2)
    // Assert
    expect(atFull).toBeCloseTo(BAND.MIN, 10)
    expect(beyondFull).toBe(BAND.MIN)
  })

  it('decreases monotonically as the relative band width grows', () => {
    // Arrange
    const p50 = 20
    const widths = [0, 0.1, 0.2, 0.3, 0.4, 0.5]
    // Act
    const alphas = widths.map((w) => {
      const half = (w * p50) / 2
      return bandRelWidthToAlpha(p50 - half, p50, p50 + half)
    })
    // Assert
    for (let i = 1; i < alphas.length; i++) {
      expect(alphas[i]).toBeLessThanOrEqual(alphas[i - 1])
    }
  })
})
