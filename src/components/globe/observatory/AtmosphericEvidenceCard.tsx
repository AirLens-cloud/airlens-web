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
 *
 * Information architecture (2026-09 revision, external UX pass): the panel is
 * layered by how much attention it earns —
 *   - Layer 1 (always visible, 4 elements): name·unit·status one line, the
 *     big representative value with an "expected range" caption, a compact
 *     p10—p50—p90 band line, and a DQSS + lineage badge line. Lineage moved
 *     up here (not buried in the source block) because it changes how the
 *     value should be read.
 *   - Layer 2 (conditional): the mode-specific caveats — only rendered when
 *     they'd change interpretation (transport composite, forecast single
 *     member, events partial-volume note).
 *   - Layer 3 (collapsed `<details>`): source / reference time / valid time /
 *     coverage / full provenance tags. The `<summary>` line (source name) is
 *     the one always-visible line; everything else needs a click.
 * Switching `mode` only swaps the value-block content (events → total count +
 * per-type subtotal) — band/quality/details structure is unchanged, so the
 * panel doesn't need to "relearn" itself on mode change.
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
  const isEvents = mode === 'events' && !!eventCoverage
  const qualityTag = dqssGrade ?? focus?.qualityGrade ?? null
  const lineageTag = focus?.kind ? focus.kind.toUpperCase() : null

  return (
    <section className="gdash-card atmos-evidence" aria-label={ariaLabel}>
      {/* Layer 1 — always visible: name·unit·status, big value, compact band, quality+lineage. */}
      <div className="atmos-l1">
        <div className="atmos-headline">
          <span className="atmos-headline-index">{indexLabel}</span>
          <span className="atmos-headline-name">
            <strong>{focus?.label ?? label}</strong>
            <i>{unit || 'No unit'}</i>
          </span>
          <span className={`atmos-status is-${status}`}>
            <i aria-hidden="true" />{statusLabel}
          </span>
        </div>

        {isEvents ? (
          <div className="atmos-value-block">
            <div className="atmos-value-big">
              <span>{eventCoverage.published.toLocaleString()}</span>
              <small>events</small>
            </div>
            <p className="atmos-value-caption">
              Rendered {eventCoverage.rendered.toLocaleString()} · Detected {eventCoverage.detected?.toLocaleString() ?? '—'}
            </p>
          </div>
        ) : focus?.value != null ? (
          <div className="atmos-value-block">
            <div className="atmos-value-big">
              <span>{focus.value.toFixed(1)}</span>
              <small>{focus.unit}</small>
            </div>
            {/* Gate on `band` (null on quantile crossing — independent
                regressors don't guarantee p10≤p50≤p90) so this caption can
                never show a reversed range while the band line below says
                "No band". */}
            {band != null && focus.p10 != null && focus.p90 != null && (
              <p className="atmos-value-caption">Expected range {focus.p10.toFixed(1)}–{focus.p90.toFixed(1)}</p>
            )}
          </div>
        ) : range ? (
          <div className="atmos-value-block">
            <div className="atmos-field-range">
              <span>{range[0].toFixed(1)}</span>
              <i aria-hidden="true"><b /></i>
              <span>{range[1].toFixed(1)}</span>
            </div>
            <p className="atmos-value-caption">Rendered field range · {unit}</p>
          </div>
        ) : (
          <p className="atmos-honest-empty">
            Select a station, forecast marker, or country to see a value and its uncertainty.
          </p>
        )}

        {!isEvents && (
          band && focus ? (
            <div
              className="atmos-band-compact"
              role="img"
              aria-label={`Uncertainty p10 ${focus.p10?.toFixed(1)}, median ${focus.value?.toFixed(1)}, p90 ${focus.p90?.toFixed(1)}`}
            >
              <div className="atmos-band-track">
                <span className="atmos-band-range" style={{ left: `${band.low}%`, width: `${band.high - band.low}%` }} />
                <i className="low" style={{ left: `${band.low}%` }} />
                <i className="center" style={{ left: `${band.center}%` }} />
                <i className="high" style={{ left: `${band.high}%` }} />
              </div>
              <p className="atmos-band-line" title="p10 – p50 – p90 confidence interval">
                {focus.p10?.toFixed(1)} — {focus.value?.toFixed(1) ?? '—'} — {focus.p90?.toFixed(1)}
              </p>
            </div>
          ) : (
            <p className="atmos-band-empty">
              {uncertaintyMode === 'none' ? 'Not applicable' : 'No band — none generated'}
            </p>
          )
        )}

        {/* Lineage must survive a missing grade — it changes how the value
            reads (OBSERVED vs MODEL-ESTIMATE) even when no DQSS/confidence
            score was published ("don't fill the unknown with a C"). */}
        {(qualityTag || lineageTag) && (
          <div className="atmos-quality-line">
            {qualityTag && (
              <>
                <span title="Data Quality Scoring System — composite confidence grade">
                  {dqssGrade ? 'DQSS' : 'Prediction confidence'}
                </span>
                <b>{qualityTag}</b>
              </>
            )}
            {focus?.dqss != null && <em>{Math.round(focus.dqss)}/100</em>}
            {lineageTag && <em className="atmos-lineage-tag">{lineageTag}</em>}
          </div>
        )}
      </div>

      {/* Layer 2 — conditional caveats: only surfaced when they'd change how the value reads. */}
      {isEvents && (
        <p className="atmos-caveat">On-screen counts show what's actually rendered and published, not the full upstream volume.</p>
      )}
      {mode === 'transport' && (
        <p className="atmos-caveat">Visual estimate — wind × concentration field composite. Not a chemical transport model (CTM).</p>
      )}
      {mode === 'forecast' && !band && (
        <p className="atmos-caveat">GEFS single-member forecast — no uncertainty band</p>
      )}

      {/* Layer 3 — collapsed source/provenance detail; the summary line is the only always-visible part. */}
      <details className="atmos-evidence-details">
        <summary className="atmos-source-line">
          {source ?? '—'}{focus?.version ? ` · ${focus.version}` : ''}
        </summary>
        <dl className="atmos-provenance">
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
        {coverage && (
          <p className="atmos-coverage" title="Spatial or temporal extent this reading describes">
            Coverage · {coverage}
          </p>
        )}
      </details>
    </section>
  )
}
