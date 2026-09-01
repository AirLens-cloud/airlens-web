// ArticleEvidenceBlock — withheld-reason rendering (never a vanished section)
// and independent success/failure of its two feeds (dispatch-article-signal-
// desk.md §5/§6-5).
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'

vi.mock('../../api/countrySeries', () => ({ fetchCountrySeries: vi.fn() }))
vi.mock('../../api/policy', () => ({
  fetchCountryPolicyImpact: vi.fn(),
  attReliability: vi.fn(() => 'reliable'),
  attGateReason: vi.fn(() => 'Not enough data to construct a counterfactual.'),
}))

import { fetchCountrySeries } from '../../api/countrySeries'
import { fetchCountryPolicyImpact } from '../../api/policy'
import ArticleEvidenceBlock from './ArticleEvidenceBlock'

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

describe('ArticleEvidenceBlock', () => {
  it('renders a withheld reason (not a vanished section) when the article has no country code', () => {
    render(<ArticleEvidenceBlock countryCode={null} />)
    expect(screen.getByText(/withheld/i)).toBeTruthy()
    expect(screen.getByLabelText('AirLens analysis')).toBeTruthy()
  })

  it('renders the observed PM2.5 block even when the policy-effect fetch fails (independent-failure)', async () => {
    vi.mocked(fetchCountrySeries).mockResolvedValue({
      countryCode: 'KR', countryName: null, flag: null,
      points: [{ year: 2026, pm25: 20, p10: 15, p90: 25, stationCount: 10, sources: ['acag_v6'] }],
      sourcesUsed: [], totalStations: 10, treatmentYear: null, policyName: null, generatedAt: null,
    })
    vi.mocked(fetchCountryPolicyImpact).mockRejectedValue(new Error('policy feed down'))

    render(<ArticleEvidenceBlock countryCode="KR" />)

    expect(await screen.findByText(/observed pm2\.5/i)).toBeTruthy()
    expect(screen.getByText(/20\.0 µg\/m³/)).toBeTruthy()
  })

  it('renders withheld when neither feed has anything for this country', async () => {
    vi.mocked(fetchCountrySeries).mockResolvedValue(null)
    vi.mocked(fetchCountryPolicyImpact).mockResolvedValue(null)

    render(<ArticleEvidenceBlock countryCode="ZZ" />)

    expect(await screen.findByText(/no published air-quality panel or policy estimate/i)).toBeTruthy()
  })
})
