/**
 * CountryProfile — code prop wiring, honest zero-city rendering, and the
 * no-coverage vs unavailable distinction (AAA).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import CountryProfile from './CountryProfile'
import { resetPolicyIndexCache } from '../api/policy'

function seriesBody(code: string) {
  return {
    country: code,
    yearRange: [2018, 2019],
    series: [{ year: 2019, pm25Mean: 22.4, p10: 10.1, p90: 38.2, stationCount: 200, sources: ['acag_v6'] }],
    sourcesUsed: ['acag_v6'],
    totalStations: 200,
    generatedAt: '2026-08-26T00:00:00Z',
  }
}

const POLICY_INDEX = [
  { country: 'South Korea', countryCode: 'KR', region: 'East Asia', flag: '🇰🇷', policyCount: 1, lastUpdated: '2026-08-01', pm25AnnualStandard: 15 },
  { country: 'Mongolia', countryCode: 'MN', region: 'East Asia', flag: '🇲🇳', policyCount: 0, lastUpdated: '2026-08-01' },
]

function gatedPolicyBody(code: string) {
  return {
    country: code,
    method: 'sdid',
    att: null,
    se: null,
    ci_95: null,
    p_value: null,
    significant: false,
    treatment_year: 2018,
    synthetic_control: [],
    status: 'insufficient_controls',
  }
}

const TFT_BODY = {
  generated_at: '2026-08-26T00:00:00Z',
  model_version: 'v1',
  // Only KR has a catalogued city — MN has none, which is the point of the
  // zero-city test below.
  cities: [{ name: 'Seoul', lat: 37.5, lon: 127.0, country_code: 'KR', hourly: [] }],
}

function installFetch() {
  const spy = vi.fn(async (url: string) => {
    if (url.includes('by_country/KR.json')) return { ok: true, status: 200, json: async () => seriesBody('KR') } as unknown as Response
    if (url.includes('by_country/MN.json')) return { ok: true, status: 200, json: async () => seriesBody('MN') } as unknown as Response
    if (url.includes('by_country/ZZ.json')) return { ok: false, status: 404 } as Response
    if (url.includes('policy-impact/index.json')) return { ok: true, status: 200, json: async () => POLICY_INDEX } as unknown as Response
    if (url.includes('policy-impact/KR.json')) return { ok: true, status: 200, json: async () => gatedPolicyBody('KR') } as unknown as Response
    if (url.includes('policy-impact/MN.json')) return { ok: true, status: 200, json: async () => gatedPolicyBody('MN') } as unknown as Response
    if (url.includes('tft.json')) return { ok: true, status: 200, json: async () => TFT_BODY } as unknown as Response
    return { ok: false, status: 404 } as Response
  })
  vi.stubGlobal('fetch', spy)
  return spy
}

beforeEach(() => {
  vi.unstubAllGlobals()
  resetPolicyIndexCache()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('CountryProfile', () => {
  it('renders the country named by the code prop, not a hardcoded default', async () => {
    // Arrange
    installFetch()
    // Act
    render(<CountryProfile code="kr" />)
    // Assert — lowercase input is normalized, and the catalogued city renders.
    await waitFor(() => expect(screen.getByText('South Korea')).toBeTruthy())
    expect(screen.getByTestId('country-city-list').textContent).toContain('Seoul')
  })

  it('renders an honest zero-city message rather than an empty grid when the country has no catalogued cities', async () => {
    // Arrange
    installFetch()
    // Act
    render(<CountryProfile code="MN" />)
    // Assert
    await waitFor(() => expect(screen.getByTestId('country-no-cities')).toBeTruthy())
    expect(screen.queryByTestId('country-city-list')).toBeNull()
  })

  it('distinguishes "no reference observations published" from a read failure', async () => {
    // Arrange — ZZ has no published panel (404), not a broken read.
    installFetch()
    // Act
    render(<CountryProfile code="ZZ" />)
    // Assert
    await waitFor(() => expect(screen.getByTestId('country-no-coverage')).toBeTruthy())
    expect(screen.getByTestId('country-no-coverage').textContent).toContain('no reference observations published')
  })
})
