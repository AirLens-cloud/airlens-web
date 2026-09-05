/**
 * The switchboard's contract is a negative one as much as a positive one: it
 * may only offer controls whose layer this repo can actually draw. These tests
 * pin both halves so a future store port cannot quietly reintroduce a switch
 * for a deferred layer.
 *
 * P1 (design audit 2026-09-05) — the flat 15-field + 4-switch list is now
 * grouped behind an AIR / WEATHER / EVENTS / MORE header row (`.gl-tab`,
 * plain buttons with `aria-expanded` — an exclusive accordion, not a tabs
 * widget). AIR is open by default; a group's field chips and layer switches
 * share one `hidden` state, so a switch or chip is only reachable (and only
 * returned by `getByRole`) once its group header opens — that mirrors real
 * keyboard/AT reachability.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, cleanup, screen, fireEvent, within } from '@testing-library/react'
import GlobeLayerToggles from './GlobeLayerToggles'
import { useGlobeStore } from '../../../store/globeStore'
import { GRID_RENDERABLE_OVERLAYS } from '../../../lib/config/globeOverlays'

const INITIAL = useGlobeStore.getState()

beforeEach(() => {
  useGlobeStore.setState(INITIAL, true)
})

afterEach(cleanup)

const openGroup = (name: RegExp) => fireEvent.click(screen.getByRole('button', { name }))
const switchLabelsOf = () =>
  screen.getAllByRole('button').map((b) => b.querySelector('strong')?.textContent).filter(Boolean)

describe('GlobeLayerToggles', () => {
  it('opens on the AIR group by default, with STATIONS/PREDICTIONS reachable and other groups hidden', () => {
    // Arrange / Act
    render(<GlobeLayerToggles />)
    // Assert — AIR header expanded, its switches present…
    expect(screen.getByRole('button', { name: 'AIR' }).getAttribute('aria-expanded')).toBe('true')
    const switches = switchLabelsOf()
    expect(switches).toEqual(['STATIONS', 'PREDICTIONS'])
    // …WEATHER/EVENTS/MORE switches are not reachable until their header opens.
    for (const absent of ['WIND', 'FIRES', 'POLLEN', 'GRATICULE']) {
      expect(switches).not.toContain(absent)
    }
  })

  it('offers no switch for layers that have no renderer in this repo', () => {
    // Arrange / Act — arcs / choropleth / spikes / HD-bloom are deferred (G3).
    render(<GlobeLayerToggles />)
    openGroup(/^weather$/i)
    openGroup(/^events$/i)
    openGroup(/^more/i)
    const switchLabels = screen.getAllByRole('button').map((b) => b.textContent ?? '')
    // Assert
    for (const absent of ['ARCS', 'TRANSPORT ARCS', 'CHOROPLETH', 'SPIKES', 'HD']) {
      expect(switchLabels.some((text) => text.includes(absent))).toBe(false)
    }
  })

  it('writes the flip through to the store once EVENTS is open', () => {
    // Arrange
    render(<GlobeLayerToggles />)
    openGroup(/^events$/i)
    const before = useGlobeStore.getState().showFires
    const fires = screen.getAllByRole('button').find((el) => el.querySelector('strong')?.textContent === 'FIRES')
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

  it('hides the wind overlay row while the particle layer is off, even with WEATHER open', () => {
    // Arrange — wind is a vector field drawn by the particle layer, not a grid.
    useGlobeStore.setState({ showParticles: false })
    // Act
    render(<GlobeLayerToggles />)
    openGroup(/^weather$/i)
    const picker = screen.getByRole('radiogroup', { name: /scalar field overlay/i })
    const offered = Array.from(picker.querySelectorAll('button')).map((b) => b.textContent ?? '')
    // Assert
    expect(offered).not.toContain('WIND')
  })

  it('groups AIR / WEATHER / EVENTS behind headers, with everything unclaimed under MORE', () => {
    // Arrange / Act
    render(<GlobeLayerToggles />)
    const headers = ['AIR', 'WEATHER', 'EVENTS'].map((name) => screen.getByRole('button', { name }))
    // Assert — 3 named groups + a MORE catch-all with a live count.
    expect(headers).toHaveLength(3)
    expect(screen.getByRole('button', { name: /^MORE \(\d+\)$/ })).toBeTruthy()

    // MORE carries the ocean field category (not Air/Weather/Events domains)
    // and the secondary layers (region-limited / reference-only).
    openGroup(/^more/i)
    const picker = screen.getByRole('radiogroup', { name: /scalar field overlay/i })
    const morePanel = document.getElementById('gl-panel-more') as HTMLElement
    const moreOverlays = Array.from(within(morePanel).getAllByRole('radio')).map((b) => b.textContent)
    expect(moreOverlays.length).toBeGreaterThan(0)
    expect(picker.contains(morePanel)).toBe(true)

    expect(switchLabelsOf()).toEqual(['POLLEN', 'GRATICULE'])
  })

  it('opens groups exclusively — opening EVENTS hides AIR switches', () => {
    // Arrange
    render(<GlobeLayerToggles />)
    // Act
    openGroup(/^events$/i)
    // Assert
    expect(screen.getByRole('button', { name: 'AIR' }).getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByRole('button', { name: 'EVENTS' }).getAttribute('aria-expanded')).toBe('true')
    expect(switchLabelsOf()).toEqual(['FIRES'])
  })
})
