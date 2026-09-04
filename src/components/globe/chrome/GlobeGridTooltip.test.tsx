/**
 * GlobeGridTooltip — pointer readout for the hovered scalar-field cell. Pins
 * the beyond-scale caveat for PM2.5: the sampled value renders untouched, and
 * only a PM2.5 hover past `gridPlausibility.ts`'s scale grows a caveat line —
 * other overlays never do, since the scale is PM2.5-specific.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import GlobeGridTooltip from './GlobeGridTooltip'
import { useGlobeStore } from '../../../store/globeStore'

const INITIAL = useGlobeStore.getState()

beforeEach(() => {
  useGlobeStore.setState(INITIAL, true)
})

afterEach(cleanup)

describe('GlobeGridTooltip', () => {
  it('renders the sampled PM2.5 value with no caveat when inside the reportable scale', () => {
    // Arrange
    useGlobeStore.setState({ overlayType: 'pm25', gridHover: { lat: 37.5, lon: 127, value: 42.3 } })
    // Act
    render(<GlobeGridTooltip />)
    // Assert
    expect(screen.getByText('42.3')).toBeTruthy()
    expect(screen.queryByText(/cannot verify/i)).toBeNull()
  })

  it('caveats a PM2.5 hover past the reportable scale, real number intact', () => {
    // Arrange — the real max published on 2026-09-04 (Yakutia fire belt).
    useGlobeStore.setState({ overlayType: 'pm25', gridHover: { lat: 65, lon: 116, value: 15867.96 } })
    // Act
    render(<GlobeGridTooltip />)
    // Assert
    expect(screen.getByText('15868.0')).toBeTruthy()
    expect(screen.getByText(/we cannot verify this reading/i)).toBeTruthy()
  })

  it('never caveats a non-PM2.5 overlay, even past 500.4', () => {
    // Arrange — gridPlausibility.ts's scale is PM2.5-specific.
    useGlobeStore.setState({ overlayType: 'temp', gridHover: { lat: 0, lon: 0, value: 600 } })
    // Act
    render(<GlobeGridTooltip />)
    // Assert
    expect(screen.queryByText(/cannot verify/i)).toBeNull()
  })

  it('renders "Not measured" rather than a caveat when the cell has no value', () => {
    // Arrange
    useGlobeStore.setState({ overlayType: 'pm25', gridHover: { lat: 0, lon: 0, value: null } })
    // Act
    render(<GlobeGridTooltip />)
    // Assert
    expect(screen.getByText('Not measured')).toBeTruthy()
    expect(screen.queryByText(/cannot verify/i)).toBeNull()
  })
})
