/**
 * Pins two independent facts the "green band" bug report could otherwise
 * conflate: the projection math (this file) and the data-coverage sampling
 * (`api/gridSnapshot.test.ts`'s "spreads a no-origin sample..." case). Both
 * had to be checked separately to attribute the bug correctly — the
 * projection turned out to be correct; the sampling was not.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import { useGlobeStore } from '../../../store/globeStore'
import { project } from '../../../lib/globe/equirectProjection'
import type { GlobalGridSnapshot } from '../../../types/data'

describe('GlobeMapView — project()', () => {
  // Expected values are the plain equirectangular formula worked by hand
  // against this module's VIEW_W=720/VIEW_H=360: x=((lon+180)/360)*720,
  // y=((90-lat)/180)*360.
  it.each([
    ['Seoul', 37.5, 127.0, 614, 105],
    ['Sydney', -33.9, 151.2, 662.4, 247.8],
    ['London', 51.5, -0.1, 359.8, 77],
    ['Equator/prime meridian', 0, 0, 360, 180],
  ])('projects %s (%d, %d) to (%d, %d)', (_name, lat, lon, x, y) => {
    // Arrange / Act
    const p = project(lat, lon)
    // Assert
    expect(p.x).toBeCloseTo(x, 1)
    expect(p.y).toBeCloseTo(y, 1)
  })

  it('places the south pole at the bottom edge and the north pole at the top edge', () => {
    // Arrange / Act / Assert — the "band at the bottom" bug report was a
    // sampling issue, not a sign flip here: both poles must map to their own
    // edge with nothing past it.
    expect(project(-90, 0).y).toBeCloseTo(360, 1)
    expect(project(90, 0).y).toBeCloseTo(0, 1)
  })
})

const useGlobeGridSnapshotMock = vi.fn<() => GlobalGridSnapshot | null>()
vi.mock('../../../hooks/useGlobeData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../hooks/useGlobeData')>()
  return { ...actual, useGlobeGridSnapshot: () => useGlobeGridSnapshotMock() }
})
vi.mock('../../../hooks/useCountryData', () => ({ useCountryFeatures: () => null }))

const INITIAL = useGlobeStore.getState()

describe('GlobeMapView — coverage', () => {
  beforeEach(() => {
    useGlobeStore.setState(INITIAL, true)
  })
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('renders one dot per cell without re-truncating the already-sampled feed', async () => {
    // Arrange — a snapshot spanning both hemispheres, the shape
    // `fetchGlobalGridSnapshot`'s fixed no-origin sampling now guarantees.
    useGlobeGridSnapshotMock.mockReturnValue({
      pm25: 10, aqi: 42, lat: -90, lon: 0, source: 'global_grid', updatedAt: '2026-08-28T08:00:00Z',
      nearbyCells: [
        { lat: -80, lon: 0, pm25: 10, aqi: 42, updatedAt: '2026-08-28T08:00:00Z', grade: 'Good' },
        { lat: 0, lon: 0, pm25: 10, aqi: 42, updatedAt: '2026-08-28T08:00:00Z', grade: 'Good' },
        { lat: 80, lon: 0, pm25: 10, aqi: 42, updatedAt: '2026-08-28T08:00:00Z', grade: 'Good' },
      ],
    })
    const GlobeMapView = (await import('./GlobeMapView')).default
    // Act
    const { container } = render(<GlobeMapView />)
    // Assert — 3 in, 3 rendered; no MARKER_LIMIT-style prefix cut.
    const dots = container.querySelectorAll('.gmv-dot')
    expect(dots).toHaveLength(3)
    const ys = Array.from(dots).map((d) => Number(d.getAttribute('cy')))
    expect(Math.min(...ys)).toBeLessThan(60) // northern dot near the top edge
    expect(Math.max(...ys)).toBeGreaterThan(300) // southern dot near the bottom edge
  })

  it('names a beyond-scale cell in aria-label and title without changing its value or position', async () => {
    // Arrange — the real max published on 2026-09-04 (Yakutia fire belt).
    useGlobeGridSnapshotMock.mockReturnValue({
      pm25: 15867.96, aqi: 500, lat: 65, lon: 116, source: 'global_grid', updatedAt: '2026-08-28T08:00:00Z',
      nearbyCells: [
        {
          lat: 65, lon: 116, pm25: 15867.96, aqi: 500, updatedAt: '2026-08-28T08:00:00Z',
          plausibility: { verdict: 'beyond-scale', reason: 'beyond the top of our reporting scale — we cannot verify this reading' },
        },
      ],
    })
    const GlobeMapView = (await import('./GlobeMapView')).default
    // Act
    const { container } = render(<GlobeMapView />)
    const dot = container.querySelector('.gmv-dot') as SVGCircleElement
    // Assert — real number carried through, reason appended rather than replacing it.
    expect(dot.getAttribute('aria-label')).toContain('15868.0')
    expect(dot.getAttribute('aria-label')).toContain('we cannot verify this reading')
    expect(dot.querySelector('title')?.textContent).toContain('15868.0')
    expect(dot.querySelector('title')?.textContent).toContain('we cannot verify this reading')
  })

  it('leaves a normal cell aria-label and title unmarked', async () => {
    // Arrange / Act — plausibility absent, reads as reportable.
    useGlobeGridSnapshotMock.mockReturnValue({
      pm25: 10, aqi: 42, lat: 0, lon: 0, source: 'global_grid', updatedAt: '2026-08-28T08:00:00Z',
      nearbyCells: [{ lat: 0, lon: 0, pm25: 10, aqi: 42, updatedAt: '2026-08-28T08:00:00Z', grade: 'Good' }],
    })
    const GlobeMapView = (await import('./GlobeMapView')).default
    const { container } = render(<GlobeMapView />)
    const dot = container.querySelector('.gmv-dot') as SVGCircleElement
    // Assert
    expect(dot.getAttribute('aria-label')).not.toContain('cannot verify')
    expect(dot.querySelector('title')?.textContent).not.toContain('cannot verify')
  })

  it('falls back to the static globe when the grid feed itself is unavailable', async () => {
    // Arrange
    useGlobeGridSnapshotMock.mockReturnValue(null)
    const GlobeMapView = (await import('./GlobeMapView')).default
    // Act
    render(<GlobeMapView />)
    // Assert
    expect(screen.getByRole('alert')).toBeTruthy()
  })
})
