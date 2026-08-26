/**
 * Insights page — band order, selection, and the URL contract (AAA).
 *
 * The heavy bands (the WebGL-less canvas map, the prediction card's own feed)
 * are stubbed: they have their own coverage, and jsdom cannot draw either. What
 * is tested here is the page's own decisions — which country it opens on, that
 * the URL follows the selection, and that a catalogue failure is reported as a
 * failure rather than as an empty result set.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import type { PolicyImpact, PolicyIndexEntry, PolicySummary } from '../types/policy'

vi.mock('../components/insights/PolicyMap', () => ({
  default: ({ selectedCode }: { selectedCode: string }) => (
    <div data-testid="band-map" data-country={selectedCode} />
  ),
}))
vi.mock('../components/insights/CityPredictionCard', () => ({
  default: () => <div data-testid="band-prediction" />,
}))

const summaryRow = (countryCode: string, att: number | null, significant: boolean | null) => ({
  countryCode,
  att,
  ci_low: att === null ? null : att - 1,
  ci_high: att === null ? null : att + 0.5,
  p_value: att === null ? null : 0.02,
  significant,
  status: att === null ? 'insufficient_controls' : 'ok',
  treatmentYear: 2018,
  panelSource: 'acag_v6_ground_cal',
  fitScore: 84,
  hasCrossCheck: true,
})

const SUMMARY: PolicySummary = {
  generatedAt: '2026-08-26',
  count: 3,
  countries: [
    summaryRow('AE', null, false),
    summaryRow('KR', -1.87, true),
    summaryRow('JP', -0.4, false),
  ],
}

const INDEX: PolicyIndexEntry[] = [
  { country: 'United Arab Emirates', countryCode: 'AE', region: 'Middle East', flag: '🇦🇪', policyCount: 1, lastUpdated: '2026-08-26' },
  { country: 'South Korea', countryCode: 'KR', region: 'East Asia', flag: '🇰🇷', policyCount: 1, lastUpdated: '2026-08-26', pm25AnnualStandard: 15 },
  { country: 'Japan', countryCode: 'JP', region: 'East Asia', flag: '🇯🇵', policyCount: 1, lastUpdated: '2026-08-26', pm25AnnualStandard: 15 },
]

const IMPACT: Partial<PolicyImpact> & Record<string, unknown> = {
  country: 'KR',
  method: 'sdid',
  panel_source: 'acag_v6_ground_cal',
  att: -1.87,
  ci_95: [-3.46, -0.28],
  p_value: 0.021,
  significant: true,
  status: 'ok',
  treatment_year: 2018,
  synthetic_control: [
    { date: '2016', event: 'Fine Dust Act', pm25: 26, synthetic_pm25: 26 },
    { date: '2019', event: '', pm25: 21, synthetic_pm25: 23.5 },
  ],
  data_quality: { dqss_score: 84 },
  cross_check: { cams_eac4: { att: -0.9, status: 'ok', p_value: 0.3 } },
}

const PANEL = {
  country: 'KR',
  series: [
    { year: 2016, pm25Mean: 26, p10: 14, p90: 40, stationCount: 20, sources: ['acag_v6'] },
    { year: 2019, pm25Mean: 21, p10: 11, p90: 35, stationCount: 21, sources: ['openaq'] },
  ],
  sourcesUsed: ['acag_v6', 'openaq'],
  totalStations: 32,
  policy: { treatment_year: 2018, policy_name: 'Fine Dust Act' },
  generatedAt: '2026-08-26T00:00:00Z',
}

/** Serve the listed URL fragments; everything else 404s. */
function mockFetch(available: Record<string, unknown>) {
  const spy = vi.fn(async (url: string) => {
    const hit = Object.entries(available).find(([path]) => url.includes(path))
    if (!hit) return { ok: false, status: 404 } as Response
    return { ok: true, status: 200, json: async () => hit[1] } as unknown as Response
  })
  vi.stubGlobal('fetch', spy)
  return spy
}

const FULL_FEED = {
  'policy-impact/summary.json': SUMMARY,
  'policy-impact/index.json': INDEX,
  'policy-impact/KR.json': IMPACT,
  'policy-impact/JP.json': { ...IMPACT, country: 'JP', att: -0.4 },
  'by_country/KR.json': PANEL,
  'by_country/JP.json': { ...PANEL, country: 'JP' },
}

async function renderPage(path = '/insights') {
  window.history.pushState({}, '', path)
  const { resetPolicyIndexCache } = await import('../api/policy')
  resetPolicyIndexCache()
  const { default: Insights } = await import('./Insights')
  return render(<Insights />)
}

beforeEach(() => {
  vi.unstubAllGlobals()
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  }))
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('Insights — country selection', () => {
  it('opens on the first country with a significant estimate, not the first alphabetically', async () => {
    // Arrange — AE sorts first but was never estimated.
    mockFetch(FULL_FEED)
    // Act
    await renderPage()
    // Assert
    await waitFor(() => expect(screen.getByTestId('band-map').getAttribute('data-country')).toBe('KR'))
  })

  it('honours a country named in the URL', async () => {
    mockFetch(FULL_FEED)
    await renderPage('/insights?country=JP')
    await waitFor(() => expect(screen.getByTestId('band-map').getAttribute('data-country')).toBe('JP'))
  })

  it('falls back to the default for an unknown code instead of erroring', async () => {
    // Arrange — 'ZZ' is not in the estimated set.
    mockFetch(FULL_FEED)
    // Act
    await renderPage('/insights?country=ZZ')
    // Assert
    await waitFor(() => expect(screen.getByTestId('band-map').getAttribute('data-country')).toBe('KR'))
  })

  it('writes the resolved country back to the URL', async () => {
    mockFetch(FULL_FEED)
    await renderPage('/insights?country=ZZ')
    await waitFor(() => expect(window.location.search).toContain('country=KR'))
  })

  it('lists unestimated countries in the picker, marked as such', async () => {
    // Arrange — hiding them would misrepresent the batch's coverage.
    mockFetch(FULL_FEED)
    // Act
    await renderPage()
    // Assert
    await waitFor(() =>
      expect(screen.getByText(/United Arab Emirates — not estimated/)).toBeTruthy(),
    )
  })
})

describe('Insights — band order', () => {
  it('renders the six bands in the approved order', async () => {
    // Arrange
    mockFetch(FULL_FEED)
    // Act
    const { container } = await renderPage()
    // Assert
    await waitFor(() => expect(screen.getByTestId('band-map')).toBeTruthy())
    const order = [...container.querySelectorAll('.ins-headline, .ins-lanes, [data-testid="band-map"], .ins-sdid, .ins-trend, [data-testid="band-prediction"]')]
      .map((n) => n.className || n.getAttribute('data-testid'))
    expect(order).toEqual([
      'ins-headline',
      'ins-lanes',
      'band-map',
      'ins-sdid',
      'ins-trend',
      'band-prediction',
    ])
  })

  it('keeps the sentiment slot visible as not published rather than dropping it', async () => {
    mockFetch(FULL_FEED)
    await renderPage()
    await waitFor(() => expect(screen.getByText('NOT PUBLISHED')).toBeTruthy())
  })
})

describe('Insights — failure states', () => {
  it('reports a catalogue failure as a failure, not as an empty result set', async () => {
    // Arrange — nothing serves.
    mockFetch({})
    // Act
    await renderPage()
    // Assert
    await waitFor(() =>
      expect(screen.getByText(/not a statement that no analysis exists/i)).toBeTruthy(),
    )
  })

  it('still shows the summary verdict when the detail feeds fail', async () => {
    // Arrange — catalogue loads, per-country files do not.
    mockFetch({ 'policy-impact/summary.json': SUMMARY, 'policy-impact/index.json': INDEX })
    // Act
    await renderPage()
    // Assert — the headline degrades to the gate copy, and the page says why the
    // charts are missing instead of implying the data does not exist.
    await waitFor(() =>
      expect(document.getElementById('ins-headline-title')?.textContent).toContain('South Korea'),
    )
    expect(document.querySelector('.ins-headline-gate')?.textContent).toMatch(/counterfactual/i)
  })
})
