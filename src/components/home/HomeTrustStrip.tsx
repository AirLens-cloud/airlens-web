import DqssBadge from '../wireframe/DqssBadge'
import WfSkeleton from '../wireframe/WfSkeleton'
import { useDQSSData, lookupDQSSScore } from '../../hooks/useGlobeData'
import { dqssScoreToGrade } from '../../lib/config/globeOntology'
import { formatElapsed, formatUtcTime } from '../../lib/home/whyNow'

export interface HomeTrustStripProps {
  /** Hero city's coordinates (`Home.tsx`'s `coords`) — used to find the
   * nearest ground station for the DATA QUALITY cell. `null` before the
   * hero has a ready reading (caller does not mount this component then). */
  coords: { lat: number; lon: number } | null
  /** Hero reading's `generated_at` (`CapsuleDataReady.updatedAt`) — same
   * timestamp the hero's own "Updated Xm ago" meta line reads. */
  updatedAt: string
  /** Render's "now", read once by the caller — same value `HomeHero` uses,
   * so this strip's age and the hero's own age never disagree. */
  nowMs: number
}

/**
 * HomeTrustStrip — G8 "first-screen trust strip" (approved mockup, design-
 * audit 2026-09-05 cycle). Three hairline cells directly under the hero
 * reading: how many ground stations back the DQSS feed, what grade the
 * nearest one gives *this* reading's location, and how fresh the reading
 * is. All three read from data the app already fetches elsewhere —
 * `useDQSSData()` (Globe's DQSS manifest cache) and the hero's own
 * `updatedAt` — nothing here computes a new score.
 *
 * The DATA QUALITY cell reuses the exact provenance gate `pages/Globe.tsx`
 * uses for its evidence card: a grade renders only when the manifest
 * declares `'measured'` or `'partial'` for that score, `'partial'` gets the
 * same `<em title="…">PARTIAL</em>` tag, and everything else (no manifest,
 * `'seed'`, no station within range) degrades to "—" with a reason in
 * `title` — never a fabricated grade (§5 Glass-box).
 */
export default function HomeTrustStrip({ coords, updatedAt, nowMs }: HomeTrustStripProps) {
  const dqssCache = useDQSSData()
  const dqssLoading = dqssCache === null

  const stationCounts = dqssCache?.stationCounts ?? null
  const stationsValue = stationCounts && stationCounts.graded > 0 ? `${stationCounts.graded} graded` : null
  const stationsTitle = !stationCounts
    ? 'No ground station data available'
    : stationCounts.graded === 0
      ? 'No graded ground stations in the published DQSS feed'
      : stationCounts.declared
        ? stationCounts.total != null
          ? `${stationCounts.graded} of ${stationCounts.total} ground stations have a published DQSS grade`
          : `${stationCounts.graded} ground stations have a published DQSS grade`
        : `${stationCounts.graded} ground stations reporting a DQSS score (per-station grade count not separately published)`

  const score = coords ? lookupDQSSScore(coords.lat, coords.lon, dqssCache) : null
  const provenance = score !== null ? dqssCache?.provenance ?? null : null
  const isGraded = provenance === 'measured' || provenance === 'partial'
  const grade = isGraded ? dqssScoreToGrade(score) : null
  const isPartial = isGraded && provenance === 'partial'
  const partialDetail = dqssCache?.partialDetail ?? null
  // design-review 2026-09-05 (PR #82) Minor #2: `score === null` covers two
  // honestly different situations — the feed has published no stations at
  // all yet (not-yet-published/withheld) vs. it has stations, just none near
  // *this* location (range miss) — and conflating them as one "no station
  // within range" reason misdescribes the withheld case as a location
  // problem when it's a feed problem.
  const feedIsEmpty = dqssCache != null && dqssCache.stations.length === 0
  const qualityTitle = !coords
    ? 'No location for this reading yet'
    : score === null
      ? feedIsEmpty
        ? 'DQSS feed not yet published — no ground stations available'
        : 'No ground station within range of this location'
      : !isGraded
        ? "Nearest ground station's DQSS score is withheld — not yet measured (demo/seed value)"
        : isPartial
          ? "Nearest ground station's DQSS grade — some components measured, others are not yet available"
          : `Nearest ground station's DQSS grade (score ${Math.round(score)}/100)`

  const elapsedMs = nowMs - new Date(updatedAt).getTime()
  const ageText = formatElapsed(elapsedMs)
  const updatedTitle = ageText
    ? `Reading generated ${formatUtcTime(updatedAt)}`
    : 'Could not compute freshness for this reading'

  return (
    <div className="home-trust-strip t-tag" data-testid="home-trust-strip">
      <div className="home-trust-strip__cell">
        <span className="home-trust-strip__label">Ground stations</span>
        {dqssLoading ? (
          <WfSkeleton width={64} height={16} />
        ) : (
          <a className="home-trust-strip__value" href="/globe" title={stationsTitle} aria-label={stationsTitle}>
            {stationsValue ?? '—'}
          </a>
        )}
      </div>

      <div className="home-trust-strip__cell">
        <span className="home-trust-strip__label">Data quality</span>
        {/* design-review 2026-09-05 (PR #82) Major #1: this grade is a single
            nearest station's, not an aggregate — a sibling span (not nested
            inside `__label`, which would fold its text into the label's own
            textContent) so the two texts stay independently matchable. */}
        <span className="home-trust-strip__sublabel">Nearest ground station</span>
        {dqssLoading ? (
          <WfSkeleton width={64} height={16} />
        ) : (
          <a
            className="home-trust-strip__value"
            href="/methodology#dqss"
            title={qualityTitle}
            aria-label={qualityTitle}
          >
            {grade ? (
              <>
                <DqssBadge dqss={grade} variant="compact" />
                {isPartial && (
                  <em title="Some DQSS components are measured, others are not yet available">PARTIAL</em>
                )}
              </>
            ) : (
              '—'
            )}
          </a>
        )}
      </div>

      <div className="home-trust-strip__cell">
        <span className="home-trust-strip__label">Updated</span>
        <span
          className="home-trust-strip__value home-trust-strip__value--static"
          title={updatedTitle}
          aria-label={updatedTitle}
        >
          {ageText ?? '—'}
        </span>
      </div>

      {isPartial && partialDetail && (
        <p className="home-trust-strip__caveat">
          {partialDetail.measured}/{partialDetail.total} components measured
          {' '}· measured weight ≤{partialDetail.measuredWeightMax}%
        </p>
      )}
    </div>
  )
}
