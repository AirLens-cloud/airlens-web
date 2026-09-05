/**
 * AttHeadline — the Glass-box contract at the top of the page (AAA).
 *
 * Two failures this guards against:
 *  - a gated country rendering as a number, or an estimate rendering without the
 *    interval that qualifies it;
 *  - a failed DETAIL fetch rendering an estimated country as never-analysed.
 *    The verdict rides on the summary row, which is already loaded, so `impact`
 *    going null must thin the page below without touching the number above.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import AttHeadline from './AttHeadline'
import type { PolicyImpact, PolicySummaryRow } from '../../types/policy'

afterEach(cleanup)

const estimatedRow: PolicySummaryRow = {
  countryCode: 'KR',
  att: -1.87,
  ci_low: -3.46,
  ci_high: -0.28,
  p_value: 0.021,
  significant: true,
  status: 'ok',
  treatmentYear: 2019,
  panelSource: 'acag_v6_ground_cal',
  fitScore: 72,
  hasCrossCheck: true,
}

const gatedRow: PolicySummaryRow = {
  ...estimatedRow,
  att: null,
  ci_low: null,
  ci_high: null,
  p_value: null,
  significant: false,
  status: 'insufficient_controls',
  fitScore: null,
}

const impact: PolicyImpact = {
  id: 'KR',
  country: 'KR',
  city: 'South Korea',
  att: -1.87,
  ci_low: -3.46,
  ci_high: -0.28,
  p_value: 0.021,
  significant: true,
  status: 'ok',
  title: 'Fine Dust Act',
}

function renderHeadline(summary: PolicySummaryRow, detail: PolicyImpact | null = impact) {
  return render(
    <AttHeadline
      countryName="South Korea"
      summary={summary}
      impact={detail}
      estimatedCount={88}
      totalCount={119}
    />,
  )
}

describe('AttHeadline — an estimated country', () => {
  it('shows the ATT with its interval and p-value in the same block', () => {
    // Arrange / Act
    renderHeadline(estimatedRow)
    // Assert — Glass-box: the number never travels alone.
    expect(screen.getByText('-1.87')).toBeTruthy()
    expect(screen.getByText('-3.46 to -0.28')).toBeTruthy()
    expect(screen.getByText('p < 0.05')).toBeTruthy()
  })

  it('labels a zero-excluding significant estimate as significant', () => {
    renderHeadline(estimatedRow)
    expect(screen.getByText('SIGNIFICANT')).toBeTruthy()
  })

  it('shows the country flag next to the name, keyed off the summary row', () => {
    // Arrange / Act
    renderHeadline(estimatedRow)
    // Assert — countryCode comes from `summary`, not a separate emoji prop.
    expect(screen.getByAltText('South Korea flag')).toBeTruthy()
  })

  it('calls an interval that straddles zero inconclusive, not "no effect"', () => {
    // Arrange
    renderHeadline({ ...estimatedRow, ci_low: -3.0, ci_high: 0.9, p_value: 0.3, significant: false })
    // Assert
    expect(screen.getByText('INCONCLUSIVE')).toBeTruthy()
    expect(screen.getByText(/not distinguishable from zero/i)).toBeTruthy()
  })
})

describe('AttHeadline — a gated country', () => {
  it('states the gate reason instead of a number', () => {
    // Arrange / Act
    renderHeadline(gatedRow, null)
    // Assert
    expect(screen.getByText(/No clean control countries/i)).toBeTruthy()
    expect(screen.queryByText('0.00')).toBeNull()
    expect(screen.queryByText('+0.00')).toBeNull()
  })

  it('says out loud that this is not a measured effect of zero', () => {
    renderHeadline(gatedRow, null)
    expect(screen.getByText(/not a measured effect of zero/i)).toBeTruthy()
  })

  it('stays gated even when a detail file did load', () => {
    // Arrange — the summary is the verdict; a stray detail record cannot
    // promote a gated country into an estimated one.
    renderHeadline(gatedRow, impact)
    // Assert
    expect(screen.getByText(/No clean control countries/i)).toBeTruthy()
    expect(screen.queryByText('-1.87')).toBeNull()
  })
})

describe('AttHeadline — when the detail fetch failed', () => {
  it('still shows the estimate, because the verdict comes from the summary', () => {
    // Arrange — impact null is what a 5xx on the per-country file looks like.
    renderHeadline(estimatedRow, null)
    // Assert — an outage must not read as "this country was never analysed".
    expect(screen.getByText('-1.87')).toBeTruthy()
    expect(screen.getByText('-3.46 to -0.28')).toBeTruthy()
    expect(screen.queryByText(/counterfactual/i)).toBeNull()
  })

  it('falls back to the treatment year when the policy name is unavailable', () => {
    renderHeadline(estimatedRow, null)
    expect(screen.getByText('2019')).toBeTruthy()
  })
})

describe('AttHeadline — panel fit', () => {
  it('names the fit grade as panel fit, not sensor DQSS', () => {
    // Arrange / Act
    renderHeadline(estimatedRow)
    // Assert — the two scales measure different things and must not be conflated.
    expect(screen.getByText(/Not the sensor DQSS scale/i)).toBeTruthy()
  })

  it('shows how much of the batch produced an estimate at all', () => {
    renderHeadline(estimatedRow)
    expect(screen.getByText('88 ESTIMATED / 119 RUN')).toBeTruthy()
  })
})
