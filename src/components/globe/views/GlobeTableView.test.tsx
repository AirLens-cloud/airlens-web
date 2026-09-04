/**
 * Table's contract: exact-value reading of the same grid payload the 3D
 * scene renders, with row identity (`grid-${i+1}`) matching
 * `api/globeMarkers.ts` exactly — so a row click and a 3D mark click select
 * the same `SelectedStation`, and Evidence Rail cannot tell which view picked
 * the mark. Also pins the Glass-box gate: the grid artifact carries no
 * p10/p90 band, and the column must say so rather than inventing one.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, cleanup, screen, fireEvent } from '@testing-library/react'
import { useGlobeStore } from '../../../store/globeStore'
import type { GlobalGridSnapshot } from '../../../types/data'

const useGlobeGridSnapshotMock = vi.fn<() => GlobalGridSnapshot | null>()
vi.mock('../../../hooks/useGlobeData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../hooks/useGlobeData')>()
  return { ...actual, useGlobeGridSnapshot: () => useGlobeGridSnapshotMock() }
})

// No country polygons loaded in this unit test — nearest-place resolution is
// covered by `lib/globe/nearestPlace.ts`'s own test surface, not here.
vi.mock('../../../hooks/useCountryData', () => ({ useCountryFeatures: () => null }))

import GlobeTableView from './GlobeTableView'

const INITIAL = useGlobeStore.getState()

const SNAPSHOT: GlobalGridSnapshot = {
  pm25: 42.3,
  aqi: 118,
  lat: 37.5,
  lon: 127.0,
  source: 'global_grid',
  updatedAt: '2026-08-28T08:00:00Z',
  nearbyCells: [
    { lat: 37.5, lon: 127.0, pm25: 42.3, aqi: 118, updatedAt: '2026-08-28T08:00:00Z', grade: 'Unhealthy', dqss: 78 },
    { lat: 39.9, lon: 116.4, pm25: 68.1, aqi: 158, updatedAt: '2026-08-28T08:00:00Z', grade: 'Unhealthy' },
  ],
}

beforeEach(() => {
  useGlobeStore.setState(INITIAL, true)
  useGlobeGridSnapshotMock.mockReturnValue(SNAPSHOT)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('GlobeTableView', () => {
  it('renders one row per published grid cell, sorted by PM2.5 descending', () => {
    // Arrange / Act
    render(<GlobeTableView />)
    const rows = screen.getAllByRole('row').slice(1) // drop the header row
    // Assert — Beijing (68.1) outranks Seoul (42.3) despite arriving second in the feed.
    expect(rows).toHaveLength(2)
    expect(rows[0].textContent).toContain('68.1')
    expect(rows[1].textContent).toContain('42.3')
  })

  it('never fabricates a p10-p90 band the grid artifact never published', () => {
    // Arrange / Act
    render(<GlobeTableView />)
    // Assert — every row says so, not just the one without a value.
    expect(screen.getAllByText('not published').length).toBeGreaterThanOrEqual(2)
  })

  it('labels a grid cell as analysis — what the cell is, not what the phenomenon can be', () => {
    // Arrange / Act — guards both directions of the pre-2026-09-04 bug.
    // Under-claim: the column hardcoded "interpolated" for cells that are a
    // GEFS-Aerosols f000/anl analysis field, which is not interpolation.
    // Over-claim: printing PHENOMENA.pm25.provenance here would read
    // "analysis · observation · forecast" beside a single grid cell that never
    // touched a ground station or a forecast run.
    render(<GlobeTableView />)
    // Assert
    expect(screen.getAllByText('analysis').length).toBe(2)
    expect(screen.queryByText('interpolated')).toBeNull()
    expect(screen.queryByText('analysis · observation · forecast')).toBeNull()
  })

  it('clicking a row writes the same SelectedStation shape a 3D mark click would', () => {
    // Arrange
    render(<GlobeTableView />)
    const rows = screen.getAllByRole('row').slice(1)
    // Act — first row is Beijing (68.1, the higher-ranked cell).
    fireEvent.click(rows[0])
    // Assert
    const selected = useGlobeStore.getState().selectedStation
    expect(selected?.pm25).toBe(68.1)
    expect(selected?.station_uid).toBe('grid-2') // second cell in the feed's own order
    expect(selected?.source).toBe('global_grid')
  })

  it('reflects an externally-selected mark (3D scene) by highlighting the matching row', () => {
    // Arrange — as if the 3D scene's StationLabels click handler had run.
    useGlobeStore.setState({
      selectedStation: { lat: 37.5, lon: 127.0, pm25: 42.3, source: 'global_grid', station_uid: 'grid-1' },
    })
    // Act
    render(<GlobeTableView />)
    // Assert
    const rows = screen.getAllByRole('row').slice(1)
    const seoulRow = rows.find((r) => r.textContent?.includes('42.3'))
    expect(seoulRow?.getAttribute('aria-selected')).toBe('true')
  })

  it('keeps a beyond-scale cell in its ranked place and marks it, without touching the value', () => {
    // Arrange — the real max published on 2026-09-04 (Yakutia fire belt),
    // still ranked first by PM2.5 descending against the two normal cells.
    useGlobeGridSnapshotMock.mockReturnValue({
      ...SNAPSHOT,
      nearbyCells: [
        ...SNAPSHOT.nearbyCells,
        { lat: 65, lon: 116, pm25: 15867.96, aqi: 500, updatedAt: '2026-08-28T08:00:00Z', plausibility: { verdict: 'beyond-scale', reason: 'beyond the top of our reporting scale — we cannot verify this reading' } },
      ],
    })
    // Act
    render(<GlobeTableView />)
    const rows = screen.getAllByRole('row').slice(1)
    // Assert — first row (highest PM2.5) is the unverified cell, real number intact.
    expect(rows[0].textContent).toContain('15868.0')
    expect(rows[0].textContent).toContain('BEYOND SCALE')
    expect(screen.getByText(/outside the reportable scale/i)).toBeTruthy()
  })

  it('never flags a normal cell as beyond scale', () => {
    // Arrange / Act — SNAPSHOT's two cells (42.3, 68.1) carry no plausibility field.
    render(<GlobeTableView />)
    // Assert
    expect(screen.queryByText('BEYOND SCALE')).toBeNull()
    expect(screen.queryByText(/outside the reportable scale/i)).toBeNull()
  })

  it('renders an honest-empty state instead of a table when the grid snapshot is unavailable', () => {
    // Arrange
    useGlobeGridSnapshotMock.mockReturnValue(null)
    // Act
    render(<GlobeTableView />)
    // Assert
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.getByText(/unavailable/i)).toBeTruthy()
  })
})
