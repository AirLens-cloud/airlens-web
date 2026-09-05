/**
 * ForecastBandCard — TimesFM 2.5-200M zero-shot + CQR conformal PM2.5
 * forecast band (`w3-band-v1`, `api/forecastBand.ts`).
 *
 * A per-city, not per-country, feed: the artifact's 44 published cities carry
 * no lat/lon and are not the SDID country set the rest of this page reads —
 * so this card is intentionally decoupled from the page's selected country. A
 * city picker, not a geocoded nearest-match, is the honest way to let a
 * reader choose one (a partial name overlap with this repo's other city
 * catalogs exists but is too incomplete to drive an automatic match — see the
 * consumption plan's channel-recon notes).
 *
 * EXPERIMENTAL: this model track carries no DQSS grade yet
 * (`dqss.status: "unscored"`, never a fabricated letter), and every horizon's
 * 80% interval is a nominal CQR band — its measured holdout coverage is shown
 * per horizon (`ins-forecast-band__coverage`) rather than presented as a live
 * guarantee. Both are Glass-box §5 obligations, not decoration.
 */
import { useState } from 'react'
import DqssBadge, { type DqssGrade } from '../wireframe/DqssBadge'
import WfPlaceholder from '../wireframe/WfPlaceholder'
import BandSlot from '../content/BandSlot'
import { useForecastBand } from '../../hooks/useForecastBand'
import { formatEstimatedTimestamp } from '../../lib/insights/format'
import type { ForecastBandCity } from '../../types/forecastBand'

const VALID_GRADES: ReadonlySet<string> = new Set(['A', 'B', 'C', 'D', 'F'])
const STALE_AFTER_MS = 12 * 60 * 60 * 1000
const PREFERRED_DEFAULT_CITY = 'Seoul'

/** null / missing / unknown string → 'unknown'. No grade is invented. */
function toDqssGrade(raw: string | null | undefined): DqssGrade {
  return raw != null && VALID_GRADES.has(raw) ? (raw as DqssGrade) : 'unknown'
}

function formatValue(v: number | null): string {
  return v === null || !Number.isFinite(v) ? '—' : v.toFixed(1)
}

function pickDefaultCity(cities: ForecastBandCity[]): string | null {
  if (cities.length === 0) return null
  return cities.find((c) => c.name === PREFERRED_DEFAULT_CITY)?.name ?? cities[0].name
}

export default function ForecastBandCard() {
  const { status, response } = useForecastBand()
  const [selectedCity, setSelectedCity] = useState<string | null>(null)
  // Read once, in a lazy initializer — same purity-lint escape hatch
  // `Today.tsx`/`Home.tsx` use for a one-time non-deterministic read.
  const [nowMs] = useState(() => Date.now())

  return (
    <section className="ins-card ins-forecast-band" aria-labelledby="ins-forecast-band-title">
      <div className="ins-card-head">
        <span id="ins-forecast-band-title" className="m">
          PM2.5 FORECAST BAND
        </span>
        <span className="m ins-card-status">EXPERIMENTAL</span>
      </div>

      {status === 'loading' && <WfPlaceholder height={160} label="Loading the forecast band…" />}

      {status === 'error' && (
        <p className="ins-empty">
          The forecast band could not be read — a fetch or parse failure, not a
          statement that no forecast exists. Nothing is shown in its place.
        </p>
      )}

      {status === 'empty' && (
        <p className="ins-empty">The forecast band loaded, and it published no cities this pass.</p>
      )}

      {status === 'ready' && response
        ? (() => {
            const cities = [...response.cities].sort((a, b) => a.name.localeCompare(b.name))
            const activeCityName =
              selectedCity && cities.some((c) => c.name === selectedCity)
                ? selectedCity
                : pickDefaultCity(cities)
            const activeCity = cities.find((c) => c.name === activeCityName) ?? null
            const horizons = [...(activeCity?.horizons ?? [])].sort((a, b) => a.lead_hours - b.lead_hours)

            const generatedMs = Date.parse(response.generated_at)
            const ageMs = Number.isFinite(generatedMs) ? nowMs - generatedMs : null
            const isStale = ageMs !== null && ageMs > STALE_AFTER_MS
            const publishedLabel = formatEstimatedTimestamp(response.generated_at, nowMs)

            const dqss = response.dqss
            const dqssGrade = toDqssGrade(dqss?.grade)

            return (
              <>
                <label className="m ins-year-label ins-forecast-band__city">
                  CITY
                  <select
                    className="ins-year-select num"
                    value={activeCityName ?? ''}
                    onChange={(e) => setSelectedCity(e.target.value)}
                  >
                    {cities.map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>

                <p className="ins-forecast-band__meta">
                  {response.model}
                  {publishedLabel ? ` · published ${publishedLabel}` : ''}
                  {isStale ? <span className="ins-forecast-band__stale"> · STALE</span> : null}
                </p>

                {horizons.length === 0 ? (
                  <p className="ins-empty">
                    {activeCityName} has no published horizon this pass — nothing is substituted.
                  </p>
                ) : (
                  <div className="ins-forecast-band__rows">
                    {horizons.map((h) => {
                      const claim = response.uncertainty?.picp80_claim_by_horizon?.[String(h.lead_hours)]
                      return (
                        <div className="ins-forecast-band__row" key={h.lead_hours}>
                          <span className="ins-forecast-band__row-label m">H+{h.lead_hours}</span>
                          <span className="ins-forecast-band__row-p50 num">
                            {formatValue(h.p50)} <span className="ins-card-unit">µg/m³</span>
                          </span>
                          <BandSlot
                            {...(h.p10 !== null && h.p90 !== null
                              ? { available: true, p10: h.p10, p90: h.p90, p50: h.p50, unit: 'µg/m³' }
                              : { available: false, reason: 'not published for this horizon' })}
                          />
                          {claim ? (
                            <span className="ins-forecast-band__coverage m">
                              {claim.status === 'ok' && claim.picp80_holdout !== null
                                ? `HOLDOUT PICP80 ${Math.round(claim.picp80_holdout * 100)}% (n=${claim.n_holdout})`
                                : claim.status === 'provisional'
                                  ? `PROVISIONAL (n=${claim.n_holdout})`
                                  : 'NO HOLDOUT CLAIM'}
                            </span>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                )}

                <DqssBadge dqss={dqssGrade} variant="default" label="Forecast confidence" />
                {dqssGrade === 'unknown' && dqss?.reason ? <p className="ins-card-note">{dqss.reason}</p> : null}

                <p className="ins-caveat">
                  A nominal 80% interval (CQR conformal, temporal-split calibration). The
                  coverage figure above is the measured holdout rate for that horizon, not
                  a live guarantee — a horizon marked provisional has too few holdout points
                  to trust yet.
                </p>
              </>
            )
          })()
        : null}
    </section>
  )
}
