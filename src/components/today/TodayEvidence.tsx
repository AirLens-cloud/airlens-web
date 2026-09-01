/**
 * TodayEvidence — ④ Evidence. GRID/CAMS/AGREEMENT as three separate cells —
 * AGREEMENT states the source difference in µg/m³ rather than folding it
 * into a blended number (page-specs/today-decision-surface.md §4/§6).
 */
import { formatUtcTime } from '../../lib/home/whyNow'
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
              <span className="unit">µg/m³</span> · analysis/interpolated · valid {formatUtcTime(grid.updatedAt)} · source
              global_grid
              {grid.stale ? ' · stale' : ''}
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
