/**
 * GlobeLegend — the colour key for whatever the stage is actually drawing.
 *
 * Adapted from AirLens-platform `apps/web/src/components/globe/GlobeLegend.tsx`.
 * Two source branches are deliberately gone rather than ported: the choropleth
 * legend and the station-spike scale describe layers that have no renderer in
 * this repo (`showChoropleth`, `showSpikes` — see the note on `globeStore`'s
 * defaults), and a legend for something that never appears on screen is worse
 * than no legend. react-i18next stripped — English is the displayed text.
 *
 * The marker caveats are split by what each encoding *actually does here*:
 * prediction rings really do fade with band width (`PredictionMarkers`
 * `bandRelWidthToAlpha`), while the station DQSS-opacity channel resolves to a
 * single default tier because `data_quality.json` has no publisher in this
 * repo's cascade (`useGlobeData.fetchDQSSData`). Claiming "faint = low quality"
 * for stations would describe an encoding the user cannot see.
 */
import { useGlobeStore } from '../../../store/globeStore'
import { COLOR_BAR_CONFIGS, OVERLAY_DISPLAY_LABELS } from '../../../lib/config/globeOverlays'
import { GLOBE_CONFIG } from '../../../lib/config/globe'
import LiquidGlass from '../../fluid/LiquidGlass'

const WIND_SAMPLES = [
  { key: 'calm', label: 'Calm', range: '0–5' },
  { key: 'brisk', label: 'Brisk', range: '5–15' },
  { key: 'strong', label: 'Strong', range: '15+' },
] as const

export default function GlobeLegend() {
  const overlayType = useGlobeStore((s) => s.overlayType)
  const showParticles = useGlobeStore((s) => s.showParticles)
  const showStations = useGlobeStore((s) => s.showStations)
  const showPredictions = useGlobeStore((s) => s.showPredictions)
  const meta = useGlobeStore((s) => s.activeGridMeta)
  const timeOffsetHours = useGlobeStore((s) => s.timeOffsetHours)
  const transportLens = useGlobeStore((s) => s.transportLens)

  const caveats: string[] = []
  if (showPredictions) {
    caveats.push('Fainter prediction rings mean a wider p10–p90 interval, not a lower value.')
  }
  if (showStations) {
    caveats.push('Station markers render at one opacity — the DQSS quality feed is not published in this build.')
  }

  const scalarActive = overlayType !== 'none'
  const active = scalarActive ? overlayType : showParticles ? 'wind' : null

  if (!active) {
    // Honest empty: with every field layer off there is no colour scale to key.
    // Marker caveats still earn the slot when markers are on screen.
    if (caveats.length === 0) return null
    return (
      <LiquidGlass variant="night" radius={0} className="globe-legend" as="aside">
        {caveats.map((text) => (
          <span key={text} className="lg-caveat">{text}</span>
        ))}
      </LiquidGlass>
    )
  }

  const bar = COLOR_BAR_CONFIGS[active]
  const info = OVERLAY_DISPLAY_LABELS[active]
  if (!bar || !info) return null

  const fresh = meta != null && meta.overlayType === active
  const hasRange = fresh && Number.isFinite(meta.min) && Number.isFinite(meta.max)

  // A resolved timeline frame relabels NOW as FORECAST/PAST · VALID <local time>.
  const isTimeline = fresh && active === 'pm25' && meta.leadHours != null && timeOffsetHours !== 0
  const validHHMM = meta?.validTime != null
    ? new Date(meta.validTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : ''
  const timeLabel = timeOffsetHours > 0 ? 'FORECAST' : 'PAST'

  return (
    <LiquidGlass variant="night" radius={0} className="globe-legend" as="aside">
      <div className="lg-head">
        <span className="name">{info.label}</span>
        <span className="unit">{bar.unit}</span>
        {hasRange && (
          <span className="range">
            {isTimeline ? `${timeLabel} · VALID ${validHHMM}` : 'NOW'} {meta.min.toFixed(1)}–{meta.max.toFixed(1)}
          </span>
        )}
      </div>
      <div className="lg-bar" style={{ background: bar.gradient }} />
      <div className="lg-ticks">
        {bar.ticks.map((tick) => (
          <span key={tick}>{tick}</span>
        ))}
      </div>
      {active === 'wind' && (
        <div className="lg-wind-motion" aria-label="How to read wind speed">
          {WIND_SAMPLES.map((sample) => (
            <span key={sample.key} className={`lg-wind-sample ${sample.key}`}>
              <span className="track" aria-hidden="true"><span className="dash" /></span>
              <span className="label">{sample.label}</span>
              <span className="range">{sample.range}<span className="unit">m/s</span></span>
            </span>
          ))}
        </div>
      )}
      {isTimeline && (
        <span className="lg-caveat">GEFS single-member forecast — no uncertainty band.</span>
      )}
      {active === 'wind' && (
        <span className="lg-caveat">
          {transportLens
            ? 'In FLOW the concentration field is layered over the wind-speed colouring.'
            : 'Faster wind travels further per frame, trails longer, and shifts warmer.'}
        </span>
      )}
      {/* IDW fallback only — here transparency means "no nearby observation",
          not "clean air", so an unlabelled faint cell reads as good news. */}
      {fresh && meta.source === GLOBE_CONFIG.GLOBE_HEATMAP.IDW_SOURCE_LABEL && (
        <span className="lg-caveat">
          No published grid — interpolated from stations (IDW). Cells far from any station are drawn fainter.
        </span>
      )}
      {caveats.map((text) => (
        <span key={text} className="lg-caveat">{text}</span>
      ))}
    </LiquidGlass>
  )
}
