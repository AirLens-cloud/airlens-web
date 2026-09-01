import { useEffect, useState } from 'react'
import { fetchCountrySeries } from '../../api/countrySeries'
import { attGateReason, attReliability, fetchCountryPolicyImpact } from '../../api/policy'
import type { CountryPanel, PolicyImpact } from '../../types/policy'
import WfStamp from '../wireframe/WfStamp'

export interface ArticleEvidenceBlockProps {
  countryCode: string | null
}

type LoadState = 'no-country' | 'loading' | 'ready'

/**
 * ④ EvidenceEnvelope block — `dispatch-article-signal-desk.md` §4.2/§6.
 *
 * Visually and semantically separate from the ③ "AirLens summary" block: a
 * `◆` stamp (③ uses `■`), its own fetch, its own loading/error lifecycle —
 * an article-fetch failure elsewhere on the page never hides or blocks this
 * block, and this block's own failure never blocks anything else (§5
 * independent-failure principle).
 *
 * Observed PM2.5 (`fetchCountrySeries`) renders with `nature: observation`
 * (crisp border) — its p10/p90 is the measured station-day spread. The SDID
 * policy effect (`fetchCountryPolicyImpact`) renders with `nature: inferred`
 * (dashed border) — an estimate with a gate reason when the honesty gate
 * declined it. The two are never presented as the same kind of number.
 *
 * `state` is derived from `resolvedFor` rather than set synchronously in the
 * effect body (react-hooks/set-state-in-effect) — `no-country` is a pure
 * render-time derivation of the prop, and `loading` vs `ready` is "have we
 * resolved a fetch for the countryCode we're currently showing".
 */
export default function ArticleEvidenceBlock({ countryCode }: ArticleEvidenceBlockProps) {
  const [resolvedFor, setResolvedFor] = useState<string | null>(null)
  const [panel, setPanel] = useState<CountryPanel | null>(null)
  const [policy, setPolicy] = useState<PolicyImpact | null>(null)

  useEffect(() => {
    if (!countryCode) return
    let cancelled = false
    Promise.allSettled([fetchCountrySeries(countryCode), fetchCountryPolicyImpact(countryCode)]).then(
      ([panelResult, policyResult]) => {
        if (cancelled) return
        setPanel(panelResult.status === 'fulfilled' ? panelResult.value : null)
        setPolicy(policyResult.status === 'fulfilled' ? policyResult.value : null)
        setResolvedFor(countryCode)
      },
    )
    return () => {
      cancelled = true
    }
  }, [countryCode])

  const state: LoadState = !countryCode ? 'no-country' : resolvedFor === countryCode ? 'ready' : 'loading'
  const latestPoint = panel && panel.points.length > 0 ? panel.points[panel.points.length - 1] : null

  return (
    <section className="content-evidence" aria-label="AirLens analysis">
      <WfStamp label="◆ AirLens analysis" />

      {state === 'no-country' && (
        <p className="content-evidence__withheld t-caption">
          Withheld — this article carries no country code, so no linked air-quality reading can be shown.
        </p>
      )}

      {state === 'loading' && <p className="content-evidence__loading t-caption">Loading linked evidence…</p>}

      {state === 'ready' && !latestPoint && !policy && (
        <p className="content-evidence__withheld t-caption">
          Withheld — no published air-quality panel or policy estimate resolved for {countryCode}, either because
          none exists or because the read failed.
        </p>
      )}

      {state === 'ready' && latestPoint && (
        <div className="content-evidence__block content-evidence__block--observation" data-nature="observation">
          <p className="t-micro">Observed PM2.5 — {countryCode}, {latestPoint.year}</p>
          <p className="t-data">
            {latestPoint.pm25.toFixed(1)} µg/m³
            {latestPoint.p10 !== null && latestPoint.p90 !== null
              ? ` (p10 ${latestPoint.p10.toFixed(1)} – p90 ${latestPoint.p90.toFixed(1)})`
              : ''}
          </p>
          <p className="t-caption">
            {latestPoint.stationCount !== null ? `${latestPoint.stationCount} stations · ` : ''}
            source: {latestPoint.sources.join(', ') || 'unattributed'}
          </p>
        </div>
      )}

      {state === 'ready' && policy && (
        <div className="content-evidence__block content-evidence__block--inferred" data-nature="inferred">
          <p className="t-micro">Policy effect (SDID) — {countryCode}</p>
          {policy.att !== null ? (
            <>
              <p className="t-data">
                {policy.att.toFixed(1)} µg/m³
                {policy.ci_low !== null && policy.ci_high !== null
                  ? ` (95% CI ${policy.ci_low.toFixed(1)} – ${policy.ci_high.toFixed(1)})`
                  : ''}
              </p>
              <p className="t-caption">{attReliability(policy) === 'insignificant' ? 'Not distinguishable from zero.' : 'Estimated effect.'}</p>
            </>
          ) : (
            <p className="t-caption">{attGateReason(policy.status)}</p>
          )}
        </div>
      )}

      {countryCode && (
        <a className="content-evidence__link t-micro" href={`/insights?country=${countryCode}`}>
          View full evidence →
        </a>
      )}
    </section>
  )
}
