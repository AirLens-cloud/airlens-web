/**
 * GlobeObsHud — pure presentational status strip, so this file is
 * props-in/DOM-out only (no store). The beyond-scale caveat for PM2.5's own
 * range top lives in GlobeLegend only (GlobeLegend.test.tsx pins it there);
 * this file pins the opposite — the HUD strip never repeats it, so /globe
 * shows the warning once, not twice (design-audit 2026-09-05).
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

  it('renders a range beyond the reportable scale as-is, with no caveat of its own', () => {
    // Arrange — the real max published on 2026-09-04 (Yakutia fire belt).
    // Act
    render(<GlobeObsHud {...baseProps({ range: [0.1, 15867.96] })} />)
    // Assert — the number is untouched; the caveat is GlobeLegend's job alone.
    expect(screen.getByText('0.1–15868.0')).toBeTruthy()
    expect(screen.queryByText(/cannot verify/i)).toBeNull()
  })

  it('isolates the unit in its own span so CSS can opt it out of the strip-wide uppercase transform', () => {
    // Arrange — the whole strip carries a `.m` uppercase transform (obs.css);
    // CSS text-transform does not touch jsdom's textContent, so this cannot
    // assert the rendered case directly. What it can pin is the DOM seam the
    // fix depends on: `.gobs-unit` exists as the override target, and it
    // carries the unit text verbatim — without it, µg/m³ uppercases to Greek
    // capital Mu and reads as an unlabelled "MG/M³" (design-audit 2026-09-05).
    // Act
    const { container } = render(<GlobeObsHud {...baseProps()} />)
    // Assert
    const unitEl = container.querySelector('.gobs-unit')
    expect(unitEl).toBeTruthy()
    expect(unitEl?.textContent).toBe('µg/m³')
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
