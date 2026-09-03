/**
 * CityPredictionCard — band 6a. The self-trained model's prediction for the
 * nearest published grid point.
 *
 * Adapted from AirLens-platform `apps/web/src/components/predictions/CityPredictionCard.tsx`.
 * The four-state flow (loading / error / empty / ready) and the caveat are
 * carried over intact; the i18n calls become English literals, and one fact is
 * added that the source could not have known: the publishing job is disabled
 * upstream, so the artifact can be old. `generatedAt` is shown rather than
 * hidden — a stale prediction presented as current is the failure mode here.
 *
 * Glass-box §5: p10–p90 and the confidence grade travel with the number, and
 * the grade is never invented when the model did not produce one.
 */
import DqssBadge, { type DqssGrade } from '../wireframe/DqssBadge'
import WfPlaceholder from '../wireframe/WfPlaceholder'
import { useCityPrediction } from '../../hooks/useCityPrediction'
import { GLOBE_CONFIG } from '../../lib/config/globe'

const VALID_GRADES: ReadonlySet<string> = new Set(['A', 'B', 'C', 'D', 'F'])

/** null / missing / unknown string → 'unknown' ('—'). No grade is invented. */
function toDqssGrade(raw: string | null | undefined): DqssGrade {
  return raw != null && VALID_GRADES.has(raw) ? (raw as DqssGrade) : 'unknown'
}

const COVERAGE = GLOBE_CONFIG.ML_PREDICTIONS.COVERAGE

export interface CityPredictionCardProps {
  lat?: number | null
  lon?: number | null
  label?: string
  unit?: string
  maxDistanceKm?: number
}

export default function CityPredictionCard({
  lat,
  lon,
  label = 'MODEL PREDICTION',
  unit = 'µg/m³',
  maxDistanceKm,
}: CityPredictionCardProps) {
  const { status, prediction, distanceKm } = useCityPrediction(lat, lon, maxDistanceKm)

  if (status === 'loading') {
    return (
      <article className="ins-card">
        <div className="ins-card-head"><span className="m">{label}</span></div>
        <WfPlaceholder height={96} label="Loading prediction…" />
      </article>
    )
  }

  if (status === 'error') {
    // A fetch/parse failure is reported as a failure — never folded into the
    // "no coverage here" empty state, which would misread an outage as a fact
    // about the location.
    return (
      <article className="ins-card">
        <div className="ins-card-head"><span className="m">{label}</span></div>
        <p className="ins-empty">
          No prediction grid could be read — neither the live dataset nor the
          bundled copy returned one. The publishing job is disabled upstream, so
          this may be absence rather than an outage; either way nothing is shown
          in its place.
        </p>
        <DqssBadge dqss="unknown" variant="default" label="Prediction confidence" />
      </article>
    )
  }

  if (status === 'empty' || !prediction) {
    return (
      <article className="ins-card">
        <div className="ins-card-head"><span className="m">{label}</span></div>
        <p className="ins-empty">
          No model prediction covers this location — the published grid has no
          point nearby. Nothing is substituted.
        </p>
        <DqssBadge dqss="unknown" variant="default" label="Prediction confidence" />
      </article>
    )
  }

  const dqss = toDqssGrade(prediction.confidence_grade)
  const nominalPct = Math.round(COVERAGE.NOMINAL * 100)

  return (
    <article className="ins-card">
      <div className="ins-card-head"><span className="m">{label}</span></div>

      <div className="ins-card-value">
        <span className="ins-card-num num">{prediction.predicted_p50.toFixed(1)}</span>
        <span className="ins-card-unit">{unit}</span>
      </div>

      <p className="ins-card-meta">
        {prediction.name}
        {distanceKm != null ? ` · nearest grid point ${distanceKm.toFixed(0)} km away` : ''}
        {prediction.source ? ` · ${prediction.source}` : ''}
      </p>

      <DqssBadge
        dqss={dqss}
        p10={prediction.predicted_p10}
        p90={prediction.predicted_p90}
        variant="verbose"
        unit={unit}
        label="Prediction confidence"
      />
      {dqss === 'unknown' ? (
        <p className="ins-card-note">The model produced no confidence grade for this point.</p>
      ) : null}

      <p className="ins-caveat">
        A nominal {nominalPct}% interval. The empirical coverage of this band has
        not been measured, and the interval is centred on the observations fed to
        the model. Above 75 {unit} coverage falls to roughly half and values read
        low — do not rely on it in the high-concentration range.
      </p>
    </article>
  )
}
