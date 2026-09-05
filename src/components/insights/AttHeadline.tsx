/**
 * AttHeadline — band 1. The selected country's SDID verdict, stated once, with
 * everything needed to read it correctly on the same line of sight.
 *
 * The verdict comes from the SUMMARY row, never from the per-country detail
 * file. Both carry the same estimate, but the summary is already loaded by the
 * time this renders, so a failed detail fetch thins the charts below without
 * touching the number at the top. Reading it from `impact` instead — as an
 * earlier version did — meant a transient outage rendered as "this country was
 * never analysed", which is the one thing the honesty gate's copy exists to
 * say truthfully.
 *
 * Glass-box: the ATT never appears without its 95% interval, its p-value and
 * the panel-fit grade. A country the gate stopped shows the reason it stopped,
 * in place of the number — never a zero, never a dash on its own.
 */
import CountryFlag from './CountryFlag'
import DqssBadge, { type DqssGrade } from '../wireframe/DqssBadge'
import { attGateReason, attReliability, type AttReliability } from '../../api/policy'
import { POLICY_FIT_GRADE_CUTOFFS } from '../../lib/config/policy'
import { formatAtt, formatCi, formatP } from '../../lib/insights/format'
import type { PolicyImpact, PolicySummaryRow } from '../../types/policy'

export interface AttHeadlineProps {
  countryName: string
  /** The verdict. Always present — it rides on the catalogue. */
  summary: PolicySummaryRow
  /** The detail file, for the policy name. Null while loading or if it failed. */
  impact: PolicyImpact | null
  /** How many countries the batch estimated, out of how many it ran on. */
  estimatedCount: number
  totalCount: number
  unit?: string
}

/** What the reliability verdict means, in the reader's terms. */
const RELIABILITY_COPY: Record<AttReliability, string> = {
  reliable:
    'Distinguishable from zero at the 5% level, and within the range a national policy effect plausibly takes.',
  insignificant:
    'Estimated, but not distinguishable from zero — the interval includes "no effect". Read it as inconclusive, not as proof of no effect.',
  unstable:
    'The synthetic control diverged from the country before treatment, so the size of this estimate is not trustworthy.',
  no_data: 'No estimate was produced.',
}

const RELIABILITY_LABEL: Record<AttReliability, string> = {
  reliable: 'SIGNIFICANT',
  insignificant: 'INCONCLUSIVE',
  unstable: 'UNSTABLE',
  no_data: 'NOT ESTIMATED',
}

/** Panel-fit score → grade, on the same cutoffs `api/policy` uses. */
function fitGrade(score: number | null): DqssGrade {
  if (score === null || !Number.isFinite(score)) return 'unknown'
  for (const [floor, grade] of POLICY_FIT_GRADE_CUTOFFS) {
    if (score >= floor) return grade
  }
  return 'F'
}

export default function AttHeadline({
  countryName,
  summary,
  impact,
  estimatedCount,
  totalCount,
  unit = 'µg/m³',
}: AttHeadlineProps) {
  const reliability = attReliability(summary)
  const gated = summary.att === null

  return (
    <section className="ins-headline" aria-labelledby="ins-headline-title">
      <header className="ins-headline-head">
        <span className="m">SYNTHETIC DIFFERENCE-IN-DIFFERENCES</span>
        <span className="m ins-headline-count num">
          {estimatedCount} ESTIMATED / {totalCount} RUN
        </span>
      </header>

      <h1 id="ins-headline-title" className="ins-headline-title">
        <span className="ins-headline-flag">
          <CountryFlag key={summary.countryCode} countryCode={summary.countryCode} countryName={countryName} />
        </span>
        {countryName}
      </h1>

      {gated ? (
        <>
          <p className="ins-headline-gate">{attGateReason(summary.status)}</p>
          <p className="ins-headline-gate-note">
            This is the pipeline declining to estimate, not a measured effect of
            zero. The observed series below is unaffected — it is data, not a
            model output.
          </p>
        </>
      ) : (
        <>
          <div className="ins-headline-value">
            <span className="ins-headline-att num">{formatAtt(summary.att)}</span>
            <span className="ins-headline-unit">{unit}</span>
            <span className={`ins-headline-verdict ins-verdict-${reliability}`}>
              {RELIABILITY_LABEL[reliability]}
            </span>
          </div>
          <dl className="ins-headline-stats">
            <div>
              <dt className="m">95% CI</dt>
              <dd className="num">{formatCi(summary.ci_low, summary.ci_high)}</dd>
            </div>
            <div>
              <dt className="m">SIGNIFICANCE</dt>
              <dd className="num">{formatP(summary.p_value)}</dd>
            </div>
            <div>
              <dt className="m">TREATMENT</dt>
              <dd className="num">{impact?.title ?? summary.treatmentYear ?? '—'}</dd>
            </div>
          </dl>
          <p className="ins-headline-read">{RELIABILITY_COPY[reliability]}</p>
        </>
      )}

      <footer className="ins-headline-foot">
        <DqssBadge dqss={fitGrade(summary.fitScore)} variant="default" className="ins-fit-badge" />
        <span className="m">
          PANEL FIT — how well the synthetic control tracked this country before
          treatment. Not the sensor DQSS scale.
        </span>
        {summary.panelSource ? (
          <span className="m ins-headline-source">SOURCE {summary.panelSource}</span>
        ) : null}
      </footer>
    </section>
  )
}
