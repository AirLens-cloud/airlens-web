/**
 * Globe — the atmospheric observation deck.
 *
 * G2 wires the chrome to the engine G1 landed: one store snapshot feeds the
 * HUD strip, the mode rail and the evidence card through
 * `useAtmosphericViewModel`, so what the page says and what the sphere draws
 * come from the same derivation. Replaces `GlobePlaceholder`.
 *
 * Two honesty gates live here rather than in the components:
 *   - POLICY is disabled in the rail. `setAtmosphericMode('policy')` applies a
 *     choropleth bundle whose renderer is deferred with G3, so selecting it
 *     would clear the stage and call that a lens.
 *   - FORECAST is disabled until the GEFS manifest resolves to usable frames.
 *     The store setter is already a strict no-op in that case; disabling the
 *     control says so instead of swallowing the click.
 */
import { Suspense, lazy, useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { Vector3 } from 'three'
import { useShallow } from 'zustand/react/shallow'
import { useGlobeStore } from '../store/globeStore'
import { usePlatform } from '../hooks/usePlatform'
import { isWebGLSupported } from '../lib/webgl'
import { logger } from '../lib/logger'
import { GLOBE_CONFIG } from '../lib/config/globe'
import { TIMELINE_ENABLED } from '../lib/config/globeOverlays'
import { dqssScoreToGrade } from '../lib/config/globeOntology'
import { ATMOSPHERIC_MODES } from '../lib/config/atmosphericModes'
import { fetchTimelineManifest } from '../api/timeline'
import type { AtmosphericMode } from '../types/globe'
import GlobeFallback from '../components/globe/GlobeFallback'
import GlobeObsHud, { type GlobeObsHudStatus } from '../components/globe/observatory/GlobeObsHud'
import AtmosphericModeRail from '../components/globe/observatory/AtmosphericModeRail'
import AtmosphericEvidenceCard from '../components/globe/observatory/AtmosphericEvidenceCard'
import { useAtmosphericViewModel } from '../components/globe/observatory/useAtmosphericViewModel'
import { scaleUncertaintyBand, type AtmosphericEvidenceStatus } from '../components/globe/observatory/atmosphericViewModel'
import GlobeLegend from '../components/globe/chrome/GlobeLegend'
import GlobeLayerToggles from '../components/globe/chrome/GlobeLayerToggles'
import GlobeGridTooltip from '../components/globe/chrome/GlobeGridTooltip'
import GlobeTimeline from '../components/globe/chrome/GlobeTimeline'
import '../styles/globe-stage.css'

// Only the engine is code-split. GlobeFallback is a static SVG that the
// landing flight and the design gallery already import eagerly, so lazying it
// here would split nothing (rolldown says as much) while implying it does.
const Globe3DScene = lazy(() => import('../components/globe/three/Globe3DScene'))

const CAM = GLOBE_CONFIG.GLOBE_V2.CAMERA
const DEG2RAD = Math.PI / 180
const ROTATE_STEP_DEG = 5
const PITCH_STEP_DEG = 4
const ZOOM_IN_FACTOR = 0.92
const ZOOM_OUT_FACTOR = 1.08

// Module-scope reusable vectors — keyboard nav rotates around the globe centre
// and must never allocate a THREE.Vector3 per keypress.
const _yAxis = new Vector3(0, 1, 0)
const _pitchAxis = new Vector3()

/**
 * The evidence card and HUD carry four status states; the view model has a
 * fifth, `empty` (every field layer off). It maps to `unavailable` with its
 * own label — "no layer selected" is a real answer, not a loading spinner.
 */
const STATUS_LABELS: Record<AtmosphericEvidenceStatus, string> = {
  ready: 'READY',
  loading: 'LOADING',
  stale: 'STALE',
  unavailable: 'UNAVAILABLE',
  empty: 'NO LAYER',
}

function toChromeStatus(status: AtmosphericEvidenceStatus): GlobeObsHudStatus {
  return status === 'empty' ? 'unavailable' : status
}

function utcLabel(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${new Date(value).toISOString().replace('T', ' ').slice(0, 16)} UTC`
}

export default function Globe() {
  const platform = usePlatform()
  const webgl = useMemo(() => isWebGLSupported(), [])
  const view = useAtmosphericViewModel()

  const setAtmosphericMode = useGlobeStore((s) => s.setAtmosphericMode)
  const setSelectedCountry = useGlobeStore((s) => s.setSelectedCountry)
  const setFlyToTarget = useGlobeStore((s) => s.setFlyToTarget)
  const setTimeline = useGlobeStore((s) => s.setTimeline)
  const { timelineFrames, timelineStale } = useGlobeStore(
    useShallow((s) => ({ timelineFrames: s.timelineFrames, timelineStale: s.timelineStale })),
  )

  // TIMELINE_ENABLED is a build-time constant: with the timeline compiled out
  // there is no manifest to wait on, so the check starts already settled.
  const [manifestChecked, setManifestChecked] = useState(!TIMELINE_ENABLED)

  // Load the GEFS manifest once; frame offsets are relative to the load time.
  useEffect(() => {
    if (!TIMELINE_ENABLED) return
    let cancelled = false
    fetchTimelineManifest(Date.now()).then((data) => {
      if (cancelled) return
      setTimeline(data?.frames ?? null, data?.stale ?? false)
      setManifestChecked(true)
    })
    return () => { cancelled = true }
  }, [setTimeline])

  const forecastReady = !!timelineFrames
    && timelineFrames.some((frame) => frame.offsetHours > 0)
    && !timelineStale

  const modeItems = useMemo(
    () => ATMOSPHERIC_MODES.map((mode) => {
      const forecastPending = mode.id === 'forecast' && !forecastReady
      const disabled = !!mode.unavailableReason || forecastPending
      const detail = mode.unavailableReason
        ? mode.detail
        : forecastPending
          ? (manifestChecked ? 'No usable GEFS frames' : 'Checking frames…')
          : mode.detail
      return {
        id: mode.id,
        number: mode.number,
        glyph: mode.glyph,
        label: mode.label,
        detail,
        active: view.mode === mode.id,
        disabled,
        ariaLabel: disabled ? `${mode.label} — ${mode.unavailableReason ?? detail}` : `${mode.label} — ${detail}`,
      }
    }),
    [forecastReady, manifestChecked, view.mode],
  )

  const handleModeSelect = useCallback(
    (id: string) => setAtmosphericMode(id as AtmosphericMode),
    [setAtmosphericMode],
  )

  const handleStageKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const { key } = e

      if (key >= '1' && key <= '5') {
        const mode = ATMOSPHERIC_MODES[Number(key) - 1]
        // Same gate as the rail — a disabled lens stays unreachable by keyboard.
        if (!mode || mode.unavailableReason) return
        if (mode.id === 'forecast' && !forecastReady) return
        e.preventDefault()
        setAtmosphericMode(mode.id)
        return
      }
      if (key === 'Escape') {
        e.preventDefault()
        setSelectedCountry(null)
        setFlyToTarget(null)
        return
      }

      const isRotate = key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown'
      const isZoom = key === '+' || key === '=' || key === '-' || key === '_'
      if (!isRotate && !isZoom) return
      e.preventDefault()

      // Globe3DScene owns the heavy three/fiber stack — importing it here keeps
      // it out of the eagerly-loaded page bundle (the fallback path never needs
      // it). By the time the stage has focus the module is already resolved.
      import('../components/globe/three/Globe3DScene')
        .then(({ orbitControlsRef }) => {
          const controls = orbitControlsRef.current
          if (!controls) return
          const camera = controls.object

          if (key === 'ArrowLeft') camera.position.applyAxisAngle(_yAxis, DEG2RAD * ROTATE_STEP_DEG)
          else if (key === 'ArrowRight') camera.position.applyAxisAngle(_yAxis, -DEG2RAD * ROTATE_STEP_DEG)
          else if (key === 'ArrowUp') {
            _pitchAxis.crossVectors(_yAxis, camera.position).normalize()
            camera.position.applyAxisAngle(_pitchAxis, DEG2RAD * PITCH_STEP_DEG)
          } else if (key === 'ArrowDown') {
            _pitchAxis.crossVectors(_yAxis, camera.position).normalize()
            camera.position.applyAxisAngle(_pitchAxis, -DEG2RAD * PITCH_STEP_DEG)
          } else if (key === '+' || key === '=') camera.position.multiplyScalar(ZOOM_IN_FACTOR)
          else camera.position.multiplyScalar(ZOOM_OUT_FACTOR)

          camera.position.clampLength(CAM.MIN_DISTANCE, CAM.MAX_DISTANCE)
          controls.update()
        })
        // Chunk-load failure disables keyboard nav — it must not fail silently.
        .catch((err) => { logger.warn('Globe3DScene dynamic import failed — keyboard nav disabled:', err) })
    },
    [forecastReady, setAtmosphericMode, setSelectedCountry, setFlyToTarget],
  )

  const focus = view.focus
  const band = focus ? scaleUncertaintyBand(focus.p10, focus.value, focus.p90) : null
  const chromeStatus = toChromeStatus(view.status)
  const modeNumber = ATMOSPHERIC_MODES.find((m) => m.id === view.mode)?.number ?? '—'

  return (
    <div
      className="obs-surface globe-page"
      data-platform={platform.kind}
      data-touch={platform.isTouch ? 'on' : 'off'}
    >
      <GlobeObsHud
        status={chromeStatus}
        label={view.label}
        unit={view.unit || null}
        range={view.range ? [view.range[0], view.range[1]] : null}
        leadHours={view.leadHours}
        nature={view.nature}
        motion={view.motion}
        source={view.source}
        validTime={view.validTime}
        mode={view.mode}
      />

      <section className="globe-stage">
        <div className="globe-stage-main">
          {webgl ? (
            <div
              className="globe-3d-shell"
              tabIndex={0}
              role="application"
              aria-label="Globe — arrow keys rotate, +/− zoom, 1–5 switch data mode, Esc clears the selection"
              onKeyDown={handleStageKeyDown}
            >
              <Suspense fallback={null}>
                <Globe3DScene interactiveCountries />
              </Suspense>
            </div>
          ) : (
            <GlobeFallback />
          )}

          <AtmosphericModeRail items={modeItems} onSelect={handleModeSelect} />
          <GlobeLegend />
        </div>

        <aside className="globe-stage-rail" aria-label="Observation deck controls">
          <AtmosphericEvidenceCard
            status={chromeStatus}
            statusLabel={STATUS_LABELS[view.status]}
            label={view.label}
            unit={view.unit || null}
            indexLabel={modeNumber}
            focus={focus}
            range={view.range ? [view.range[0], view.range[1]] : null}
            band={band ? { low: band.low, center: band.center, high: band.high } : null}
            dqssGrade={focus ? dqssScoreToGrade(focus.dqss) : null}
            mode={view.mode}
            uncertaintyMode={view.uncertainty === 'none' ? 'none' : 'band'}
            eventCoverage={view.eventCoverage}
            source={view.source}
            referenceTimeLabel={utcLabel(view.referenceTime)}
            validTimeLabel={utcLabel(view.validTime)}
            provenance={[...view.provenance]}
            coverage={view.coverage}
          />
          <GlobeLayerToggles />
          <GlobeTimeline />
        </aside>
      </section>

      <GlobeGridTooltip />
    </div>
  )
}
