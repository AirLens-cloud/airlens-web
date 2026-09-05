/**
 * api/forecastBand.ts — parse/validate the w3-band-v1 forecast band (AAA).
 *
 * The three properties that matter: a null p10/p50/p90 survives parsing as
 * `null` (never coerced to 0 — the Float32Array/ToNumber trap documented in
 * `airQualityGrid.ts`), an h+48 horizon is dropped rather than rendered, and
 * a `schema_version` this module does not recognise fails the whole payload
 * rather than being rendered under the wrong contract's assumptions.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { fetchForecastBand } from './forecastBand'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  globalThis.fetch = fetchMock as unknown as typeof fetch
})

function okResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response
}
function notFoundResponse(): Response {
  return { ok: false, status: 404 } as Response
}

const VALID_PAYLOAD = {
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
  ],
  uncertainty: {
    method: 'CQR conformal q̂',
    picp80_claim_by_horizon: {
      '1': { picp80_holdout: 0.84, n_holdout: 510, status: 'ok' },
      '6': { picp80_holdout: 0.81, n_holdout: 466, status: 'ok' },
      '24': { picp80_holdout: 0.88, n_holdout: 469, status: 'ok' },
    },
    provisional_horizons: [],
  },
  dqss: { grade: null, status: 'unscored', reason: '예보 밴드 DQSS 채점기 미배선' },
}

describe('fetchForecastBand', () => {
  it('parses a valid w3-band-v1 payload', async () => {
    // Arrange
    fetchMock.mockResolvedValue(okResponse(VALID_PAYLOAD))
    // Act
    const result = await fetchForecastBand()
    // Assert
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(result.data.cities).toHaveLength(1)
    expect(result.data.cities[0].name).toBe('Seoul')
    expect(result.data.dqss?.status).toBe('unscored')
    expect(result.data.uncertainty?.picp80_claim_by_horizon['24']?.n_holdout).toBe(469)
  })

  it('never coerces a null band value to 0', async () => {
    // Arrange — a horizon with an unpublished p10 (the model declined a bound,
    // not "the bound is zero").
    fetchMock.mockResolvedValue(
      okResponse({
        ...VALID_PAYLOAD,
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
    const result = await fetchForecastBand()
    // Assert
    if (!result.ok) throw new Error('unreachable')
    expect(result.data.cities[0].horizons[0].p10).toBeNull()
    // Not 0 — the failure mode this module exists to prevent.
    expect(result.data.cities[0].horizons[0].p10).not.toBe(0)
  })

  it('drops an h+48 horizon rather than serving it', async () => {
    // Arrange
    fetchMock.mockResolvedValue(
      okResponse({
        ...VALID_PAYLOAD,
        cities: [
          {
            name: 'Seoul',
            horizons: [
              ...VALID_PAYLOAD.cities[0].horizons,
              { lead_hours: 48, valid_time: '2026-09-07T04:00:00+00:00', p10: 0.1, p50: 2.0, p90: 5.0 },
            ],
          },
        ],
      }),
    )
    // Act
    const result = await fetchForecastBand()
    // Assert
    if (!result.ok) throw new Error('unreachable')
    const leadHours = result.data.cities[0].horizons.map((h) => h.lead_hours)
    expect(leadHours).toEqual([1, 6, 24])
    expect(leadHours).not.toContain(48)
  })

  it('rejects a payload whose schema_version this module does not recognise', async () => {
    // Arrange
    fetchMock.mockResolvedValue(okResponse({ ...VALID_PAYLOAD, schema_version: 'w3-band-v2' }))
    // Act
    const result = await fetchForecastBand()
    // Assert — never rendered under the wrong contract's assumptions.
    expect(result.ok).toBe(false)
  })

  it('drops a malformed city rather than failing the whole payload', async () => {
    // Arrange — one city is missing `horizons`; the rest of the document is fine.
    fetchMock.mockResolvedValue(
      okResponse({
        ...VALID_PAYLOAD,
        cities: [...VALID_PAYLOAD.cities, { name: 'Broken' }],
      }),
    )
    // Act
    const result = await fetchForecastBand()
    // Assert
    if (!result.ok) throw new Error('unreachable')
    expect(result.data.cities.map((c) => c.name)).toEqual(['Seoul'])
  })

  it('reports a fetch failure as unavailable, not as an empty document', async () => {
    // Arrange
    fetchMock.mockResolvedValue(notFoundResponse())
    // Act
    const result = await fetchForecastBand()
    // Assert
    expect(result.ok).toBe(false)
  })

  it('rejects a non-JSON response (e.g. the SPA catch-all shell)', async () => {
    // Arrange
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'text/html; charset=utf-8' },
      json: async () => VALID_PAYLOAD,
    } as unknown as Response)
    // Act
    const result = await fetchForecastBand()
    // Assert
    expect(result.ok).toBe(false)
  })
})
