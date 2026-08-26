// AAA smoke test for the pre-data-resolved path, same shape as
// `Ch3AirshedScene.test.tsx`: jsdom has no global `fetch`, so
// `useDawnBriefingData`'s fetch calls reject asynchronously — this test
// asserts the *synchronous* pre-fetch render (the loading placeholder), never
// a fabricated field report.
//
// The Wave 4 materialize-gate case below mocks `useDawnBriefingData` directly
// (rather than waiting on real fetches) to reach the `status: 'ready'`
// branch, where `<DawnReport>` is now wrapped in `<Materialize show={cardsP
// > 0.05} ...>` — gated on scroll progress past the wipe, not just on data
// being ready.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import type { DawnBriefingData } from './types'
import Ch4BriefingRoom from './Ch4BriefingRoom'

vi.mock('./useDawnBriefingData', () => ({
  useDawnBriefingData: vi.fn(),
}))

import { useDawnBriefingData } from './useDawnBriefingData'

const READY_DATA: DawnBriefingData = {
  gridCells: 1000,
  peak: { ug: 42, label: '37.5°N, 127.0°E' },
  firesTotal: 3,
  forecast: { city: 'Seoul', p50: 40, p10: 30, p90: 55, dqss: 'unknown' },
  pm25: {
    meta: {
      nLat: 20,
      nLon: 50,
      latMin: -90,
      lonMin: -180,
      dLat: 9,
      dLon: 7.2,
      cap: 200,
      encoding: 'sqrt',
      timestamp: Date.now(),
    },
    data: new Uint8Array(1000),
    decodeByte: () => 0,
    sampleAt: () => 0,
  },
  fires: { total: 3, kept: 3, refTime: null, rows: [] },
  tft: { cities: [], generated_at: new Date().toISOString(), model_version: 'test' },
}

beforeEach(() => {
  // jsdom in this repo's vitest config has no `matchMedia` (see Ch2's own
  // smoke test) — this component calls `useReducedMotion()` unconditionally
  // before its loading/error branches, so the stub is needed here too.
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.mocked(useDawnBriefingData).mockReset()
})

describe('Ch4BriefingRoom — before data resolves', () => {
  it('renders the loading placeholder instead of a fabricated field report', () => {
    // Arrange
    vi.mocked(useDawnBriefingData).mockReturnValue({ status: 'loading', data: null, error: null })
    // Act
    render(<Ch4BriefingRoom progress={0} />)
    // Assert
    const loading = screen.getByText(/reading the overnight grid/i)
    expect(loading.textContent).toMatch(/reading the overnight grid/i)
  })
})

describe('Ch4BriefingRoom — materialize gate (Wave 4 P1)', () => {
  beforeEach(() => {
    vi.mocked(useDawnBriefingData).mockReturnValue({ status: 'ready', data: READY_DATA, error: null })
  })

  it('does not mount the field report before the wipe has progressed far enough', () => {
    // Arrange / Act — progress=0.35 is WIPE_END exactly, so cardsP is still 0.
    render(<Ch4BriefingRoom progress={0.35} />)
    // Assert — Materialize renders nothing while `show` is false.
    expect(screen.queryByText(/grid cells scanned/i)).toBeNull()
  })

  it('mounts the field report once scroll progress passes the wipe', () => {
    // Arrange / Act — progress=1 puts cardsP well past the 0.05 gate.
    render(<Ch4BriefingRoom progress={1} />)
    // Assert
    expect(screen.getByText(/grid cells scanned/i)).not.toBeNull()
  })
})
