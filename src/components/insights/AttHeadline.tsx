/**
 * AttHeadline — band 1. The selected country's SDID verdict, stated once, with
 * everything needed to read it correctly on the same line of sight.
 *
 * Glass-box: the ATT never appears without its 95% interval, its p-value and
 * the panel-fit grade. A country the honesty gate stopped shows the reason it
 * stopped, in place of the number — never a zero, never a dash on its own.
 */
import DqssBadge, { type DqssGrade } from '../wireframe/DqssBadge'
import { attGateReason, attReliability, type AttReliability } from '../../api/policy'
import { formatAtt, formatCi, formatP } from '../../lib/insights/format'
import type { PolicyImpact } from '../../types/policy'

export interface AttHeadlineProps {
  countryName: string
  flag: string | null
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

function fitGrade(impact: PolicyImpact | null): DqssGrade {
  return impact?.dqss ?? 'unknown'
}

export default function AttHeadline({
  countryName,
  flag,
  impact,
  estimatedCount,
  totalCount,
  unit = 'µg/m³',
}: AttHeadlineProps) {
  const reliability: AttReliability = impact
    ? attReliability(impact)
    : 'no_data'
  const gated = impact === null || impact.att === null

  return (
    <section className="ins-headline" aria-labelledby="ins-headline-title">
      <header className="ins-headline-head">
        <span className="m">SYNTHETIC DIFFERENCE-IN-DIFFERENCES</span>
        <span className="m ins-headline-count num">
          {estimatedCount} ESTIMATED / {totalCount} RUN
        </span>
      </header>

      <h1 id="ins-headline-title" className="ins-headline-title">
        {flag ? <span aria-hidden="true">{flag} </span> : null}
        {countryName}
      </h1>

      {gated ? (
        <>
          <p className="ins-headline-gate">
            {attGateReason(impact?.status)}
          </p>
          <p className="ins-headline-gate-note">
            This is the pipeline declining to estimate, not a measured effect of
            zero. The observed series below is unaffected — it is data, not a
            model output.
          </p>
        </>
      ) : (
        <>
          <div className="ins-headline-value">
            <span className="ins-headline-att num">{formatAtt(impact.att)}</span>
            <span className="ins-headline-unit">{unit}</span>
            <span className={`ins-headline-verdict ins-verdict-${reliability}`}>
              {RELIABILITY_LABEL[reliability]}
            </span>
          </div>
          <dl className="ins-headline-stats">
            <div>
              <dt className="m">95% CI</dt>
              <dd className="num">{formatCi(impact.ci_low, impact.ci_high)}</dd>
            </div>
            <div>
              <dt className="m">SIGNIFICANCE</dt>
              <dd className="num">{formatP(impact.p_value)}</dd>
            </div>
            <div>
              <dt className="m">TREATMENT</dt>
              <dd className="num">{impact.title ?? '—'}</dd>
            </div>
          </dl>
          <p className="ins-headline-read">{RELIABILITY_COPY[reliability]}</p>
        </>
      )}

      <footer className="ins-headline-foot">
        <DqssBadge dqss={fitGrade(impact)} variant="default" className="ins-fit-badge" />
        <span className="m">
          PANEL FIT — how well the synthetic control tracked this country before
          treatment. Not the sensor DQSS scale.
        </span>
        {impact?.panelSource ? (
          <span className="m ins-headline-source">SOURCE {impact.panelSource}</span>
        ) : null}
      </footer>
    </section>
  )
}
