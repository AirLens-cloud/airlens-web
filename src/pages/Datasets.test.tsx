/**
 * Datasets — "not published" honesty for unknown manifest fields, and the
 * withheld-product gate (AAA).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
import Datasets from './Datasets'

function gridBody() {
  return {
    updated_at: '2026-08-26T00:00:00Z',
    points: Array.from({ length: 5 }, (_, i) => ({ lat: i, lon: i, pm25: 10 + i })),
  }
}

function coverageBody() {
  return {
    countries: [
      { code: 'KR', yearRange: [2018, 2019], years: 2, totalStations: 200, sourcesUsed: ['acag_v6'] },
    ],
  }
}

function seriesBody() {
  return {
    country: 'KR',
    yearRange: [2019, 2019],
    series: [{ year: 2019, pm25Mean: 22.4, p10: 10.1, p90: 38.2, stationCount: 200, sources: ['acag_v6'] }],
    sourcesUsed: ['acag_v6'],
    totalStations: 200,
    generatedAt: '2026-08-26T00:00:00Z',
  }
}

function installFetch(opts: { coverageFails?: boolean } = {}) {
  const spy = vi.fn(async (url: string) => {
    if (url.includes('current-pm25-grid.json')) return { ok: true, status: 200, json: async () => gridBody() } as unknown as Response
    if (url.includes('insights-data/index.json')) {
      if (opts.coverageFails) return { ok: false, status: 500 } as Response
      return { ok: true, status: 200, json: async () => coverageBody() } as unknown as Response
    }
    if (url.includes('by_country/KR.json')) return { ok: true, status: 200, json: async () => seriesBody() } as unknown as Response
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

describe('Datasets', () => {
  it('renders both live products and marks unknown manifest fields "Not published", never a fabricated value', async () => {
    // Arrange
    installFetch()
    // Act
    render(<Datasets />)
    await waitFor(() => expect(screen.getByTestId('dataset-grid')).toBeTruthy())
    const cards = screen.getAllByTestId('dataset-card')
    // Assert — license is on the front face for both cards.
    expect(cards).toHaveLength(2)
    expect(screen.getAllByText('Not published').length).toBeGreaterThanOrEqual(2)
    // Expand the first card to reach the hash field too.
    fireEvent.click(screen.getAllByRole('button', { expanded: false })[0])
    expect(screen.getAllByText('Not published').length).toBeGreaterThanOrEqual(3)
  })

  it('withholds a product whose live fetch fails, and counts it instead of rendering a broken card', async () => {
    // Arrange — the country panel product's coverage index is unreadable.
    installFetch({ coverageFails: true })
    // Act
    render(<Datasets />)
    // Assert
    await waitFor(() => expect(screen.getByTestId('dataset-grid')).toBeTruthy())
    expect(screen.getAllByTestId('dataset-card')).toHaveLength(1)
    expect(screen.getByTestId('datasets-totals').textContent).toContain('1 withheld')
  })
})
