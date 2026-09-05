/**
 * The deck's two honesty gates: a lens whose layer bundle this repo cannot
 * draw, and a lens whose data has not resolved, must both be visibly disabled
 * rather than silently doing nothing when clicked.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { useGlobeStore } from '../store/globeStore'
import type { TimelineData } from '../api/timeline'

const fetchTimelineManifest = vi.fn<() => Promise<TimelineData | null>>()

vi.mock('../api/timeline', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/timeline')>()
  return { ...actual, fetchTimelineManifest: () => fetchTimelineManifest() }
})

// WebGL support is a real probe against jsdom's canvas, which always answers
// "no" — every test defaults it to `true` in beforeEach so the existing mode
// gating tests below stay on the Globe (3D) view they were written against.
// Tests about the webgl-fallback routing itself override this per-test.
const isWebGLSupportedMock = vi.fn<() => boolean>()
vi.mock('../lib/webgl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/webgl')>()
  return { ...actual, isWebGLSupported: () => isWebGLSupportedMock() }
})

// The engine and the 2D fallback are lazy chunks with their own coverage; the
// stage renders `null` for both under Suspense here, which is what we want —
// these tests are about the chrome's gating decisions. `engineBehavior` lets
// the loading-gate/error-boundary tests below simulate the two states a real
// import() can be stuck in that `default: () => null` can't: still-pending
// ('suspend', via the manual-Suspense throw-a-promise trick) and rejected
// ('error', a synchronous throw an Error Boundary must catch).
type EngineBehavior = 'ready' | 'suspend' | 'error'
let engineBehavior: EngineBehavior = 'ready'
vi.mock('../components/globe/three/Globe3DScene', () => ({
  default: () => {
    if (engineBehavior === 'suspend') throw new Promise<never>(() => {})
    if (engineBehavior === 'error') throw new Error('mock engine chunk failure')
    return null
  },
  orbitControlsRef: { current: null },
}))
vi.mock('../components/globe/GlobeFallback', () => ({ default: () => <div data-testid="globe-fallback" /> }))
// Map/Table have their own data-fetching coverage (GlobeTableView.test.tsx) —
// stubbed here so these page-level tests never issue a real grid-snapshot fetch.
vi.mock('../components/globe/views/GlobeMapView', () => ({ default: () => <div data-testid="globe-map-view" /> }))
vi.mock('../components/globe/views/GlobeTableView', () => ({ default: () => <div data-testid="globe-table-view" /> }))

import Globe from './Globe'

const INITIAL = useGlobeStore.getState()

const FORECAST_MANIFEST: TimelineData = {
  frames: [
    { validTime: '2026-08-26T18:00:00Z', leadHours: 6, cycle: '2026-08-26T12:00:00Z', file: 'b.json', offsetHours: 6 },
  ],
  refTime: '2026-08-26T12:00:00Z',
  generatedAt: '2026-08-26T12:10:00Z',
  stale: false,
}

beforeEach(() => {
  useGlobeStore.setState(INITIAL, true)
  fetchTimelineManifest.mockResolvedValue(null)
  isWebGLSupportedMock.mockReturnValue(true)
  engineBehavior = 'ready'
  // jsdom ships no matchMedia; usePlatform needs one to answer touch/motion.
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }))
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

// Role-scoped, not `getByText(label).closest('button')`: PM2.5 is now the
// default field (P0, 01-ux-audit.md §2 #3), so the evidence card's honest
// provenance row renders an "FORECAST" tag alongside "ANALYSIS"/"OBSERVATION"
// (PHENOMENA.pm25.provenance) whenever a mode's own label is also "FORECAST"
// — a second plain-text match `getByText` can't disambiguate from the mode
// rail's button. The accessible name (`aria-label`) stays unique to the rail.
function modeButton(label: string): HTMLButtonElement {
  return screen.getByRole('button', { name: new RegExp(`^${label}\\b`) }) as HTMLButtonElement
}

describe('Globe — mode gating', () => {
  it('disables POLICY because its choropleth layer is not ported', async () => {
    // Arrange / Act
    render(<Globe />)
    // Assert
    await waitFor(() => expect(modeButton('POLICY').disabled).toBe(true))
  })

  it('leaves the store untouched when a disabled lens is keyed', async () => {
    // Arrange
    const { container } = render(<Globe />)
    await waitFor(() => expect(modeButton('POLICY').disabled).toBe(true))
    const before = useGlobeStore.getState().showChoropleth
    // Act — "5" is POLICY's keyboard slot.
    const stage = container.querySelector('.globe-3d-shell, .globe-stage-main') as HTMLElement
    fireEvent.keyDown(stage, { key: '5' })
    // Assert
    expect(useGlobeStore.getState().showChoropleth).toBe(before)
  })

  it('disables FORECAST while no usable GEFS frame has resolved', async () => {
    // Arrange — manifest resolves to null (no frames published).
    render(<Globe />)
    // Assert
    await waitFor(() => expect(modeButton('FORECAST').disabled).toBe(true))
    expect(screen.getByText('No usable GEFS frames')).toBeTruthy()
  })

  it('enables FORECAST once a forward frame is published and fresh', async () => {
    // Arrange
    fetchTimelineManifest.mockResolvedValue(FORECAST_MANIFEST)
    // Act
    render(<Globe />)
    // Assert
    await waitFor(() => expect(modeButton('FORECAST').disabled).toBe(false))
  })

  it('marks LIVE as the active lens on first paint', async () => {
    // Arrange / Act
    render(<Globe />)
    // Assert
    await waitFor(() => expect(modeButton('LIVE').getAttribute('aria-pressed')).toBe('true'))
  })
})

describe('Globe — G0 stage layout', () => {
  it('renders CompareTray inside the canvas panel, not as a page-level bar', () => {
    // Arrange / Act
    const { container } = render(<Globe />)
    // Assert
    const stageMain = container.querySelector('.globe-stage-main')
    expect(stageMain?.querySelector('.compare-tray')).toBeTruthy()
    expect(container.querySelector('.globe-stage > .compare-tray')).toBeNull()
  })

  it('does not render CompareTray over the Map or Table views', () => {
    // Arrange
    const { container } = render(<Globe />)
    // Act / Assert — the tray is a globe-scene overlay; on Map and Table it
    // would sit on top of clickable dots / rows without blocking their focus.
    fireEvent.click(viewButton('MAP'))
    expect(container.querySelector('.compare-tray')).toBeNull()
    fireEvent.click(viewButton('TABLE'))
    expect(container.querySelector('.compare-tray')).toBeNull()
  })

  it('renders the mode selector, HUD strip and view switch in one row, not three stacked bars', async () => {
    // Arrange / Act — P1: the mode rail, GlobeObsHud and ViewModeSwitch used
    // to be three stacked full-width bars (the old .globe-mode-row +
    // .gobs-hud + .globe-evidence-row's docked switch). They're siblings in
    // one .globe-hud-row now — same components, same store wiring, same
    // 1-5 keyboard path, just laid out side by side.
    const { container } = render(<Globe />)
    await waitFor(() => expect(modeButton('LIVE')).toBeTruthy())
    // Assert
    const hudRow = container.querySelector('.globe-hud-row')
    expect(hudRow?.querySelector('.atmos-mode-rail--horizontal')).toBeTruthy()
    expect(hudRow?.querySelector('[aria-label="Atmospheric data mode"]')).toBeTruthy()
    expect(hudRow?.querySelector('.gobs-hud')).toBeTruthy()
    expect(hudRow?.querySelector('.view-mode-switch')).toBeTruthy()
    expect(container.querySelector('.globe-stage-left .atmos-mode-rail')).toBeNull()
    expect(container.querySelector('.globe-mode-row')).toBeNull()
    expect(container.querySelector('.globe-evidence-row')).toBeNull()
  })
})

describe('Globe — evidence card slide-in', () => {
  // P1 (01-ux-audit.md §2 #2, §6): the evidence card used to run as a
  // permanent strip under the HUD. It now mounts only once there's a
  // focused reading to show evidence for, sliding in over the stage's right
  // edge instead of reflowing the layout.
  it('stays hidden by default, with nothing selected', () => {
    // Arrange / Act
    const { container } = render(<Globe />)
    // Assert
    expect(container.querySelector('.globe-evidence-panel')).toBeNull()
    expect(screen.queryByLabelText('Data evidence and uncertainty')).toBeNull()
  })

  it('slides in once a station is selected, and the close button clears the selection', () => {
    // Arrange — same SelectedStation shape Table/Map/3D all write.
    useGlobeStore.setState({
      selectedStation: { lat: 37.5, lon: 127.0, pm25: 18.4, name: 'Seoul', station_uid: 'grid-1' },
    })
    // Act
    const { container } = render(<Globe />)
    // Assert
    expect(container.querySelector('.globe-evidence-panel')).toBeTruthy()
    expect(screen.getByLabelText('Data evidence and uncertainty')).toBeTruthy()
    // Act — close
    fireEvent.click(screen.getByRole('button', { name: /close evidence card/i }))
    // Assert
    expect(useGlobeStore.getState().selectedStation).toBeNull()
    expect(container.querySelector('.globe-evidence-panel')).toBeNull()
  })

  it('closes on Escape while the panel has focus', () => {
    // Arrange
    useGlobeStore.setState({
      selectedStation: { lat: 37.5, lon: 127.0, pm25: 18.4, name: 'Seoul', station_uid: 'grid-1' },
    })
    const { container } = render(<Globe />)
    const panel = container.querySelector('.globe-evidence-panel') as HTMLElement
    // Act
    fireEvent.keyDown(panel, { key: 'Escape' })
    // Assert
    expect(useGlobeStore.getState().selectedStation).toBeNull()
  })
})

describe('Globe — DQSS grade provenance gate', () => {
  // Globe.tsx's evidence-card wiring (`dqssGrade={focus?.dqssProvenance ===
  // 'measured' || focus?.dqssProvenance === 'partial' ? dqssScoreToGrade(...) :
  // null}`) has no direct test of its own — only AtmosphericEvidenceCard's
  // *rendering* of a given grade is covered. These pin the gate itself: a
  // station with a real score still shows no grade when its provenance isn't
  // 'measured'/'partial' (e.g. 'seed' — a demo value), and does show one,
  // with the PARTIAL tag, when it is.
  it('shows no grade ("DQSS —") when the station has a score but an unrecognized/demo provenance (seed)', () => {
    // Arrange
    useGlobeStore.setState({
      selectedStation: {
        lat: 37.5, lon: 127.0, pm25: 18.4, name: 'Seoul', station_uid: 'grid-1',
        dqss: 82, dqss_provenance: 'seed',
      },
    })
    // Act
    const { container } = render(<Globe />)
    // Assert
    const qualityLine = container.querySelector('.atmos-quality-line')
    expect(qualityLine?.querySelector('b')).toBeNull()
    expect(qualityLine?.textContent).toContain('DQSS —')
  })

  it('shows the grade with a PARTIAL tag when the station provenance is partial', () => {
    // Arrange
    useGlobeStore.setState({
      selectedStation: {
        lat: 37.5, lon: 127.0, pm25: 18.4, name: 'Seoul', station_uid: 'grid-1',
        dqss: 82, dqss_provenance: 'partial',
      },
    })
    // Act
    const { container } = render(<Globe />)
    // Assert — dqssScoreToGrade(82) === 'A' (globeOntology.ts cutoffs).
    const qualityLine = container.querySelector('.atmos-quality-line')
    expect(qualityLine?.querySelector('b')?.textContent).toBe('A')
    expect(qualityLine?.querySelector('em[title]')?.textContent).toBe('PARTIAL')
  })
})

describe('Globe — shared cursor', () => {
  it('surfaces the selected station in the HUD once a mark is picked, so all three views read the same cursor', () => {
    // Arrange — same SelectedStation shape Table/Map/3D all write via
    // setSelectedStation (globeStore.ts) — the HUD readout is a pure
    // function of that one field, not view-specific state.
    useGlobeStore.setState({
      selectedStation: { lat: 37.5, lon: 127.0, pm25: 18.4, name: 'Seoul', station_uid: 'grid-1' },
    })
    // Act
    const { container } = render(<Globe />)
    // Assert
    const cursor = container.querySelector('.gobs-cursor')
    expect(cursor?.textContent).toContain('CURSOR')
    expect(cursor?.textContent).toContain('37.5°N')
    expect(cursor?.textContent).toContain('127.0°E')
    expect(cursor?.textContent).toContain('Seoul')
  })

  it('omits the cursor readout entirely when nothing is selected — not a permanent "no selection" line', () => {
    // Arrange / Act
    const { container } = render(<Globe />)
    // Assert
    expect(container.querySelector('.gobs-cursor')).toBeNull()
  })
})

function viewButton(label: string): HTMLButtonElement {
  return screen.getByRole('radio', { name: new RegExp(`^${label}`, 'i') }) as HTMLButtonElement
}

describe('Globe — view mode switch', () => {
  it('defaults to the Globe (3D) view when WebGL2 is available', () => {
    // Arrange / Act
    render(<Globe />)
    // Assert
    expect(viewButton('GLOBE').getAttribute('aria-checked')).toBe('true')
    expect(screen.queryByTestId('globe-map-view')).toBeNull()
    expect(screen.queryByTestId('globe-table-view')).toBeNull()
  })

  it('switches to Map when the Map button is clicked, keeping the same page mounted', () => {
    // Arrange
    render(<Globe />)
    // Act
    fireEvent.click(viewButton('MAP'))
    // Assert
    expect(useGlobeStore.getState().globeViewMode).toBe('map')
    expect(screen.getByTestId('globe-map-view')).toBeTruthy()
    expect(viewButton('MAP').getAttribute('aria-checked')).toBe('true')
  })

  it('switches to Table when the Table button is clicked', () => {
    // Arrange
    render(<Globe />)
    // Act
    fireEvent.click(viewButton('TABLE'))
    // Assert
    expect(useGlobeStore.getState().globeViewMode).toBe('table')
    expect(screen.getByTestId('globe-table-view')).toBeTruthy()
  })

  it('auto-routes to Map and disables the Globe button when WebGL2 is unavailable', async () => {
    // Arrange — the stage cannot draw a sphere it has no WebGL context for.
    isWebGLSupportedMock.mockReturnValue(false)
    // Act
    render(<Globe />)
    // Assert
    await waitFor(() => expect(useGlobeStore.getState().globeViewMode).toBe('map'))
    expect(screen.getByTestId('globe-map-view')).toBeTruthy()
    expect(viewButton('GLOBE').disabled).toBe(true)
  })
})

describe('Globe — engine loading gate', () => {
  // 01-ux-audit.md §2 #1: the outer Suspense used to render `fallback={null}`,
  // so a chunk stuck mid-fetch left the stage a literal blank void. These
  // pin the honest-loading skeleton, the 8s patience window's "Open Map
  // view" escape hatch, and that the escape hatch is a click, not a timer.
  beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }) })
  afterEach(() => { vi.useRealTimers() })

  it('shows the loading skeleton immediately, with no escape-hatch CTA yet', () => {
    // Arrange
    engineBehavior = 'suspend'
    // Act
    render(<Globe />)
    // Assert
    expect(screen.getByText('Loading globe engine…')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /open map view/i })).toBeNull()
  })

  it('reveals "Open Map view" once the chunk is still pending past the 8s patience window', async () => {
    // Arrange
    engineBehavior = 'suspend'
    render(<Globe />)
    // Act
    await act(async () => { vi.advanceTimersByTime(8000) })
    // Assert
    expect(screen.getByRole('button', { name: /open map view/i })).toBeTruthy()
    // A stuck chunk is not a hard failure — the deck stays on Globe until asked.
    expect(useGlobeStore.getState().globeViewMode).toBe('globe')
  })

  it('switches to Map (reason: slow-load) only once that CTA is clicked, never automatically', async () => {
    // Arrange
    engineBehavior = 'suspend'
    render(<Globe />)
    await act(async () => { vi.advanceTimersByTime(8000) })
    // Act
    fireEvent.click(screen.getByRole('button', { name: /open map view/i }))
    // Assert
    expect(useGlobeStore.getState().globeViewMode).toBe('map')
  })
})

describe('Globe — engine chunk failure', () => {
  // Item 3 of the same audit finding: a rejected import() throws past
  // `<Suspense>` rather than resolving into its fallback, so only an Error
  // Boundary can turn it into a state the HUD can report honestly instead of
  // an unhandled render crash.
  it('reports UNAVAILABLE with a reason in the HUD and evidence card when the engine chunk fails to load', () => {
    // Arrange
    engineBehavior = 'error'
    // Act
    render(<Globe />)
    // Assert — HUD identity dot + primary readout, and the evidence card's
    // own status pill, both carry the failure instead of a data-freshness one.
    const hud = document.querySelector('.gobs-hud')
    expect(hud?.querySelector('.gobs-live-dot')?.className).toContain('is-unavailable')
    expect(hud?.textContent).toContain('UNAVAILABLE · mock engine chunk failure')
    // Both the HUD strip and the evidence card's own status pill carry the
    // reason — two independent surfaces, hence *All*By rather than a single
    // getByText (which throws on more than one match).
    expect(screen.getAllByText(/UNAVAILABLE · mock engine chunk failure/).length).toBeGreaterThanOrEqual(2)
  })

  it('still offers "Open Map view" so a failed engine is not a dead end', () => {
    // Arrange
    engineBehavior = 'error'
    // Act
    render(<Globe />)
    // Act
    fireEvent.click(screen.getByRole('button', { name: /open map view/i }))
    // Assert
    expect(useGlobeStore.getState().globeViewMode).toBe('map')
  })
})
