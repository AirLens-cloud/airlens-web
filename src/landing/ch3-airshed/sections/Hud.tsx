// Ported from AirLens-platform apps/landing-lab
// `src/concepts/seoul/sections/Hud.tsx` (Wave L3, 2026-08-26).
//
// Deviations from the source: the `PROVENANCE`/`PROVENANCE_COLORS` ontology
// import (`shared/ontology/config`, `theme/config`) has no equivalent module
// in this repo — that shared vocabulary is landing-lab-only scaffolding this
// port doesn't carry over. The one disclosure line it drove ("interpolated,
// not measured per district") is inlined as plain text instead, the same
// "chapter-local caveat string" treatment Ch1/Ch2's `__caveat` paragraphs
// already use throughout this flight. Classnames are prefixed `ch3-`.
import type { DistrictInfo, ForecastGap } from '../types'
import { fmtSnapshot } from '../../shared/format'

interface Props {
  district: DistrictInfo | null
  snapshotMs: number
  forecastGap: ForecastGap
}

// Bottom-left HUD: what's under the cursor/selection right now, plus the two
// disclosures that must always be visible regardless of what's selected — the
// procedural-massing label and the forecast-coverage gap (Glass-box: an absence
// stated is not the same failure as a number invented to fill it).
export default function Hud({ district, snapshotMs, forecastGap }: Props) {
  return (
    <div className="ch3-hud" aria-live="polite">
      {district ? (
        <>
          <p className="ch3-hud__eyebrow">DISTRICT</p>
          <h2 className="ch3-hud__name">{district.nameEng}</h2>
          <div className="ch3-hud__value">
            <span className="ch3-hud__num">{district.pm25.toFixed(1)}</span>
            <span className="ch3-hud__unit">µg/m³ PM2.5</span>
          </div>
          <p className="ch3-hud__prov">
            <span aria-hidden="true">◐</span> Interpolated — sampled from the 1° PM2.5 grid at the
            district centroid, not measured per district.
          </p>
        </>
      ) : (
        <p className="ch3-hud__hint">Hover or select a district — 25 districts, west to east.</p>
      )}

      <p className="ch3-hud__snapshot">SNAPSHOT · {fmtSnapshot(snapshotMs)}</p>
      <p className="ch3-hud__massing">Procedural massing — not real buildings.</p>
      <p className="ch3-hud__gap">
        No TFT forecast city covers Seoul in this snapshot (nearest: {forecastGap.nearestCity}
        {forecastGap.nearestCountry ? `, ${forecastGap.nearestCountry}` : ''}
        {Number.isFinite(forecastGap.distanceKm) ? `, ${Math.round(forecastGap.distanceKm)} km` : ''}) — so this
        chapter shows none.
      </p>
    </div>
  )
}
