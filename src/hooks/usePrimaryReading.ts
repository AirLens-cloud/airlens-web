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
import { resolvePrimaryReading } from '../lib/reading/resolvePrimaryReading'
import type { TodayGridState } from './useTodayGrid'
import type { TodayCamsState } from './useTodayCams'
import type { PrimaryReading } from '../lib/reading/resolvePrimaryReading'
import type { ResolvedLocation } from '../lib/location/resolveLocation'

export interface UsePrimaryReadingResult {
  reading: PrimaryReading
  /** Raw GRID state — Today's Why/Evidence panels render this directly,
   * alongside (not instead of) the resolved `reading`. */
  grid: TodayGridState
  /** Raw CAMS state — same reasoning as `grid` above. */
  cams: TodayCamsState
}

export function usePrimaryReading(location: ResolvedLocation | null, nowMs: number): UsePrimaryReadingResult {
  const grid = useTodayGrid(location?.lat ?? null, location?.lon ?? null)
  const cams = useTodayCams(location?.lat ?? null, location?.lon ?? null)
  const reading = useMemo(
    () => resolvePrimaryReading({ grid, cams, location, nowMs }),
    [grid, cams, location, nowMs],
  )
  return { reading, grid, cams }
}
