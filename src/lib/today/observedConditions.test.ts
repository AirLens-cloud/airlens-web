import { describe, it, expect } from 'vitest'
import { describeWind, describeHumidity, describeSixHourTrend } from './observedConditions'
import type { OpenMeteoWeatherHourly } from '../../types/forecast'
import type { CapsuleSeriesPoint } from '../../components/fluid/capsule/useCapsuleData'

function series(values: number[]): CapsuleSeriesPoint[] {
  return values.map((p50, i) => ({
    time: `2026-08-26T${String(i).padStart(2, '0')}:00:00Z`,
    p10: null,
    p50,
    p90: null,
  }))
}

describe('describeWind', () => {
  it('converts km/h to m/s and names the compass direction — same conversion as InstrumentGrid', () => {
    const weather: OpenMeteoWeatherHourly = { time: ['t'], wind_speed_10m: [3.2], wind_direction_10m: [180] }
    expect(describeWind(weather)).toBe('Wind from the S at 0.9 m/s.')
  })

  it('degrades to speed-only when direction is absent — never a fabricated compass label', () => {
    const weather: OpenMeteoWeatherHourly = { time: ['t'], wind_speed_10m: [3.6] }
    expect(describeWind(weather)).toBe('Wind at 1.0 m/s.')
  })

  it('returns null when there is no reading', () => {
    expect(describeWind(null)).toBeNull()
    expect(describeWind({ time: ['t'] })).toBeNull()
  })
})

describe('describeHumidity', () => {
  it('rounds relative humidity into a fixed sentence', () => {
    const weather: OpenMeteoWeatherHourly = { time: ['t'], relative_humidity_2m: [54.6] }
    expect(describeHumidity(weather)).toBe('Relative humidity 55%.')
  })

  it('returns null when there is no reading', () => {
    expect(describeHumidity(null)).toBeNull()
  })
})

describe('describeSixHourTrend', () => {
  it('reuses computeSixHourDelta — a rising series reads as a positive delta sentence', () => {
    const s = series(Array.from({ length: 24 }, (_, i) => 20 + i))
    expect(describeSixHourTrend(s)).toBe('PM2.5 +6 µg/m³ from 00:00 UTC to 06:00 UTC (CAMS forecast).')
  })

  it('returns null when the series does not reach hour 6 — never a shorter-window value mislabeled 6h', () => {
    expect(describeSixHourTrend(series([10, 12, 14]))).toBeNull()
  })
})
