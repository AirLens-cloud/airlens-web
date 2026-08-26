/**
 * The deck's two honesty gates: a lens whose layer bundle this repo cannot
 * draw, and a lens whose data has not resolved, must both be visibly disabled
 * rather than silently doing nothing when clicked.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react'
import { useGlobeStore } from '../store/globeStore'
import type { TimelineData } from '../api/timeline'

const fetchTimelineManifest = vi.fn<() => Promise<TimelineData | null>>()

vi.mock('../api/timeline', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/timeline')>()
  return { ...actual, fetchTimelineManifest: () => fetchTimelineManifest() }
})

// The engine and the 2D fallback are lazy chunks with their own coverage; the
// stage renders `null` for both under Suspense here, which is what we want —
// these tests are about the chrome's gating decisions.
vi.mock('../components/globe/three/Globe3DScene', () => ({ default: () => null, orbitControlsRef: { current: null } }))
vi.mock('../components/globe/GlobeFallback', () => ({ default: () => <div data-testid="globe-fallback" /> }))

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

function modeButton(label: string): HTMLButtonElement {
  return screen.getByText(label).closest('button') as HTMLButtonElement
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
