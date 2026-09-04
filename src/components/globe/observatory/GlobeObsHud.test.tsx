/**
 * GlobeObsHud — pure presentational status strip, so this file is
 * props-in/DOM-out only (no store). Pins the beyond-scale caveat: PM2.5's own
 * range top gets a second, separate line when `gridPlausibility.ts` cannot
 * verify it, without the `range` numbers themselves ever changing.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import GlobeObsHud, { type GlobeObsHudProps } from './GlobeObsHud'

afterEach(cleanup)

function baseProps(overrides: Partial<GlobeObsHudProps> = {}): GlobeObsHudProps {
  return {
    status: 'ready',
    label: 'PM2.5',
    unit: 'µg/m³',
    range: [0.1, 71.4],
    nature: 'observed',
    motion: 'static',
    source: 'NOAA GEFS-Aerosols',
    mode: 'live',
    ...overrides,
  }
}

describe('GlobeObsHud', () => {
  it('renders the range as-is when the max sits inside the reportable scale', () => {
    // Arrange / Act
    render(<GlobeObsHud {...baseProps()} />)
    // Assert
    expect(screen.getByText('0.1–71.4')).toBeTruthy()
    expect(screen.queryByText(/cannot verify/i)).toBeNull()
  })

  it('caveats a PM2.5 range max beyond the reportable scale, real number intact', () => {
    // Arrange — the real max published on 2026-09-04 (Yakutia fire belt).
    // Act
    render(<GlobeObsHud {...baseProps({ range: [0.1, 15867.96] })} />)
    // Assert
    expect(screen.getByText('0.1–15868.0')).toBeTruthy()
    expect(screen.getByText(/we cannot verify this reading/i)).toBeTruthy()
  })

  it('never caveats a non-PM2.5 field, even past 500.4', () => {
    // Arrange — gridPlausibility.ts's scale is PM2.5-specific; a different
    // phenomenon sharing a large number is not a PM2.5 verdict.
    // Act
    render(<GlobeObsHud {...baseProps({ label: 'Wind', unit: 'm/s', range: [0, 600] })} />)
    // Assert
    expect(screen.queryByText(/cannot verify/i)).toBeNull()
  })
})
