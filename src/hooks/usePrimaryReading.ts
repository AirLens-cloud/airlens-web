/**
 * usePrimaryReading — wires `useTodayGrid`/`useTodayCams` (both keyed to a
 * resolved location) into `resolvePrimaryReading` (`lib/reading/`, pure and
 * React-free). `Today.tsx`, `Home.tsx`, and `AqiCapsule.tsx` all call this
 * (W1b commit ②) — the one place any surface picks a headline PM2.5 number,
 * so none of them can show a different reading for the same place and moment.
 */
import { useMemo } from 'react'
import { useTodayGrid } from './useTodayGrid'
import { useTodayCams } from './useTodayCams'
import { ageAt, resolvePrimaryReading, staleAt } from '../lib/reading/resolvePrimaryReading'
import type { TodayGridState } from './useTodayGrid'
import type { TodayCamsState } from './useTodayCams'
import type { PrimaryReading } from '../lib/reading/resolvePrimaryReading'
import type { ResolvedLocation } from '../lib/location/resolveLocation'

export interface UsePrimaryReadingResult {
  reading: PrimaryReading
  /** GRID state — Today's Why/Evidence panels render this directly,
   * alongside (not instead of) the resolved `reading`. Its `stale` is
   * re-judged at `nowMs` exactly as `reading.stale` is (`staleAt`), so a
   * reading that crosses 48h in an open tab flips on every panel at once. */
  grid: TodayGridState
  /** CAMS state — same reasoning as `grid` above; an unknown (`null`)
   * staleness stays unknown. */
  cams: TodayCamsState
}

/** `state` with its fetch-time `stale` flag re-judged at `nowMs` — the same
 * object back when the verdict hasn't changed, so the panels only re-render
 * when a flag actually flips. */
function withStaleAt<T extends { status: string; stale?: boolean | null; updatedAt?: string }>(state: T, nowMs: number): T {
  if (state.status !== 'ready' || typeof state.stale !== 'boolean' || state.updatedAt === undefined) return state
  const stale = staleAt(state.stale, ageAt(state.updatedAt, nowMs))
  return stale === state.stale ? state : { ...state, stale }
}

export function usePrimaryReading(location: ResolvedLocation | null, nowMs: number): UsePrimaryReadingResult {
  const rawGrid = useTodayGrid(location?.lat ?? null, location?.lon ?? null)
  const rawCams = useTodayCams(location?.lat ?? null, location?.lon ?? null)
  const grid = useMemo(() => withStaleAt(rawGrid, nowMs), [rawGrid, nowMs])
  const cams = useMemo(() => withStaleAt(rawCams, nowMs), [rawCams, nowMs])
  const reading = useMemo(
    () => resolvePrimaryReading({ grid, cams, location, nowMs }),
    [grid, cams, location, nowMs],
  )
  return { reading, grid, cams }
}
