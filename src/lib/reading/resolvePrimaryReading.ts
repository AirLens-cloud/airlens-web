/**
 * resolvePrimaryReading — the one place `/today` (and, in a later commit,
 * Home/the floating capsule) picks a single headline PM2.5 reading out of
 * the two sources Today already fetches: GRID (`useTodayGrid`, a GEFS
 * analysis cell nearest the viewer's coordinate) and CAMS (`useTodayCams`, a
 * forecast resolved to the nearest feed city). Before this resolver existed,
 * `Today.tsx` computed this inline and Home/the capsule computed their own
 * version independently (`components/fluid/capsule/useCapsuleData.ts`) — the
 * reason one screen could show three different PM2.5 numbers for the same
 * moment. Pure and React-free by design, same reasoning as
 * `lib/location/resolveLocation.ts`: easy to unit test without mounting a
 * hook, and the eventual Home/capsule adoption reuses this function, not a
 * hook-shaped copy of it.
 *
 * Source preference: GRID wins when it resolved AND the cell is
 * `isReportable` (`lib/config/gridPlausibility.ts` — the live artifact ships
 * cells in the thousands of µg/m³ over boreal fire plumes; an unverifiable
 * cell must not decide the headline). CAMS is the fallback.
 */
import { tierFromPm25 } from './tier'
import { isReportable } from '../config/gridPlausibility'
import { computeSourceAgreement } from '../today/sourceAgreement'
import { GRID_REFRESH_MS, CAMS_REFRESH_MS } from '../config/readingCadence'
import type { TodayGridState } from '../../hooks/useTodayGrid'
import type { TodayCamsState } from '../../hooks/useTodayCams'
import type { ResolvedLocation } from '../location/resolveLocation'
import type { AqiTier } from '../../components/wireframe/AqiDot'
import type { SourceAgreement } from '../today/sourceAgreement'
import type { TrustLineDqss, TrustLineDqssReady } from '../../components/wireframe/TrustLine'

export type ReadingSource = 'analysis' | 'forecast'

export interface PrimaryReadingInput {
  grid: TodayGridState
  cams: TodayCamsState
  location: ResolvedLocation | null
  nowMs: number
}

/** TrustLine's own `TrustLineUncertainty`/`TrustLineUncertaintyReady` carry
 * optional `reason`/`unit` (existing call sites don't all have one) — this
 * resolver always has both, so these two are narrower on purpose. A value
 * shaped like this is still assignable straight into `<TrustLine
 * uncertainty={...} />` (required satisfies optional). */
export interface ReadingUncertaintyWithheld {
  available: false
  reason: string
}

export interface ReadingUncertaintyReady {
  available: true
  p10: number
  p90: number
  unit: string
}

export interface PrimaryReadingSecondary {
  cityName: string
  countryCode: string
  distanceKm: number
  pm25: number
  tier: AqiTier
  stale: boolean | null
}

export interface PrimaryReadingReady {
  status: 'ready'
  source: ReadingSource
  pm25: number
  tier: AqiTier
  stale: boolean
  place: { label: string; countryCode: string | null; distanceKm: number | null }
  validTimeIso: string | null
  validTimeMs: number | null
  /** Always a real number for a ready reading — both branches below compute
   * it unconditionally from their own source's `updatedAt`, unlike
   * `validTimeIso`/`validTimeMs` (which can be null on the forecast branch
   * when CAMS carries no first hourly point). Kept non-nullable so the
   * capsule's refresh countdown (`refreshMs - ageMs`, W1b commit ②) and the
   * "Updated … ago" lines need no null-check at every call site. Staleness is
   * `stale` below, never `ageMs > refreshMs`; `ready?.ageMs ?? null`
   * at the existing call site (`Today.tsx`) still narrows to TrustLine's own
   * `number | null` prop just fine. */
  ageMs: number
  natureLabel: '[ANALYSIS]' | '[FORECAST]'
  /** CAMS city-forecast line under an analysis primary; null when the
   * primary IS the forecast or CAMS isn't ready. */
  secondary: PrimaryReadingSecondary | null
  agreement: SourceAgreement | null
  agreeCount: number
  resolvedCount: number
  hudStatus: 'ready' | 'stale'
  dqss: TrustLineDqss | TrustLineDqssReady
  uncertainty: ReadingUncertaintyWithheld | ReadingUncertaintyReady
  /** How often the source artifact backing this reading is republished
   * upstream — a label, never a staleness judgment (`lib/config/readingCadence.ts`). */
  refreshMs: number
  /** When the source artifact itself was generated/republished — GRID's
   * `updatedAt` for an analysis primary, CAMS's `updatedAt` for a forecast
   * primary. Distinct from `validTimeIso` (a forecast's target hour, not its
   * publish time) — Home's trust strip and the floating capsule's refresh
   * countdown both need this "when was this published" timestamp, which
   * `validTimeIso` only happens to equal for the analysis branch. */
  updatedAtIso: string
}

export type PrimaryReading = { status: 'loading' } | { status: 'unavailable' } | PrimaryReadingReady

export function resolvePrimaryReading(input: PrimaryReadingInput): PrimaryReading {
  const { grid, cams, location, nowMs } = input

  if (location === null) return { status: 'loading' }
  // Flicker fix: hold the whole reading back while GRID is still loading,
  // even when CAMS has already resolved — otherwise the headline shows
  // CAMS's number first and then jumps to GRID's the moment it lands (e.g.
  // 61 -> 22), which reads as the app changing its mind rather than a
  // second, more precise source arriving.
  if (grid.status === 'loading') return { status: 'loading' }

  const usableGrid = grid.status === 'ready' && isReportable(grid.plausibility) ? grid : null
  const gridPm25 = usableGrid?.pm25 ?? null
  const camsPm25 = cams.status === 'ready' ? cams.current : null
  // Independent of which source ends up primary — a non-null agreement only
  // exists when both actually resolved (`computeSourceAgreement` is null if
  // either input is null), which, given the branches below, only ever
  // happens together with `source: 'analysis'`.
  const agreement = computeSourceAgreement(gridPm25, camsPm25)

  if (usableGrid) {
    const tier = tierFromPm25(usableGrid.pm25)
    // The grid backs the headline, so it counts as one resolved, agreeing source.
    let agreeCount = 1
    let resolvedCount = 1
    if (cams.status === 'ready') {
      resolvedCount += 1
      if (cams.tier === tier) agreeCount += 1
    }

    const secondary: PrimaryReadingSecondary | null =
      cams.status === 'ready'
        ? {
            cityName: cams.cityName,
            countryCode: cams.countryCode,
            distanceKm: cams.distanceKm,
            pm25: cams.current,
            tier: cams.tier,
            stale: cams.stale,
          }
        : null

    return {
      status: 'ready',
      source: 'analysis',
      pm25: usableGrid.pm25,
      tier,
      stale: usableGrid.stale,
      // countryCode is null here — the location label already carries it
      // (e.g. "Busan, KR"). Appending CAMS's own country code on top of that
      // label (the pre-fix behaviour) rendered "Busan, KR, KR".
      place: { label: location.label, countryCode: null, distanceKm: usableGrid.distanceKm },
      validTimeIso: usableGrid.updatedAt,
      validTimeMs: new Date(usableGrid.updatedAt).getTime(),
      ageMs: nowMs - new Date(usableGrid.updatedAt).getTime(),
      natureLabel: '[ANALYSIS]',
      secondary,
      agreement,
      agreeCount,
      resolvedCount,
      hudStatus: usableGrid.stale ? 'stale' : 'ready',
      dqss:
        usableGrid.dqss !== undefined
          ? { available: true, value: usableGrid.dqss }
          : { available: false, reason: 'not measured for this grid cell' },
      // GRID never publishes a p10/p90 band, regardless of DQSS presence.
      uncertainty: { available: false, reason: 'this data source publishes no uncertainty range' },
      refreshMs: GRID_REFRESH_MS,
      updatedAtIso: usableGrid.updatedAt,
    }
  }

  if (cams.status === 'ready') {
    const tier = tierFromPm25(cams.current)
    let agreeCount = 0
    const resolvedCount = 1
    if (cams.tier === tier) agreeCount += 1

    const first = cams.series24h[0]
    const camsP10 = first?.p10 ?? null
    const camsP90 = first?.p90 ?? null

    return {
      status: 'ready',
      source: 'forecast',
      pm25: cams.current,
      tier,
      stale: cams.stale === true,
      place: { label: cams.cityName, countryCode: cams.countryCode, distanceKm: cams.distanceKm },
      validTimeIso: first?.time ?? cams.updatedAt,
      validTimeMs: first ? new Date(first.time).getTime() : null,
      ageMs: nowMs - new Date(cams.updatedAt).getTime(),
      natureLabel: '[FORECAST]',
      secondary: null,
      agreement,
      agreeCount,
      resolvedCount,
      hudStatus: cams.stale === true ? 'stale' : 'ready',
      // Forecast source never publishes a DQSS score, regardless of band presence.
      dqss: { available: false, reason: 'not measured for forecast-sourced readings' },
      uncertainty:
        camsP10 != null && camsP90 != null
          ? { available: true, p10: camsP10, p90: camsP90, unit: 'µg/m³' }
          : { available: false, reason: "this forecast doesn't publish a range" },
      refreshMs: CAMS_REFRESH_MS,
      updatedAtIso: cams.updatedAt,
    }
  }

  if (cams.status === 'loading') return { status: 'loading' }
  return { status: 'unavailable' }
}
