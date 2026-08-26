/**
 * AttHeadline — the Glass-box contract at the top of the page (AAA).
 *
 * The failure this guards against: a gated country rendering as a number, or an
 * estimate rendering without the interval that qualifies it.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import AttHeadline from './AttHeadline'
import type { PolicyImpact } from '../../types/policy'

afterEach(cleanup)

const estimated: PolicyImpact = {
  id: 'KR',
  country: 'KR',
  city: 'South Korea',
  att: -1.87,
  ci_low: -3.46,
  ci_high: -0.28,
  p_value: 0.021,
  significant: true,
  dqss: 'B',
  status: 'ok',
  panelSource: 'acag_v6_ground_cal',
  title: 'Fine Dust Act',
}

const gated: PolicyImpact = {
  ...estimated,
  att: null,
  ci_low: null,
  ci_high: null,
  p_value: null,
  significant: false,
  dqss: undefined,
  status: 'insufficient_controls',
}

function renderHeadline(impact: PolicyImpact | null) {
  return render(
    <AttHeadline
      countryName="South Korea"
      flag="🇰🇷"
      impact={impact}
      estimatedCount={88}
      totalCount={119}
    />,
  )
}

describe('AttHeadline — an estimated country', () => {
  it('shows the ATT with its interval and p-value in the same block', () => {
    // Arrange / Act
    renderHeadline(estimated)
    // Assert — Glass-box: the number never travels alone.
    expect(screen.getByText('-1.87')).toBeTruthy()
    expect(screen.getByText('-3.46 to -0.28')).toBeTruthy()
    expect(screen.getByText('p < 0.05')).toBeTruthy()
  })

  it('labels a zero-excluding significant estimate as significant', () => {
    renderHeadline(estimated)
    expect(screen.getByText('SIGNIFICANT')).toBeTruthy()
  })

  it('calls an interval that straddles zero inconclusive, not "no effect"', () => {
    // Arrange
    renderHeadline({ ...estimated, ci_low: -3.0, ci_high: 0.9, p_value: 0.3, significant: false })
    // Assert
    expect(screen.getByText('INCONCLUSIVE')).toBeTruthy()
    expect(screen.getByText(/not distinguishable from zero/i)).toBeTruthy()
  })
})

describe('AttHeadline — a gated country', () => {
  it('states the gate reason instead of a number', () => {
    // Arrange / Act
    renderHeadline(gated)
    // Assert
    expect(screen.getByText(/No clean control countries/i)).toBeTruthy()
    expect(screen.queryByText('0.00')).toBeNull()
    expect(screen.queryByText('+0.00')).toBeNull()
  })

  it('says out loud that this is not a measured effect of zero', () => {
    renderHeadline(gated)
    expect(screen.getByText(/not a measured effect of zero/i)).toBeTruthy()
  })

  it('treats a missing impact record the same as a gated one', () => {
    // Arrange — a failed detail fetch must not read as an estimate.
    renderHeadline(null)
    // Assert
    expect(screen.getByText(/counterfactual/i)).toBeTruthy()
  })
})

describe('AttHeadline — panel fit', () => {
  it('names the fit grade as panel fit, not sensor DQSS', () => {
    // Arrange / Act
    renderHeadline(estimated)
    // Assert — the two scales measure different things and must not be conflated.
    expect(screen.getByText(/Not the sensor DQSS scale/i)).toBeTruthy()
  })

  it('shows how much of the batch produced an estimate at all', () => {
    renderHeadline(estimated)
    expect(screen.getByText('88 ESTIMATED / 119 RUN')).toBeTruthy()
  })
})
