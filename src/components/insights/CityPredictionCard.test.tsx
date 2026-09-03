/**
 * CityPredictionCard — the four states, and the band that must travel with the
 * number (AAA).
 *
 * Two properties are load-bearing: an unreadable feed never collapses into "no
 * coverage here" (a transient outage would then read as a fact about the
 * location), and a p50 never renders without its p10–p90 and its grade.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import CityPredictionCard from './CityPredictionCard'

const PREDICTION = {
  name: 'Vienna',
  lat: 48.2,
  lon: 16.4,
  predicted_p10: 9.1,
  predicted_p50: 14.6,
  predicted_p90: 22.4,
  confidence_grade: 'B',
  source: 'AODtoPM25Model v2',
}

function mockFetch(body: unknown | null) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      body === null
        ? ({ ok: false, status: 404 } as Response)
        : ({ ok: true, status: 200, json: async () => body } as unknown as Response),
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

describe('CityPredictionCard', () => {
  it('shows the p50 with its interval and grade', async () => {
    // Arrange
    mockFetch({ predictions: [PREDICTION], generated_at: '2026-08-01T00:00:00Z' })
    // Act
    render(<CityPredictionCard lat={48.2} lon={16.4} />)
    // Assert — Glass-box: the number never appears alone.
    await waitFor(() => expect(screen.getByText('14.6')).toBeTruthy())
    expect(screen.getByText(/9\.1/)).toBeTruthy()
    expect(screen.getByText(/22\.4/)).toBeTruthy()
  })

  it('reports an unreadable feed as unread, not as "no coverage"', async () => {
    // Arrange — every source 404s.
    mockFetch(null)
    // Act
    render(<CityPredictionCard lat={48.2} lon={16.4} />)
    // Assert
    await waitFor(() => expect(screen.getByText(/No prediction grid could be read/i)).toBeTruthy())
    expect(screen.queryByText(/No model prediction covers this location/i)).toBeNull()
  })

  it('reports a successful response with no nearby point as no coverage', async () => {
    // Arrange — the grid loads, but the only point is on the far side of the world.
    mockFetch({ predictions: [{ ...PREDICTION, lat: -40, lon: 175 }], generated_at: null })
    // Act
    render(<CityPredictionCard lat={48.2} lon={16.4} />)
    // Assert — a different fact from "could not be read", and worded as one.
    await waitFor(() =>
      expect(screen.getByText(/No model prediction covers this location/i)).toBeTruthy(),
    )
  })

  it('says so when the model produced no confidence grade', async () => {
    // Arrange
    mockFetch({ predictions: [{ ...PREDICTION, confidence_grade: null }], generated_at: null })
    // Act
    render(<CityPredictionCard lat={48.2} lon={16.4} />)
    // Assert — no grade is invented to fill the badge.
    await waitFor(() =>
      expect(screen.getByText(/produced no confidence grade/i)).toBeTruthy(),
    )
  })

  it('keeps the high-concentration warning on the ready state', async () => {
    // Arrange — the caveat is the measured limitation, not boilerplate.
    mockFetch({ predictions: [PREDICTION], generated_at: null })
    // Act
    render(<CityPredictionCard lat={48.2} lon={16.4} />)
    // Assert
    await waitFor(() => expect(screen.getByText(/Above 75/i)).toBeTruthy())
  })

  it('labels the confidence badge "Prediction confidence", never "DQSS" — confidence_grade is a different quantity from sensor DQSS', async () => {
    // Arrange
    mockFetch({ predictions: [PREDICTION], generated_at: null })
    // Act
    render(<CityPredictionCard lat={48.2} lon={16.4} />)
    // Assert
    await waitFor(() => expect(screen.getByText('14.6')).toBeTruthy())
    expect(screen.getByText('Prediction confidence')).toBeTruthy()
    expect(screen.queryByText('DQSS')).toBeNull()
  })
})
