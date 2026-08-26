/**
 * AtmosphericEvidenceCard — data-evidence + uncertainty band card. Ported from
 * AirLens-platform apps/web/src/components/globe/observatory/AtmosphericEvidenceCard.tsx
 * as a fully presentational component: the source read `useAtmosphericViewModel()`
 * and computed `scaleUncertaintyBand()`/`dqssScoreToGrade()` itself; this port
 * takes the pre-computed band/dqss/label/value data as props instead (uncertainty
 * band math must be supplied by the caller, not recomputed here). react-i18next
 * stripped — plain-English default props.
 *
 * Glass-box doctrine preserved verbatim: the "no band" / "not applicable" empty
 * states are honest-empty, never fabricated, and this port keeps that branch
 * structure exactly.
 */
import type { AtmosphericMode } from '../../../types/globe'

export interface AtmosphericEvidenceFocus {
  label: string
  value: number | null
  unit: string
  p10: number | null
  p90: number | null
  kind: string
  dqss?: number | null
  qualityGrade?: string | null
  version?: string | null
}

export interface AtmosphericEvidenceBand {
  low: number
  center: number
  high: number
}

export interface AtmosphericEvidenceEventCoverage {
  rendered: number
  published: number
  detected?: number | null
}

export interface AtmosphericEvidenceCardProps {
  status: 'ready' | 'stale' | 'unavailable' | 'loading'
  statusLabel: string
  label: string
  unit?: string | null
  indexLabel: string
  focus?: AtmosphericEvidenceFocus | null
  /** [low, high] of the rendered field range, when there's no single focused value. */
  range?: [number, number] | null
  band?: AtmosphericEvidenceBand | null
  dqssGrade?: string | null
  /** The domain union — see the note on `GlobeObsHudMode`. */
  mode: AtmosphericMode
  uncertaintyMode?: 'none' | 'band' | 'unavailable'
  eventCoverage?: AtmosphericEvidenceEventCoverage | null
  source?: string | null
  referenceTimeLabel?: string
  validTimeLabel?: string
  provenance?: string[]
  coverage?: string | null
  ariaLabel?: string
}

export default function AtmosphericEvidenceCard({
  status,
  statusLabel,
  label,
  unit,
  indexLabel,
  focus,
  range,
  band,
  dqssGrade,
  mode,
  uncertaintyMode = 'band',
  eventCoverage,
  source,
  referenceTimeLabel = '—',
  validTimeLabel = '—',
  provenance = [],
  coverage,
  ariaLabel = 'Data evidence and uncertainty',
}: AtmosphericEvidenceCardProps) {
  return (
    <section className="gdash-card atmos-evidence" aria-label={ariaLabel}>
      <header className="atmos-evidence-head">
        <span>
          <b>Data evidence</b>
          <i>DATA EVIDENCE</i>
        </span>
        <span className={`atmos-status is-${status}`}>
          <i aria-hidden="true" />{statusLabel}
        </span>
      </header>

      <div className="atmos-evidence-title">
        <span className="atmos-evidence-index">{indexLabel}</span>
        <div>
          <strong>{focus?.label ?? label}</strong>
          <span>{unit || 'No unit'}</span>
        </div>
      </div>

      {focus?.value != null ? (
        <div className="atmos-focus-value">
          <span>{focus.value.toFixed(1)}</span>
          <small>{focus.unit}</small>
          <em>{focus.kind.toUpperCase()}</em>
        </div>
      ) : range ? (
        <div className="atmos-field-range">
          <span>{range[0].toFixed(1)}</span>
          <i aria-hidden="true"><b /></i>
          <span>{range[1].toFixed(1)}</span>
          <small>Rendered field range · {unit}</small>
        </div>
      ) : (
        <p className="atmos-honest-empty">
          Select a station, forecast marker, or country to see a value and its uncertainty.
        </p>
      )}

      {band && focus ? (
        <div
          className="atmos-uncertainty"
          role="img"
          aria-label={`Uncertainty p10 ${focus.p10?.toFixed(1)}, median ${focus.value?.toFixed(1)}, p90 ${focus.p90?.toFixed(1)}`}
        >
          <div className="atmos-uncertainty-label">
            <span>Uncertainty</span>
            <b>p10—p90</b>
          </div>
          <div className="atmos-band-track">
            <span className="atmos-band-range" style={{ left: `${band.low}%`, width: `${band.high - band.low}%` }} />
            <i className="low" style={{ left: `${band.low}%` }} />
            <i className="center" style={{ left: `${band.center}%` }} />
            <i className="high" style={{ left: `${band.high}%` }} />
          </div>
          <div className="atmos-band-values">
            <span>p10 <b>{focus.p10?.toFixed(1)}</b></span>
            <span>p50 <b>{focus.value?.toFixed(1) ?? '—'}</b></span>
            <span>p90 <b>{focus.p90?.toFixed(1)}</b></span>
          </div>
        </div>
      ) : (
        <div className="atmos-uncertainty-empty">
          <span>Uncertainty</span>
          <b>{uncertaintyMode === 'none' ? 'Not applicable' : 'No band — none generated'}</b>
        </div>
      )}

      {(dqssGrade || focus?.qualityGrade) && (
        <div className="atmos-quality-row">
          <span>{dqssGrade ? 'DQSS' : 'Prediction confidence'}</span>
          <b>{dqssGrade ?? focus?.qualityGrade}</b>
          {focus?.dqss != null && <em>{Math.round(focus.dqss)} / 100</em>}
        </div>
      )}

      {mode === 'events' && eventCoverage && (
        <>
          <div className="atmos-event-counts">
            <span><b>{eventCoverage.rendered.toLocaleString()}</b>Rendered</span>
            <span><b>{eventCoverage.published.toLocaleString()}</b>Published</span>
            <span><b>{eventCoverage.detected?.toLocaleString() ?? '—'}</b>Detected</span>
          </div>
          <p className="atmos-caveat">On-screen counts show what's actually rendered and published, not the full upstream volume.</p>
        </>
      )}
      {mode === 'transport' && (
        <p className="atmos-caveat">Visual estimate — wind × concentration field composite. Not a chemical transport model (CTM).</p>
      )}
      {mode === 'forecast' && !band && (
        <p className="atmos-caveat">GEFS single-member forecast — no uncertainty band</p>
      )}

      <dl className="atmos-provenance">
        <div className="wide">
          <dt>Source</dt>
          <dd>{source ?? '—'}{focus?.version ? ` · ${focus.version}` : ''}</dd>
        </div>
        <div>
          <dt>Reference time</dt>
          <dd>{referenceTimeLabel}</dd>
        </div>
        <div>
          <dt>Valid time</dt>
          <dd>{validTimeLabel}</dd>
        </div>
      </dl>

      {provenance.length > 0 && (
        <div className="atmos-provenance-tags" aria-label="Data epistemic provenance">
          {provenance.map((kind) => (
            <span key={kind}>{kind.toUpperCase()}</span>
          ))}
        </div>
      )}
      {coverage && <p className="atmos-coverage">Coverage · {coverage}</p>}
    </section>
  )
}
