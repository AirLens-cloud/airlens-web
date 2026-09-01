/**
 * CountryProfile — city catalogue read failure (AAA).
 *
 * Regression for the review finding: `loadCityCatalog()` rejecting was being
 * collapsed into an empty array, so a network failure rendered identically
 * to "this country genuinely has zero catalogued cities" — the same
 * no-coverage/unavailable confusion `fetchCountrySeries` already avoids one
 * level up, reappearing one level down. Kept in its own file (rather than
 * alongside `CountryProfile.test.tsx`'s other cases) because
 * `landing/shared/data/loaders.ts` caches its `tft.json` fetch at module
 * scope keyed only by `'tft'` — once any test in a shared file resolves it
 * successfully, every later test in that file would see the cached success
 * regardless of what this test's mock returns. A fresh module registry per
 * test file (vitest's default) is what makes the failure actually reach the
 * page here.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import CountryProfile from './CountryProfile'
import { resetPolicyIndexCache } from '../api/policy'

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

const POLICY_INDEX = [
  { country: 'South Korea', countryCode: 'KR', region: 'East Asia', flag: '🇰🇷', policyCount: 1, lastUpdated: '2026-08-01', pm25AnnualStandard: 15 },
]

function gatedPolicyBody() {
  return {
    country: 'KR',
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

function installFetch() {
  const spy = vi.fn(async (url: string) => {
    if (url.includes('by_country/KR.json')) return { ok: true, status: 200, json: async () => seriesBody() } as unknown as Response
    if (url.includes('policy-impact/index.json')) return { ok: true, status: 200, json: async () => POLICY_INDEX } as unknown as Response
    if (url.includes('policy-impact/KR.json')) return { ok: true, status: 200, json: async () => gatedPolicyBody() } as unknown as Response
    // The city catalogue's only source — unreachable in this test.
    if (url.includes('tft.json')) return { ok: false, status: 500 } as Response
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

describe('CountryProfile — city catalogue read failure', () => {
  it('renders a read-failure message, never the "no catalogued cities" honesty state, when the city catalogue cannot be read', async () => {
    // Arrange — KR has a published panel; only its city catalogue is broken.
    installFetch()
    // Act
    render(<CountryProfile code="KR" />)
    // Assert
    await waitFor(() => expect(screen.getByTestId('country-cities-error')).toBeTruthy())
    expect(screen.getByTestId('country-cities-error').textContent).toContain('could not be read')
    expect(screen.queryByTestId('country-no-cities')).toBeNull()
    expect(screen.queryByTestId('country-city-list')).toBeNull()
  })
})
