import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { tierFromPm25, useCapsuleData } from './useCapsuleData'
import type { TftForecast } from '../../../landing/shared/data/loaders'

vi.mock('../../../landing/shared/data/loaders', () => ({
  loadTft: vi.fn(),
}))

import { loadTft } from '../../../landing/shared/data/loaders'

afterEach(() => {
  vi.resetAllMocks()
})

function tft(hourly: Array<{ pm25: number; pm25_p10?: number; pm25_p90?: number }>): TftForecast {
  return {
    generated_at: '2026-08-26T00:00:00Z',
    model_version: 'test',
    cities: [
      {
        name: 'Seoul',
        lat: 37.5,
        lon: 127,
        country_code: 'KR',
        hourly: hourly.map((h, i) => ({
          time: `2026-08-26T${String(i).padStart(2, '0')}:00:00Z`,
          pm25: h.pm25,
          pm25_p10: h.pm25_p10 ?? h.pm25 - 5,
          pm25_p90: h.pm25_p90 ?? h.pm25 + 5,
        })),
      },
    ],
  }
}

describe('tierFromPm25', () => {
  it('classifies boundary values into 6 tiers', () => {
    expect(tierFromPm25(10)).toBe('good')
    expect(tierFromPm25(20)).toBe('moderate')
    expect(tierFromPm25(50)).toBe('usg')
    expect(tierFromPm25(70)).toBe('unhealthy')
    expect(tierFromPm25(100)).toBe('very-unhealthy')
    expect(tierFromPm25(200)).toBe('hazardous')
  })
})

describe('useCapsuleData', () => {
  it('maps a ready TFT forecast to capsule current/range/series', async () => {
    // Arrange
    vi.mocked(loadTft).mockResolvedValue(
      tft(Array.from({ length: 24 }, (_, i) => ({ pm25: 20 + i }))),
    )
    // Act
    const { result } = renderHook(() => useCapsuleData())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    // Assert
    if (result.current.status !== 'ready') throw new Error('expected ready')
    expect(result.current.city).toBe('Seoul')
    expect(result.current.current).toBe(20)
    expect(result.current.tier).toBe('moderate')
    expect(result.current.series24h).toHaveLength(24)
    expect(result.current.range.lo).toBe(15) // min p10 = (20+0)-5, hour 0
    expect(result.current.range.hi).toBe(48) // max p90 = (20+23)+5, hour 23
  })

  it('resolves to missing (never fabricated) when the fetch fails', async () => {
    // Arrange
    vi.mocked(loadTft).mockRejectedValue(new Error('network'))
    // Act
    const { result } = renderHook(() => useCapsuleData())
    // Assert
    await waitFor(() => expect(result.current.status).toBe('missing'))
  })

  it('resolves to missing when the mirror has no cities', async () => {
    vi.mocked(loadTft).mockResolvedValue({ generated_at: 'x', model_version: 'x', cities: [] })
    const { result } = renderHook(() => useCapsuleData())
    await waitFor(() => expect(result.current.status).toBe('missing'))
  })

  it('flags alert=worsening when a later hour crosses into a worse tier', async () => {
    // Arrange: starts good (10), spikes to moderate-plus (40) within 24h
    const hourly = Array.from({ length: 24 }, (_, i) => ({ pm25: i === 10 ? 40 : 10 }))
    vi.mocked(loadTft).mockResolvedValue(tft(hourly))
    // Act
    const { result } = renderHook(() => useCapsuleData())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    // Assert
    if (result.current.status !== 'ready') throw new Error('expected ready')
    expect(result.current.alert).toBe('worsening')
  })

  it('flags alert=steady when the tier never worsens in the next 24h', async () => {
    const hourly = Array.from({ length: 24 }, () => ({ pm25: 10 }))
    vi.mocked(loadTft).mockResolvedValue(tft(hourly))
    const { result } = renderHook(() => useCapsuleData())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    if (result.current.status !== 'ready') throw new Error('expected ready')
    expect(result.current.alert).toBe('steady')
  })

  it('flags alert=unknown (3-way, never a guessed worsening/steady) with a single-hour series', async () => {
    vi.mocked(loadTft).mockResolvedValue(tft([{ pm25: 10 }]))
    const { result } = renderHook(() => useCapsuleData())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    if (result.current.status !== 'ready') throw new Error('expected ready')
    expect(result.current.alert).toBe('unknown')
  })
})
