/**
 * LaneCrossCheck — the replication claim (AAA).
 *
 * The property under test: a lane that declined to estimate is visible as a
 * declining lane. Omitting it would turn a one-lane result into an apparent
 * consensus, which is the strongest false claim this page could make.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import LaneCrossCheck from './LaneCrossCheck'
import type { PolicyImpact } from '../../types/policy'

afterEach(cleanup)

const base: PolicyImpact = {
  id: 'KR',
  country: 'KR',
  att: -1.87,
  ci_low: -3.46,
  ci_high: -0.28,
  p_value: 0.021,
  significant: true,
  panelSource: 'acag_v6_ground_cal',
}

describe('LaneCrossCheck', () => {
  it('renders every published lane beside the primary panel', () => {
    // Arrange
    render(
      <LaneCrossCheck
        impact={{
          ...base,
          crossCheck: {
            cams_eac4: { att: -0.94, status: 'ok', p_value: 0.31 },
            ground_stations: { att: -2.1, status: 'ok', p_value: 0.04 },
          },
        }}
      />,
    )
    // Assert
    expect(screen.getByText('PRIMARY PANEL')).toBeTruthy()
    expect(screen.getByText('-0.94')).toBeTruthy()
    expect(screen.getByText('-2.10')).toBeTruthy()
  })

  it('reports agreement on direction without claiming agreement on size', () => {
    render(
      <LaneCrossCheck
        impact={{
          ...base,
          crossCheck: {
            cams_eac4: { att: -0.94, status: 'ok', p_value: 0.31 },
            ground_stations: { att: -2.1, status: 'ok', p_value: 0.04 },
          },
        }}
      />,
    )
    expect(screen.getByText(/agree on the direction/i)).toBeTruthy()
    expect(screen.getByText(/do not necessarily agree on the size/i)).toBeTruthy()
  })

  it('says plainly when the lanes disagree on direction', () => {
    // Arrange — one lane down, one up.
    render(
      <LaneCrossCheck
        impact={{
          ...base,
          crossCheck: {
            cams_eac4: { att: 1.4, status: 'ok', p_value: 0.2 },
            ground_stations: { att: -2.1, status: 'ok', p_value: 0.04 },
          },
        }}
      />,
    )
    // Assert
    expect(screen.getByText(/disagree on direction/i)).toBeTruthy()
  })

  it('shows a gated lane as declining to estimate, with its reason', () => {
    // Arrange
    render(
      <LaneCrossCheck
        impact={{
          ...base,
          crossCheck: { ground_stations: { att: null, status: 'poor_pre_fit', p_value: null } },
        }}
      />,
    )
    // Assert — never a zero, never an omitted row.
    expect(screen.getByText('Declined to estimate')).toBeTruthy()
    expect(screen.getByText(/pre-treatment trends did not match/i)).toBeTruthy()
  })

  it('warns that a single-lane result is unreplicated', () => {
    // Arrange — the only other lane gated, so only the headline has a number.
    render(
      <LaneCrossCheck
        impact={{
          ...base,
          crossCheck: { cams_eac4: { att: null, status: 'insufficient_controls', p_value: null } },
        }}
      />,
    )
    // Assert
    expect(screen.getByText(/unreplicated/i)).toBeTruthy()
  })

  it('says the headline stands alone when no cross-check was published', () => {
    render(<LaneCrossCheck impact={base} />)
    expect(screen.getByText(/one panel alone/i)).toBeTruthy()
  })
})
