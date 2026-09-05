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
import { useState } from 'react'
import { useGlobeStore } from '../../../store/globeStore'
import { COLOR_BAR_CONFIGS, OVERLAY_DISPLAY_LABELS } from '../../../lib/config/globeOverlays'
import { GLOBE_CONFIG } from '../../../lib/config/globe'
import { REPORTABLE_MAX_UGM3, classifyPm25 } from '../../../lib/config/gridPlausibility'
import LiquidGlass from '../../fluid/LiquidGlass'

const WIND_SAMPLES = [
  { key: 'calm', label: 'Calm', range: '0–5' },
  { key: 'brisk', label: 'Brisk', range: '5–15' },
  { key: 'strong', label: 'Strong', range: '15+' },
] as const

// Collapse choice persists per browser (P2 design-audit item #4: the
// colour-scale card sat on screen at full height for the whole session).
// Same guarded-storage shape as `locationChoiceStore.ts` — a private window
// or blocked storage just means the choice doesn't survive a reload, not a
// broken toggle.
const COLLAPSE_STORAGE_KEY = 'airlens-globe-legend-collapsed'

function readCollapsed(): boolean {
  try {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(COLLAPSE_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function writeCollapsed(collapsed: boolean): void {
  try {
    if (typeof window === 'undefined') return
    if (collapsed) window.localStorage.setItem(COLLAPSE_STORAGE_KEY, '1')
    else window.localStorage.removeItem(COLLAPSE_STORAGE_KEY)
  } catch {
    // Storage denied/unavailable — the toggle still works this session.
  }
}

export default function GlobeLegend() {
  const [collapsed, setCollapsed] = useState<boolean>(readCollapsed)
  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev
      writeCollapsed(next)
      return next
    })
  }

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

  const toggleButton = (
    <button
      type="button"
      className="lg-toggle"
      aria-expanded={!collapsed}
      aria-label={collapsed ? `Expand ${info.label} legend` : `Collapse ${info.label} legend`}
      onClick={toggleCollapsed}
    >
      <span className="lg-toggle-chevron" aria-hidden="true" />
    </button>
  )

  if (collapsed) {
    // Minimal label — current field name + the button to bring the colour
    // bar, ticks, and caveats back. Not a conditional render of the whole
    // card (§0 the card itself stays mounted so its screen anchor doesn't
    // jump): only the content below the header is gone.
    return (
      <LiquidGlass variant="night" radius={0} className="globe-legend is-collapsed" as="aside">
        <div className="lg-head fluid-enter">
          <span className="name">{info.label}</span>
          {toggleButton}
        </div>
      </LiquidGlass>
    )
  }

  const fresh = meta != null && meta.overlayType === active
  const hasRange = fresh && Number.isFinite(meta.min) && Number.isFinite(meta.max)
  // The published max can sit far past what `pm25ToAqi`/`gradeFromPm25` are
  // defined over (gridPlausibility.ts's doc comment: 15,868 µg/m³ measured in
  // the Yakutia fire belt) — the number stays in the header exactly as
  // fetched; this only adds the caveat that we cannot stand behind the top of
  // it.
  const pm25RangeVerdict = active === 'pm25' && hasRange ? classifyPm25(meta.max) : null

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
        {toggleButton}
      </div>
      {/* Everything below the header is what collapsing hides — wrapped so
          un-collapsing (a fresh mount, not a re-render of a persistent node)
          gets the existing fluid-enter pop-in for free. Collapsing removes
          it immediately with no exit transition, same as the evidence panel
          on this page (Globe.tsx's "honest state — nothing left to show"
          note) — there's nothing left to key once it's gone. */}
      <div className="lg-body fluid-enter">
        <div className="lg-bar" style={{ background: bar.gradient }} />
        <div className="lg-ticks">
          {bar.ticks.map((tick) => (
            <span key={tick}>{tick}</span>
          ))}
        </div>
        {pm25RangeVerdict?.verdict === 'beyond-scale' && (
          <span className="lg-caveat">
            Range max above is {pm25RangeVerdict.reason} (scale tops out at {REPORTABLE_MAX_UGM3} µg/m³).
          </span>
        )}
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
      </div>
    </LiquidGlass>
  )
}
