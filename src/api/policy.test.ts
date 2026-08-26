/**
 * api/policy.ts — the honesty-gate surface (AAA).
 *
 * These tests exist for one property above all: a country the pipeline declined
 * to estimate must never come back looking like a country it estimated at zero.
 * Every branch that could quietly substitute a number for a null is pinned here.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  attGateReason,
  attReliability,
  fetchCountryPolicyImpact,
  fetchPolicyImpacts,
  fetchPolicyIndex,
  resetPolicyIndexCache,
  __test,
} from './policy'
import type { PolicyIndexEntry } from '../types/policy'

const INDEX: PolicyIndexEntry[] = [
  {
    country: 'South Korea', countryCode: 'KR', region: 'Asia', flag: '🇰🇷',
    policyCount: 1, lastUpdated: '2026-08-26',
  },
  {
    country: 'Japan', countryCode: 'JP', region: 'Asia', flag: '🇯🇵',
    policyCount: 1, lastUpdated: '2026-08-26',
  },
]

/** Shape of one published policy-impact/<CC>.json, trimmed to what the mapper reads. */
function impactBody(over: Record<string, unknown> = {}) {
  return {
    country: 'KR',
    method: 'sdid',
    panel_source: 'acag_v6_ground_cal',
    att: -1.87,
    se: 0.81,
    ci_95: [-3.46, -0.28],
    p_value: 0.021,
    significant: true,
    status: 'ok',
    treatment_year: 2018,
    synthetic_control: [
      { date: '2016', event: '', pm25: 26.1, synthetic_pm25: 26.0 },
      { date: '2017', event: 'Fine Dust Act', pm25: 25.2, synthetic_pm25: 25.4 },
      { date: '2018', event: '', pm25: 23.0, synthetic_pm25: 24.6 },
      { date: '2019', event: '', pm25: 21.4, synthetic_pm25: 23.5 },
    ],
    robustness: {
      parallel_trend: { p_value: 0.42, pass: true },
      placebo: { mean: 0.12, pass: true },
    },
    data_quality: { dqss_score: 84, station_count: 512, coverage_years: 9 },
    ...over,
  }
}

/** Serve only the URLs listed; everything else 404s. */
function mockFetch(available: Record<string, unknown>) {
  const spy = vi.fn(async (url: string) => {
    const hit = Object.entries(available).find(([path]) => url.includes(path))
    if (!hit) return { ok: false, status: 404 } as Response
    return { ok: true, status: 200, json: async () => hit[1] } as unknown as Response
  })
  vi.stubGlobal('fetch', spy)
  return spy
}

beforeEach(() => {
  vi.unstubAllGlobals()
  resetPolicyIndexCache()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('fetchPolicyIndex', () => {
  it('reads the index co-located with the impact files', async () => {
    // Arrange
    const spy = mockFetch({ 'policy-impact/index.json': INDEX })
    // Act
    const index = await fetchPolicyIndex()
    // Assert — the pair versions together; the other pipeline's policy/ index is a
    // strict subset and would leave 22 estimated countries unnamed.
    expect(index).toHaveLength(2)
    expect(String(spy.mock.calls[0][0])).toContain('insights-data/policy-impact/index.json')
  })

  it('memoizes so a second read does not re-fetch', async () => {
    const spy = mockFetch({ 'policy-impact/index.json': INDEX })
    await fetchPolicyIndex()
    await fetchPolicyIndex()
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('returns an empty list — never throws — when the index is missing', async () => {
    mockFetch({})
    await expect(fetchPolicyIndex()).resolves.toEqual([])
  })
})

describe('fetchCountryPolicyImpact', () => {
  it('maps a published estimate, joining the index for name and flag', async () => {
    // Arrange
    mockFetch({ 'policy-impact/index.json': INDEX, 'policy-impact/KR.json': impactBody() })
    // Act
    const impact = await fetchCountryPolicyImpact('kr')
    // Assert
    expect(impact?.att).toBe(-1.87)
    expect(impact?.ci_low).toBe(-3.46)
    expect(impact?.ci_high).toBe(-0.28)
    expect(impact?.city).toBe('South Korea')
    expect(impact?.flag).toBe('🇰🇷')
    expect(impact?.panelSource).toBe('acag_v6_ground_cal')
    expect(impact?.title).toBe('Fine Dust Act')
    expect(impact?.sdid_series).toHaveLength(4)
  })

  it('keeps a gated country null across every estimate field', async () => {
    // Arrange — 31 of the 119 published countries look like this.
    mockFetch({
      'policy-impact/index.json': INDEX,
      'policy-impact/JP.json': impactBody({
        country: 'JP', att: null, se: null, ci_95: null, p_value: null,
        significant: false, status: 'insufficient_controls',
      }),
    })
    // Act
    const impact = await fetchCountryPolicyImpact('JP')
    // Assert — no substituted zero anywhere.
    expect(impact?.att).toBeNull()
    expect(impact?.ci_low).toBeNull()
    expect(impact?.ci_high).toBeNull()
    expect(impact?.p_value).toBeNull()
    expect(impact?.status).toBe('insufficient_controls')
  })

  it('rejects a malformed country code without fetching', async () => {
    const spy = mockFetch({ 'policy-impact/index.json': INDEX })
    await expect(fetchCountryPolicyImpact('../etc')).resolves.toBeNull()
    expect(spy).not.toHaveBeenCalled()
  })

  it('returns null for a country with no published file', async () => {
    mockFetch({ 'policy-impact/index.json': INDEX })
    await expect(fetchCountryPolicyImpact('ZZ')).resolves.toBeNull()
  })
})

describe('fetchPolicyImpacts', () => {
  it('drops index countries that have no published impact file', async () => {
    // Arrange — KR is estimated, JP is only in the index.
    mockFetch({ 'policy-impact/index.json': INDEX, 'policy-impact/KR.json': impactBody() })
    // Act
    const impacts = await fetchPolicyImpacts()
    // Assert — an empty card for JP would claim an analysis that never ran.
    expect(impacts.map((i) => i.id)).toEqual(['KR'])
  })

  it('honours the limit', async () => {
    const spy = mockFetch({ 'policy-impact/index.json': INDEX, 'policy-impact/KR.json': impactBody() })
    await fetchPolicyImpacts(1)
    const impactCalls = spy.mock.calls.filter(([u]) => !String(u).includes('index.json'))
    expect(impactCalls).toHaveLength(1)
  })
})

describe('mapRawPolicyData — synthetic control', () => {
  it('drops points with a non-finite observation instead of zero-filling', () => {
    // Arrange
    const raw = impactBody({
      synthetic_control: [
        { date: '2016', event: '', pm25: 26.1, synthetic_pm25: 26.0 },
        { date: '2017', event: '', pm25: null, synthetic_pm25: 25.4 },
      ],
    })
    // Act
    const mapped = __test.mapRawPolicyData(raw as never, undefined)
    // Assert
    expect(mapped.sdid_series).toHaveLength(1)
    expect(mapped.sdid_series?.[0].year).toBe(2016)
  })

  it('sorts the series by year regardless of published order', () => {
    const raw = impactBody({
      synthetic_control: [
        { date: '2019', event: '', pm25: 21.4, synthetic_pm25: 23.5 },
        { date: '2016', event: '', pm25: 26.1, synthetic_pm25: 26.0 },
      ],
    })
    const mapped = __test.mapRawPolicyData(raw as never, undefined)
    expect(mapped.sdid_series?.map((p) => p.year)).toEqual([2016, 2019])
  })

  it('leaves the series undefined when nothing survives', () => {
    const raw = impactBody({ synthetic_control: [] })
    expect(__test.mapRawPolicyData(raw as never, undefined).sdid_series).toBeUndefined()
  })
})

describe('mapRawPolicyData — cross_check', () => {
  it('carries both re-estimation lanes through', () => {
    // Arrange
    const raw = impactBody({
      cross_check: {
        cams_eac4: { att: -0.94, status: 'ok', p_value: 0.31 },
        ground_stations: { att: -2.10, status: 'ok', p_value: 0.04 },
      },
    })
    // Act
    const mapped = __test.mapRawPolicyData(raw as never, undefined)
    // Assert
    expect(mapped.crossCheck?.cams_eac4?.att).toBe(-0.94)
    expect(mapped.crossCheck?.ground_stations?.p_value).toBe(0.04)
  })

  it('keeps a lane that declined to estimate as null, with its reason', () => {
    // Arrange — a gated lane is not a lane that measured zero.
    const raw = impactBody({
      cross_check: { ground_stations: { att: null, status: 'poor_pre_fit', p_value: null } },
    })
    // Act
    const mapped = __test.mapRawPolicyData(raw as never, undefined)
    // Assert
    expect(mapped.crossCheck?.ground_stations).toEqual({
      att: null, status: 'poor_pre_fit', p_value: null,
    })
    expect(mapped.crossCheck?.cams_eac4).toBeUndefined()
  })

  it('is undefined when the country publishes no cross-check at all', () => {
    expect(__test.mapRawPolicyData(impactBody() as never, undefined).crossCheck).toBeUndefined()
  })
})

describe('policyFitToGrade', () => {
  it('grades a published fit score across the cutoffs', () => {
    expect(__test.policyFitToGrade(95)).toBe('A')
    expect(__test.policyFitToGrade(60)).toBe('B')
    expect(__test.policyFitToGrade(50)).toBe('C')
    expect(__test.policyFitToGrade(12)).toBe('F')
  })

  it('returns undefined — never a middling C — when no score was computed', () => {
    expect(__test.policyFitToGrade(undefined)).toBeUndefined()
    expect(__test.policyFitToGrade(Number.NaN)).toBeUndefined()
  })
})

describe('attReliability', () => {
  it('reports no_data for a gated country, distinct from insignificant', () => {
    // Arrange / Act / Assert — "never ran" and "ran, found nothing" are different claims.
    expect(attReliability({ att: null, p_value: null, ci_low: null, ci_high: null, significant: false }))
      .toBe('no_data')
  })

  it('flags an implausibly large estimate as unstable', () => {
    expect(attReliability({ att: -48, p_value: 0.001, ci_low: -60, ci_high: -36, significant: true }))
      .toBe('unstable')
  })

  it('calls an interval that straddles zero insignificant', () => {
    expect(attReliability({ att: -1.2, p_value: 0.3, ci_low: -3.0, ci_high: 0.6, significant: true }))
      .toBe('insignificant')
  })

  it('calls a p-value at or above 0.05 insignificant even when flagged significant', () => {
    expect(attReliability({ att: -1.2, p_value: 0.05, ci_low: -2.4, ci_high: -0.1, significant: true }))
      .toBe('insignificant')
  })

  it('reports reliable only for a significant, plausible, zero-excluding estimate', () => {
    expect(attReliability({ att: -1.87, p_value: 0.021, ci_low: -3.46, ci_high: -0.28, significant: true }))
      .toBe('reliable')
  })
})

describe('attGateReason', () => {
  it('names the wall the pipeline hit for each published status', () => {
    expect(attGateReason('insufficient_controls')).toMatch(/control countries/i)
    expect(attGateReason('poor_pre_fit')).toMatch(/pre-treatment trends/i)
    expect(attGateReason('degenerate_weights')).toMatch(/unstable/i)
    expect(attGateReason('no_pre_period')).toMatch(/history/i)
  })

  it('falls back to a generic reason for an unknown status', () => {
    expect(attGateReason('something_new')).toMatch(/counterfactual/i)
    expect(attGateReason(undefined)).toMatch(/counterfactual/i)
  })
})
