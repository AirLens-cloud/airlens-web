import DqssBadge from './DqssBadge'
import BandSlot from '../content/BandSlot'

/**
 * TrustLine — "how much should I trust this number" strip, shared by every
 * hero that renders a headline PM2.5 reading (Home / Today / Country
 * Profile). Glass-box: a withheld/unpublished field always renders with its
 * reason, never a blank or a fabricated placeholder value — this is the
 * literal purpose of the component when neither DQSS nor an uncertainty
 * band is wired up yet (uiux-evaluation-manyfast-2026-09-02 §4 G8).
 *
 * Each of the three signals is independent: a surface with a real p10/p90
 * band but no DQSS score renders one withheld and one live, side by side —
 * never collapsed into a single all-or-nothing state.
 *
 * design-audit 2026-09-05 §1 #4: withheld fields used to be three lines of
 * grey italic text — indistinguishable from a rendering bug. The DQSS slot
 * now shows an actual dashed-outline badge (`DqssBadge`'s existing `unknown`
 * grade already renders that shape) instead of describing one in prose, and
 * the p10-p90 slot renders through `<BandSlot>` so "no band" reads as a
 * placeholder shape, not a blank.
 */
export interface TrustLineDqss {
  available: false
  /** Why no score exists for this reading (e.g. "not measured by this source"). */
  reason: string
}

export interface TrustLineDqssReady {
  available: true
  /** Raw 0-100 DQSS score — this app has no letter-grade thresholds ported yet. */
  value: number
}

export interface TrustLineUncertainty {
  available: false
  reason?: string
}

export interface TrustLineUncertaintyReady {
  available: true
  p10: number
  p90: number
  unit?: string
}

export interface TrustLineProps {
  /** Observation age in ms — mutually exclusive with `ageLabel`. */
  ageMs?: number | null
  /** Pre-formatted age override (e.g. "as of 2024" for annual aggregates,
   * where an hour-count would misrepresent the data's real granularity). */
  ageLabel?: string | null
  dqss: TrustLineDqss | TrustLineDqssReady
  uncertainty: TrustLineUncertainty | TrustLineUncertaintyReady
  /** Defaults to `/methodology`. */
  methodologyHref?: string
  className?: string
  /**
   * What reading this line is trust-scoring — e.g. "THIS FORECAST". Every
   * caller (`Home`/`Today`/`CountryProfile`) reads a different quantity
   * (a CAMS forecast, a GRID analysis cell, an annual aggregate), and none
   * of them is a ground-station observation — a reader who has just seen a
   * *different* trust surface for an actual station (Home's own G8 strip)
   * can otherwise mistake "DQSS withheld" here for that station's grade
   * going missing. Optional and unset by default: existing call sites keep
   * rendering exactly as before until they opt in.
   */
  scopeLabel?: string
}

/** "2.3h" / "45m" / "3d" — never a countdown, always elapsed time. */
function formatAge(ms: number): string {
  const totalMin = Math.max(0, ms / 60000)
  if (totalMin < 60) return `${Math.max(1, Math.round(totalMin))}m`
  const hours = totalMin / 60
  if (hours < 48) return `${hours < 10 ? hours.toFixed(1) : Math.round(hours)}h`
  return `${Math.floor(hours / 24)}d`
}

export default function TrustLine({
  ageMs,
  ageLabel,
  dqss,
  uncertainty,
  methodologyHref = '/methodology',
  className,
  scopeLabel,
}: TrustLineProps) {
  const classes = ['trust-line', 't-tag']
  if (className) classes.push(className)

  const ageText = ageLabel ?? (ageMs != null && Number.isFinite(ageMs) ? formatAge(ageMs) : null)

  return (
    <div className={classes.join(' ')} data-testid="trust-line">
      {scopeLabel && <span className="trust-line__scope t-micro">{scopeLabel}</span>}
      <span className="trust-line__item">
        <span className="trust-line__k">obs age</span>{' '}
        {ageText ?? <span className="trust-line__na">unknown</span>}
      </span>
      <span className="trust-line__item">
        <span className="trust-line__k">DQSS</span>{' '}
        {dqss.available ? (
          `${Math.round(dqss.value)}/100`
        ) : (
          <span className="trust-line__withheld">
            <DqssBadge dqss="unknown" variant="compact" />
            <span className="trust-line__na">withheld ({dqss.reason})</span>
          </span>
        )}
      </span>
      <div className="trust-line__item trust-line__item--band">
        <span className="trust-line__k">p10–p90</span>
        <BandSlot
          emptyLabel="not published"
          {...(uncertainty.available
            ? { available: true, p10: uncertainty.p10, p90: uncertainty.p90, unit: uncertainty.unit }
            : { available: false, reason: uncertainty.reason })}
        />
      </div>
      <span className="trust-line__item">
        <a className="trust-line__why" href={methodologyHref}>
          Why this number? →
        </a>
      </span>
    </div>
  )
}
