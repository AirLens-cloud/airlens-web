import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import GlobeLegend from './GlobeLegend'
import { useGlobeStore } from '../../../store/globeStore'

const INITIAL = useGlobeStore.getState()

beforeEach(() => {
  useGlobeStore.setState(INITIAL, true)
})

afterEach(cleanup)

describe('GlobeLegend', () => {
  it('renders nothing when no field and no markers are on screen', () => {
    // Arrange — honest empty: there is no colour scale and nothing to caveat.
    useGlobeStore.setState({
      overlayType: 'none', showParticles: false, showStations: false, showPredictions: false,
    })
    // Act
    const { container } = render(<GlobeLegend />)
    // Assert
    expect(container.firstChild).toBeNull()
  })

  it('says the station opacity channel is inactive rather than claiming a DQSS encoding', () => {
    // Arrange — data_quality.json has no publisher in this repo's cascade, so
    // every station renders at the default tier. Claiming "faint = low quality"
    // would describe an encoding the user cannot see.
    useGlobeStore.setState({
      overlayType: 'none', showParticles: false, showStations: true, showPredictions: false,
    })
    // Act
    render(<GlobeLegend />)
    // Assert
    expect(screen.getByText(/DQSS quality feed is not published/i)).toBeTruthy()
  })

  it('explains prediction ring fading as interval width, not magnitude', () => {
    // Arrange
    useGlobeStore.setState({
      overlayType: 'none', showParticles: false, showStations: false, showPredictions: true,
    })
    // Act
    render(<GlobeLegend />)
    // Assert
    expect(screen.getByText(/wider p10–p90 interval/i)).toBeTruthy()
  })

  it('keys the active scalar field with its published value range', () => {
    // Arrange
    useGlobeStore.setState({
      overlayType: 'pm25',
      activeGridMeta: { overlayType: 'pm25', source: 'Test grid', timestamp: 1, min: 3.2, max: 71.4 },
    })
    // Act
    render(<GlobeLegend />)
    // Assert
    expect(screen.getByText(/3\.2–71\.4/)).toBeTruthy()
  })

  it('carries the single-member caveat on a resolved forecast frame', () => {
    // Arrange
    useGlobeStore.setState({
      overlayType: 'pm25',
      timeOffsetHours: 6,
      activeGridMeta: {
        overlayType: 'pm25', source: 'NOAA GEFS-Aerosols', timestamp: 1,
        min: 1, max: 40, leadHours: 6, validTime: 2,
      },
    })
    // Act
    render(<GlobeLegend />)
    // Assert
    expect(screen.getByText(/no uncertainty band/i)).toBeTruthy()
  })
})
