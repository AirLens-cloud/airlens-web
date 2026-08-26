import { describe, it, expect } from 'vitest'
import { weatherCodeToCondition } from './weatherCondition'

describe('weatherCodeToCondition', () => {
  it('buckets clear-sky codes (0, 1) as clear', () => {
    expect(weatherCodeToCondition(0)).toBe('clear')
    expect(weatherCodeToCondition(1)).toBe('clear')
  })

  it('buckets overcast codes (2, 3) as cloudy', () => {
    expect(weatherCodeToCondition(2)).toBe('cloudy')
    expect(weatherCodeToCondition(3)).toBe('cloudy')
  })

  it('buckets fog codes (45, 48) as fog', () => {
    expect(weatherCodeToCondition(45)).toBe('fog')
    expect(weatherCodeToCondition(48)).toBe('fog')
  })

  it('buckets drizzle range (51-57) as drizzle', () => {
    expect(weatherCodeToCondition(51)).toBe('drizzle')
    expect(weatherCodeToCondition(57)).toBe('drizzle')
  })

  it('buckets rain and rain-shower ranges (61-67, 80-82) as rain', () => {
    expect(weatherCodeToCondition(63)).toBe('rain')
    expect(weatherCodeToCondition(81)).toBe('rain')
  })

  it('buckets snow ranges (71-77, 85, 86) as snow', () => {
    expect(weatherCodeToCondition(73)).toBe('snow')
    expect(weatherCodeToCondition(85)).toBe('snow')
  })

  it('buckets thunderstorm range (95-99) as thunder', () => {
    expect(weatherCodeToCondition(96)).toBe('thunder')
  })

  it('falls back to clear for null/undefined — never fabricates a condition', () => {
    expect(weatherCodeToCondition(null)).toBe('clear')
    expect(weatherCodeToCondition(undefined)).toBe('clear')
  })

  it('falls back to clear for an out-of-range code', () => {
    expect(weatherCodeToCondition(999)).toBe('clear')
  })
})
