/**
 * Pins the EPA_PM25_BREAKPOINTS pre-2024 anchors (see the table's doc comment:
 * these failing is a deliberate-change gate for the day WAQI moves scales, not
 * noise) and the encoder/decoder round trip that B0 introduced — pm25ToAqi()
 * exists specifically so values encoded here survive the aqiToPm25() decode in
 * stationParse and the Globe layers.
 */
import { describe, it, expect } from 'vitest'
import { aqiToPm25, pm25ToAqi, EPA_PM25_BREAKPOINTS } from './aqi'

describe('aqiToPm25 (pre-2024 decoder anchors)', () => {
  it('pins the band-edge anchors of the pre-2024 table', () => {
    expect(aqiToPm25(50)).toBe(12.0)
    expect(aqiToPm25(100)).toBe(35.4)
    expect(aqiToPm25(150)).toBe(55.4)
    expect(aqiToPm25(200)).toBe(150.4)
    expect(aqiToPm25(500)).toBe(500.4)
  })

  it('clamps non-finite and non-positive input to the scale floor', () => {
    expect(aqiToPm25(0)).toBe(0)
    expect(aqiToPm25(-10)).toBe(0)
    expect(aqiToPm25(Number.NaN)).toBe(0)
  })

  it('caps above-scale input at the table ceiling', () => {
    expect(aqiToPm25(9999)).toBe(500.4)
  })
})

describe('pm25ToAqi (forward encoder)', () => {
  it('pins the same band-edge anchors in the forward direction', () => {
    expect(pm25ToAqi(12.0)).toBe(50)
    expect(pm25ToAqi(35.4)).toBe(100)
    expect(pm25ToAqi(55.4)).toBe(150)
    expect(pm25ToAqi(150.4)).toBe(200)
    expect(pm25ToAqi(500.4)).toBe(500)
  })

  it('does not reproduce the retired non-standard flat factor', () => {
    // round(40 * 1.25) = 50 was the old fabrication; on the EPA table pm 40
    // sits in the USG band, nowhere near AQI 50.
    expect(pm25ToAqi(40)).not.toBe(50)
    expect(pm25ToAqi(40)).toBeGreaterThan(100)
  })

  it('clamps non-finite and non-positive input to 0 and caps above-scale input at 500', () => {
    expect(pm25ToAqi(0)).toBe(0)
    expect(pm25ToAqi(-5)).toBe(0)
    expect(pm25ToAqi(Number.NaN)).toBe(0)
    expect(pm25ToAqi(9999)).toBe(500)
  })
})

describe('encoder/decoder round trip', () => {
  it('recovers the concentration within AQI integer-rounding tolerance', () => {
    // Worst-case slope is the 151–200 band: ~1.94 µg/m³ per AQI unit, so a
    // ±0.5 AQI rounding error can move the decoded value by just under 1.
    const samples = [3, 9, 12, 20, 35.4, 40, 55.4, 90, 150.4, 200, 350, 500.4]
    for (const pm25 of samples) {
      expect(Math.abs(aqiToPm25(pm25ToAqi(pm25)) - pm25)).toBeLessThan(1.0)
    }
  })

  it('is monotonic across every breakpoint edge', () => {
    let prev = -1
    for (const [, , pmLo, pmHi] of EPA_PM25_BREAKPOINTS) {
      for (const pm of [pmLo, pmHi]) {
        const aqi = pm25ToAqi(pm)
        expect(aqi).toBeGreaterThanOrEqual(prev)
        prev = aqi
      }
    }
  })
})
