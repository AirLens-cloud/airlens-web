/**
 * DataSources page — renders the live registry table with dot+text status
 * (never color alone), and opens a row from a `#{sourceId}` deep link (AAA).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import DataSources from './DataSources'

// Status is judged against the real clock — a hardcoded past date would
// silently read as `stale` regardless of what this test intends.
const FRESH = new Date(Date.now() - 5 * 60_000).toISOString()

function gridBody() {
  return { updated_at: FRESH, points: [{ lat: 1, lon: 1, pm25: 10 }] }
}
function timelineBody() {
  return {
    variable: 'pm2_5',
    source: 'gefs-aerosols',
    refTime: FRESH,
    generatedAt: FRESH,
    stepHours: 3,
    windowHours: 24,
    resolution: 2,
    frames: [{ validTime: '2026-08-26T03:00:00Z', leadHours: 3, cycle: '2026082600', file: 'pm25-x.json' }],
  }
}
function firesBody() {
  return { fires: [{ lat: 1, lon: 1 }], refTime: FRESH, count: 1 }
}
function windRecord() {
  return {
    header: { nx: 2, ny: 2, lo1: 0, la1: 90, dx: 180, dy: 180, generatedAt: FRESH, refTime: FRESH },
    data: [0, 0, 0, 0],
  }
}
function forecastBody() {
  return {
    generated_at: FRESH,
    model_version: 'v1',
    cities: [{ name: 'Seoul', lat: 37.5, lon: 127, country_code: 'KR', hourly: [] }],
  }
}

function installFetch() {
  const spy = vi.fn(async (url: string) => {
    if (url.includes('current-pm25-grid.json')) return { ok: true, status: 200, json: async () => gridBody() } as unknown as Response
    if (url.includes('timeline/manifest.json')) return { ok: true, status: 200, json: async () => timelineBody() } as unknown as Response
    if (url.includes('active-fires.json')) return { ok: true, status: 200, json: async () => firesBody() } as unknown as Response
    if (url.includes('wind-surface.json')) return { ok: true, status: 200, json: async () => [windRecord(), windRecord()] } as unknown as Response
    if (url.includes('forecast.json')) return { ok: true, status: 200, json: async () => forecastBody() } as unknown as Response
    return { ok: false, status: 404 } as Response
  })
  vi.stubGlobal('fetch', spy)
  return spy
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('DataSources', () => {
  it('renders the feed registry table with a dot-plus-text status for every row', async () => {
    // Arrange
    installFetch()
    // Act
    render(<DataSources />)
    // Assert
    await waitFor(() => expect(screen.getByTestId('feed-registry-table')).toBeTruthy())
    // Text label present alongside the dot — never color alone.
    expect(screen.getAllByText('Ready').length).toBeGreaterThan(0)
    expect(screen.getByText('PM2.5 current grid')).toBeTruthy()
  })

  it('opens the matching row on mount when the URL carries a #{sourceId} deep link', async () => {
    // Arrange
    installFetch()
    window.location.hash = '#pm25-grid'
    // Act
    const { container } = render(<DataSources />)
    // Assert
    await waitFor(() => expect(screen.getByTestId('feed-registry-table')).toBeTruthy())
    const row = container.querySelector('#pm25-grid')
    expect(row?.getAttribute('aria-expanded')).toBe('true')
    // The detail row (coverage/attribution) only renders when a row is expanded.
    expect(screen.getByText('COVERAGE')).toBeTruthy()
    // Cleanup — do not leak this hash into other tests.
    window.location.hash = ''
  })
})
