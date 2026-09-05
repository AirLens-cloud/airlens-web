/**
 * G8 trust strip: GROUND STATIONS / DATA QUALITY / UPDATED. `lookupDQSSScore`
 * runs for real (not mocked) so the nearest-station distance logic is
 * actually exercised — only `useDQSSData` is mocked, matching
 * `GlobeTableView.test.tsx`'s pattern for this module.
 *
 * `@testing-library/jest-dom` isn't set up in this repo (see
 * `Ch1AtmosScene.test.tsx`) — assertions use `getByText`/`getByTitle`
 * throwing on no-match, plus `.textContent` checks, instead of
 * `toBeInTheDocument`/`toHaveTextContent`.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import type { DQSSCache, DQSSStation } from '../../types/globe'

const useDQSSDataMock = vi.fn<() => DQSSCache | null>()
vi.mock('../../hooks/useGlobeData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../hooks/useGlobeData')>()
  return { ...actual, useDQSSData: () => useDQSSDataMock() }
})

import HomeTrustStrip from './HomeTrustStrip'

afterEach(cleanup)

const HERO_COORDS = { lat: 37.5, lon: 127.0 }
const NOW_MS = new Date('2026-09-05T12:00:00Z').getTime()
const UPDATED_AT = new Date(NOW_MS - 42 * 60 * 1000).toISOString() // 42m ago

function station(overrides: Partial<DQSSStation> = {}): DQSSStation {
  return { station_id: 's1', lat: HERO_COORDS.lat, lon: HERO_COORDS.lon, final_score: 82, ...overrides }
}

function cache(overrides: Partial<DQSSCache> = {}): DQSSCache {
  const stations = overrides.stations ?? [station()]
  return {
    map: new Map(),
    stations,
    provenance: 'measured',
    partialDetail: null,
    stationCounts: { graded: stations.length, total: null, declared: false },
    ...overrides,
  }
}

describe('HomeTrustStrip', () => {
  it('renders all three cells with labels', () => {
    useDQSSDataMock.mockReturnValue(cache())
    render(<HomeTrustStrip coords={HERO_COORDS} updatedAt={UPDATED_AT} nowMs={NOW_MS} />)
    expect(screen.getByText('Ground stations')).toBeTruthy()
    expect(screen.getByText('Data quality')).toBeTruthy()
    expect(screen.getByText('Updated')).toBeTruthy()
  })

  it('marks DATA QUALITY as the nearest station\'s grade, not an aggregate (design-review Major #1)', () => {
    useDQSSDataMock.mockReturnValue(cache())
    render(<HomeTrustStrip coords={HERO_COORDS} updatedAt={UPDATED_AT} nowMs={NOW_MS} />)
    expect(screen.getByText('Nearest ground station')).toBeTruthy()
  })

  it('gives every value an aria-label matching its title, so a "—" cell is not silent to a screen reader (Minor #1)', () => {
    useDQSSDataMock.mockReturnValue(cache({ provenance: 'seed' }))
    render(<HomeTrustStrip coords={HERO_COORDS} updatedAt={UPDATED_AT} nowMs={NOW_MS} />)
    const link = screen.getByTitle(/withheld/i)
    expect(link.getAttribute('aria-label')).toBe(link.getAttribute('title'))
  })

  it('shows the declared graded count when meta declares it', () => {
    useDQSSDataMock.mockReturnValue(
      cache({ stationCounts: { graded: 493, total: 512, declared: true } }),
    )
    render(<HomeTrustStrip coords={HERO_COORDS} updatedAt={UPDATED_AT} nowMs={NOW_MS} />)
    expect(screen.getByText('493 graded')).toBeTruthy()
  })

  it('falls back to stations.length when meta does not declare graded_stations', () => {
    const stations = [station({ station_id: 'a' }), station({ station_id: 'b', lat: 10, lon: 10 })]
    useDQSSDataMock.mockReturnValue(
      cache({ stations, stationCounts: { graded: stations.length, total: null, declared: false } }),
    )
    render(<HomeTrustStrip coords={HERO_COORDS} updatedAt={UPDATED_AT} nowMs={NOW_MS} />)
    expect(screen.getByText('2 graded')).toBeTruthy()
  })

  it('renders a grade with a PARTIAL tag when provenance is partial', () => {
    useDQSSDataMock.mockReturnValue(
      cache({
        provenance: 'partial',
        partialDetail: { measured: 3, total: 5, measuredWeightMax: 62 },
      }),
    )
    render(<HomeTrustStrip coords={HERO_COORDS} updatedAt={UPDATED_AT} nowMs={NOW_MS} />)
    expect(screen.getByText('PARTIAL')).toBeTruthy()
    // dqssScoreToGrade(82) === 'A' (globeOntology.ts cutoffs)
    expect(screen.getByText('A')).toBeTruthy()
    expect(screen.getByText(/3\/5 components measured/)).toBeTruthy()
  })

  it('renders a grade with no PARTIAL tag when provenance is measured', () => {
    useDQSSDataMock.mockReturnValue(cache({ provenance: 'measured' }))
    render(<HomeTrustStrip coords={HERO_COORDS} updatedAt={UPDATED_AT} nowMs={NOW_MS} />)
    expect(screen.getByText('A')).toBeTruthy()
    expect(screen.queryByText('PARTIAL')).toBeNull()
  })

  it('degrades DATA QUALITY to "—" with a reason when provenance is unrecognized (e.g. seed/withheld)', () => {
    useDQSSDataMock.mockReturnValue(cache({ provenance: 'seed' }))
    render(<HomeTrustStrip coords={HERO_COORDS} updatedAt={UPDATED_AT} nowMs={NOW_MS} />)
    const link = screen.getByTitle(/withheld/i)
    expect(link.textContent).toBe('—')
  })

  it('degrades DATA QUALITY to "—" with a reason when no station is within range', () => {
    useDQSSDataMock.mockReturnValue(cache({ stations: [station({ lat: 60, lon: 60 })] }))
    render(<HomeTrustStrip coords={HERO_COORDS} updatedAt={UPDATED_AT} nowMs={NOW_MS} />)
    const link = screen.getByTitle(/no ground station within range/i)
    expect(link.textContent).toBe('—')
  })

  it('distinguishes a not-yet-published feed from a range miss (design-review Minor #2)', () => {
    // stations:[] means the DQSS feed hasn't published anything yet — a
    // different honest reason than "this location has no nearby station",
    // which implies the feed exists but doesn't cover this spot.
    useDQSSDataMock.mockReturnValue(
      cache({ stations: [], stationCounts: { graded: 0, total: null, declared: false } }),
    )
    render(<HomeTrustStrip coords={HERO_COORDS} updatedAt={UPDATED_AT} nowMs={NOW_MS} />)
    const link = screen.getByTitle(/not yet published/i)
    expect(link.textContent).toBe('—')
    expect(screen.queryByTitle(/no ground station within range/i)).toBeNull()
  })

  it('never hides a missing cell — GROUND STATIONS renders "—" with a title reason when the cache has no data', () => {
    useDQSSDataMock.mockReturnValue(
      cache({ stations: [], stationCounts: { graded: 0, total: null, declared: false } }),
    )
    render(<HomeTrustStrip coords={HERO_COORDS} updatedAt={UPDATED_AT} nowMs={NOW_MS} />)
    const link = screen.getByTitle(/no graded ground stations/i)
    expect(link.textContent).toBe('—')
  })

  it('shows the age since the hero reading was generated for UPDATED', () => {
    useDQSSDataMock.mockReturnValue(cache())
    render(<HomeTrustStrip coords={HERO_COORDS} updatedAt={UPDATED_AT} nowMs={NOW_MS} />)
    expect(screen.getByText('42m ago')).toBeTruthy()
  })

  it('shows a skeleton (not "—") for the async cells while the DQSS cache has not resolved yet', () => {
    useDQSSDataMock.mockReturnValue(null)
    render(<HomeTrustStrip coords={HERO_COORDS} updatedAt={UPDATED_AT} nowMs={NOW_MS} />)
    expect(screen.queryByText('—')).toBeNull()
    // Updated cell doesn't depend on the DQSS fetch, so it still renders.
    expect(screen.getByText('42m ago')).toBeTruthy()
  })
})
