/**
 * TodayEvidence — ④ Evidence. GRID/CAMS/AGREEMENT as three separate cells —
 * AGREEMENT states the source difference in µg/m³ rather than folding it
 * into a blended number (page-specs/today-decision-surface.md §4/§6).
 */
import { formatUtcTime } from '../../lib/home/whyNow'
import { isReportable } from '../../lib/config/gridPlausibility'
import type { TodayGridState } from '../../hooks/useTodayGrid'
import type { TodayCamsState } from '../../hooks/useTodayCams'
import type { SourceAgreement } from '../../lib/today/sourceAgreement'

export interface TodayEvidenceProps {
  grid: TodayGridState
  cams: TodayCamsState
  agreement: SourceAgreement | null
}

export default function TodayEvidence({ grid, cams, agreement }: TodayEvidenceProps) {
  return (
    <section className="today-evidence" aria-label="Evidence">
      <h2 className="today-panel__title m">EVIDENCE</h2>
      <div className="today-evidence__cells">
        <div className="today-cell">
          <span className="today-cell__label m">GRID</span>
          {grid.status === 'ready' ? (
            <p className="t-micro">
              {/* "analysis" is right — the producer reads GEFS's f000 `anl`
                  record, not a forecast lead — but "interpolated" was not:
                  the grid is decimated to whole degrees and we read the
                  nearest surviving point. */}
              <span className="unit">µg/m³</span> · analysis/nearest grid point · valid {formatUtcTime(grid.updatedAt)} ·
              source global_grid
              {grid.stale ? ' · stale' : ''}
              {/* Named here too: the AGREEMENT cell drops to "not enough
                  sources" when the grid is unverifiable, and without this the
                  reader would have no way to tell why a source that clearly
                  resolved stopped counting. */}
              {!isReportable(grid.plausibility) ? ` · ${grid.plausibility?.reason}` : ''}
            </p>
          ) : (
            <p className="t-micro">Not available.</p>
          )}
        </div>
        <div className="today-cell">
          <span className="today-cell__label m">CAMS</span>
          {cams.status === 'ready' ? (
            <p className="t-micro">
              <span className="unit">µg/m³</span> · forecast · valid {formatUtcTime(cams.series24h[0]?.time ?? cams.updatedAt)}{' '}
              · source Open-Meteo CAMS
              {cams.stale ? ' · stale' : ''}
            </p>
          ) : (
            <p className="t-micro">Not available.</p>
          )}
        </div>
        <div className="today-cell" data-testid="today-evidence-agreement">
          <span className="today-cell__label m">AGREEMENT</span>
          {agreement ? (
            <p className="t-micro">
              {agreement.agree ? 'GRID and CAMS agree' : 'GRID and CAMS disagree'} within {agreement.diff.toFixed(0)}{' '}
              <span className="unit">µg/m³</span>.
            </p>
          ) : (
            <p className="t-micro">Not enough sources to compare.</p>
          )}
        </div>
      </div>
      <p className="today-evidence__note t-caption">
        Disagreement shown, not averaged — every value above traces to one named source, never a blend.
      </p>
    </section>
  )
}
