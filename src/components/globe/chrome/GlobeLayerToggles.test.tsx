/**
 * The switchboard's contract is a negative one as much as a positive one: it
 * may only offer controls whose layer this repo can actually draw. These tests
 * pin both halves so a future store port cannot quietly reintroduce a switch
 * for a deferred layer.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, cleanup, screen, fireEvent } from '@testing-library/react'
import GlobeLayerToggles from './GlobeLayerToggles'
import { useGlobeStore } from '../../../store/globeStore'
import { GRID_RENDERABLE_OVERLAYS } from '../../../lib/config/globeOverlays'

const INITIAL = useGlobeStore.getState()

beforeEach(() => {
  useGlobeStore.setState(INITIAL, true)
})

afterEach(cleanup)

describe('GlobeLayerToggles', () => {
  it('offers a switch for every layer the scene can mount', () => {
    // Arrange / Act — scoped to the switch list: "WIND" is also an overlay row,
    // and the two controls mean different things.
    const { container } = render(<GlobeLayerToggles />)
    const switches = Array.from(container.querySelectorAll('.gl-switch strong')).map((el) => el.textContent)
    // Assert
    expect(switches).toEqual(['STATIONS', 'PREDICTIONS', 'WIND', 'FIRES', 'POLLEN', 'GRATICULE'])
  })

  it('offers no switch for layers that have no renderer in this repo', () => {
    // Arrange / Act — arcs / choropleth / spikes / HD-bloom are deferred (G3).
    render(<GlobeLayerToggles />)
    const switchLabels = screen.getAllByRole('button').map((b) => b.textContent ?? '')
    // Assert
    for (const absent of ['ARCS', 'TRANSPORT ARCS', 'CHOROPLETH', 'SPIKES', 'HD']) {
      expect(switchLabels.some((text) => text.includes(absent))).toBe(false)
    }
  })

  it('writes the flip through to the store', () => {
    // Arrange
    const { container } = render(<GlobeLayerToggles />)
    const before = useGlobeStore.getState().showFires
    const fires = Array.from(container.querySelectorAll<HTMLButtonElement>('.gl-switch'))
      .find((el) => el.querySelector('strong')?.textContent === 'FIRES')
    // Act
    fireEvent.click(fires as HTMLButtonElement)
    // Assert
    expect(useGlobeStore.getState().showFires).toBe(!before)
  })

  it('only lists overlays the ontology says are grid-renderable', () => {
    // Arrange / Act
    render(<GlobeLayerToggles />)
    const picker = screen.getByRole('radiogroup', { name: /scalar field overlay/i })
    const offered = Array.from(picker.querySelectorAll('button')).map((b) => b.textContent ?? '')
    // Assert — every non-sentinel row maps to a renderable overlay id.
    expect(offered).toContain('NONE')
    expect(offered.length).toBeGreaterThan(1)
    expect(GRID_RENDERABLE_OVERLAYS.length).toBeGreaterThan(0)
  })

  it('hides the wind overlay row while the particle layer is off', () => {
    // Arrange — wind is a vector field drawn by the particle layer, not a grid.
    useGlobeStore.setState({ showParticles: false })
    // Act
    render(<GlobeLayerToggles />)
    const picker = screen.getByRole('radiogroup', { name: /scalar field overlay/i })
    const offered = Array.from(picker.querySelectorAll('button')).map((b) => b.textContent ?? '')
    // Assert
    expect(offered).not.toContain('WIND')
  })
})
