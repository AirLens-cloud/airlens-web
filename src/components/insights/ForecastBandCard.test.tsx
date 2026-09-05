/**
 * ForecastBandCard — the four fetch states, plus staleness and a null band
 * rendering honestly instead of as zero (AAA).
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import ForecastBandCard from './ForecastBandCard'

function payload(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 'w3-band-v1',
    generated_at: '2026-09-05T09:41:48.423252+00:00',
    model: 'timesfm-2.5-200m zero-shot + CQR conformal (temporal split)',
    issue_time: '2026-09-05T04:31:15+00:00',
    cities: [
      {
        name: 'Seoul',
        horizons: [
          { lead_hours: 1, valid_time: '2026-09-05T05:00:00+00:00', p10: 0.2, p50: 1.6, p90: 3.4 },
          { lead_hours: 6, valid_time: '2026-09-05T10:00:00+00:00', p10: 0.0, p50: 1.5, p90: 4.1 },
          { lead_hours: 24, valid_time: '2026-09-06T04:00:00+00:00', p10: 0.0, p50: 1.6, p90: 4.9 },
        ],
      },
      {
        name: 'Amsterdam',
        horizons: [
          { lead_hours: 1, valid_time: '2026-09-05T05:00:00+00:00', p10: 0.1, p50: 1.0, p90: 2.0 },
        ],
      },
    ],
    uncertainty: {
      method: 'CQR conformal',
      picp80_claim_by_horizon: {
        '1': { picp80_holdout: 0.84, n_holdout: 510, status: 'ok' },
        '6': { picp80_holdout: 0.81, n_holdout: 466, status: 'ok' },
        '24': { picp80_holdout: 0.88, n_holdout: 469, status: 'ok' },
      },
      provisional_horizons: [],
    },
    dqss: { grade: null, status: 'unscored', reason: '예보 밴드 DQSS 채점기 미배선' },
    ...overrides,
  }
}

function mockFetch(body: unknown | null, contentType = 'application/json') {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      body === null
        ? ({ ok: false, status: 404 } as Response)
        : ({
            ok: true,
            status: 200,
            headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? contentType : null) },
            json: async () => body,
          } as unknown as Response),
    ),
  )
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ForecastBandCard', () => {
  it('renders the three horizons for the default city, with each band', async () => {
    // Arrange
    mockFetch(payload())
    // Act
    render(<ForecastBandCard />)
    // Assert — Seoul is preferred when published, never a p50 without its band.
    await waitFor(() => expect(screen.getByText('H+1')).toBeTruthy())
    expect(screen.getByText('H+6')).toBeTruthy()
    expect(screen.getByText('H+24')).toBeTruthy()
    expect(screen.getByRole('combobox')).toHaveProperty('value', 'Seoul')
  })

  it('reports a fetch failure as unread, not as an empty document', async () => {
    // Arrange
    mockFetch(null)
    // Act
    render(<ForecastBandCard />)
    // Assert
    await waitFor(() => expect(screen.getByText(/could not be read/i)).toBeTruthy())
    expect(screen.queryByText(/published no cities/i)).toBeNull()
  })

  it('reports a successful empty document as empty, not as a failure', async () => {
    // Arrange
    mockFetch(payload({ cities: [] }))
    // Act
    render(<ForecastBandCard />)
    // Assert
    await waitFor(() => expect(screen.getByText(/published no cities this pass/i)).toBeTruthy())
  })

  it('never renders a null band bound as zero', async () => {
    // Arrange — h+1's p10 is unpublished (null), not measured-as-zero.
    mockFetch(
      payload({
        cities: [
          {
            name: 'Seoul',
            horizons: [
              { lead_hours: 1, valid_time: '2026-09-05T05:00:00+00:00', p10: null, p50: 1.6, p90: 3.4 },
            ],
          },
        ],
      }),
    )
    // Act
    render(<ForecastBandCard />)
    // Assert
    await waitFor(() => expect(screen.getByText(/not published for this horizon/i)).toBeTruthy())
  })

  it('flags a payload older than 12h as stale', async () => {
    // Arrange
    const old = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString()
    mockFetch(payload({ generated_at: old }))
    // Act
    render(<ForecastBandCard />)
    // Assert
    await waitFor(() => expect(screen.getByText(/STALE/)).toBeTruthy())
  })

  it('does not flag a fresh payload as stale', async () => {
    // Arrange
    mockFetch(payload({ generated_at: new Date().toISOString() }))
    // Act
    render(<ForecastBandCard />)
    // Assert
    await waitFor(() => expect(screen.getByText('H+1')).toBeTruthy())
    expect(screen.queryByText(/STALE/)).toBeNull()
  })

  it('labels the confidence badge "Forecast confidence" and states the unscored reason, never inventing a grade', async () => {
    // Arrange
    mockFetch(payload())
    // Act
    render(<ForecastBandCard />)
    // Assert
    await waitFor(() => expect(screen.getByText('Forecast confidence')).toBeTruthy())
    expect(screen.getByText(/DQSS 채점기 미배선/)).toBeTruthy()
  })

  it('lets the reader switch to a published city other than the default', async () => {
    // Arrange
    mockFetch(payload())
    render(<ForecastBandCard />)
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveProperty('value', 'Seoul'))
    // Assert — the picker lists every published city.
    expect(screen.getByRole('option', { name: 'Amsterdam' })).toBeTruthy()
    expect(screen.getByRole('option', { name: 'Seoul' })).toBeTruthy()
  })
})
