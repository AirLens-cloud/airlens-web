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
import { Component, Suspense, lazy, useCallback, useEffect, useMemo, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { Vector3 } from 'three'
import { useShallow } from 'zustand/react/shallow'
import { useGlobeStore, type CompareSlot, type GlobeViewMode } from '../store/globeStore'
import { usePlatform } from '../hooks/usePlatform'
import { isWebGLSupported } from '../lib/webgl'
import { logger } from '../lib/logger'
import { GLOBE_CONFIG } from '../lib/config/globe'
import { TIMELINE_ENABLED } from '../lib/config/globeOverlays'
import { dqssScoreToGrade } from '../lib/config/globeOntology'
import { pm25ToGrade } from '../lib/globe/gradeColor'
import { ATMOSPHERIC_MODES } from '../lib/config/atmosphericModes'
import { fetchTimelineManifest } from '../api/timeline'
import { formatElapsed } from '../lib/home/whyNow'
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
import ViewModeSwitch, { type ViewModeSwitchItem } from '../components/globe/chrome/ViewModeSwitch'
import CompareTray from '../components/globe/chrome/CompareTray'
import GlobeMapView from '../components/globe/views/GlobeMapView'
import GlobeTableView from '../components/globe/views/GlobeTableView'
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

/**
 * "12m ago" / "3h ago" from a reference/valid time vs now — QUALITY section's
 * Freshness line (`evidence-rail-compare-tray.md` §4.1). `null` when there is
 * no time to measure against, which the card renders as "—", never "just now".
 */
/**
 * Thin wrapper over the shared `formatElapsed` (whyNow.ts) — this file's
 * own "since a timestamp" framing over that util's "already-elapsed ms"
 * one. Delegating avoids a 3rd reimplementation of the same age-label
 * logic (whyNow's `formatElapsed` / AqiCapsule's now-removed
 * `formatDataAge` were the other two).
 */
function freshnessLabel(sinceMs: number | null): string | null {
  if (sinceMs == null || !Number.isFinite(sinceMs)) return null
  return formatElapsed(Date.now() - sinceMs)
}

/**
 * Outer-Suspense loading/failure UI for the engine chunk (three/fiber +
 * everything it pulls in). This sits *above* `Globe3DScene`'s own Canvas, so
 * unlike its inner `LoadingFallback` mesh, this one has no WebGL context yet
 * to draw into — it is plain DOM/CSS (spin via `globe-stage.css`, honoring
 * `prefers-reduced-motion` the same way `.gobs-live-dot` and other ambient
 * chrome already do).
 *
 * 01-ux-audit.md §2 #1: the previous `fallback={null}` meant this stage was
 * a literal blank void for as long as the chunk took to fetch and parse —
 * "LOADING" text with nothing to look at reads as broken, not busy.
 */
function GlobeEngineFallback({
  variant,
  onOpenMap,
}: {
  /** 'loading' before the patience window, 'timeout' past it, 'error' when the chunk import rejected outright. */
  variant: 'loading' | 'timeout' | 'error'
  onOpenMap: () => void
}) {
  return (
    <div className="globe-engine-fallback" role="status" aria-live="polite">
      <div className="globe-engine-fallback-orb" aria-hidden="true" />
      <p className="globe-engine-fallback-label">
        {variant === 'error' ? 'UNAVAILABLE · engine failed to load' : 'Loading globe engine…'}
      </p>
      {variant !== 'loading' && (
        <button type="button" className="btn btn-ink globe-engine-fallback-cta" onClick={onOpenMap}>
          Open Map view
        </button>
      )}
    </div>
  )
}

/**
 * 8s patience window (04-motion-system.md loading scene spec): the skeleton
 * alone stays honest about "still arriving", but past 8s a stuck chunk fetch
 * (slow network, not a hard failure) deserves an escape hatch rather than an
 * indefinite spinner. The CTA is a click, never an auto-redirect — Globe
 * stays the default lens until the user says otherwise.
 */
function GlobeEngineLoadingGate({ onOpenMap }: { onOpenMap: () => void }) {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const id = window.setTimeout(() => setSlow(true), 8000)
    return () => window.clearTimeout(id)
  }, [])
  return <GlobeEngineFallback variant={slow ? 'timeout' : 'loading'} onOpenMap={onOpenMap} />
}

/**
 * Catches the engine chunk's `import()` rejecting (bad chunk hash after a
 * deploy, network failure mid-fetch) — the one failure mode `<Suspense>`
 * cannot express on its own, since a rejected lazy import throws past the
 * fallback rather than resolving to it. A class component because
 * `getDerivedStateFromError`/`componentDidCatch` have no hook equivalent.
 * Resets for free: Globe.tsx already unmounts this whole subtree whenever
 * `globeViewMode` leaves `'globe'`, so switching to Map/Table and back is
 * the natural "try again" path — no manual reset key needed.
 */
class GlobeEngineErrorBoundary extends Component<
  { onOpenMap: () => void; onEngineError: (reason: string) => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    this.props.onEngineError(error instanceof Error ? error.message : 'engine chunk failed to load')
  }

  render() {
    if (this.state.failed) {
      return <GlobeEngineFallback variant="error" onOpenMap={this.props.onOpenMap} />
    }
    return this.props.children
  }
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
  const selectedStation = useGlobeStore((s) => s.selectedStation)
  const globeViewMode = useGlobeStore((s) => s.globeViewMode)
  const setGlobeViewMode = useGlobeStore((s) => s.setGlobeViewMode)
  const compareSlots = useGlobeStore((s) => s.compareSlots)
  const pinCompareSlot = useGlobeStore((s) => s.pinCompareSlot)
  const removeCompareSlot = useGlobeStore((s) => s.removeCompareSlot)

  // Engine-chunk failure (01-ux-audit.md §2 #1, item 3): null until the
  // outer Suspense's error boundary actually catches an import() rejection.
  // Overrides the HUD/evidence-card status below rather than threading a
  // new status through `useAtmosphericViewModel` — this is a stage-loading
  // fact, not a data-freshness one, and doesn't own that hook's file.
  const [engineFailureReason, setEngineFailureReason] = useState<string | null>(null)
  const handleOpenMapFromEngineIssue = useCallback(
    (reason: 'slow-load' | 'engine-error') => setGlobeViewMode('map', reason),
    [setGlobeViewMode],
  )
  const handleOpenMapAfterTimeout = useCallback(
    () => handleOpenMapFromEngineIssue('slow-load'),
    [handleOpenMapFromEngineIssue],
  )
  const handleOpenMapAfterError = useCallback(
    () => handleOpenMapFromEngineIssue('engine-error'),
    [handleOpenMapFromEngineIssue],
  )

  // WebGL2 missing: Globe can never draw, so the switch redirects to Map once
  // rather than leaving the deck on a lens it cannot render. This runs only
  // when `webgl` changes (it's probe-cached for the component's lifetime, so
  // in practice once) — it must not fight a later manual switch, and it
  // never fires again after the first redirect.
  useEffect(() => {
    if (!webgl && useGlobeStore.getState().globeViewMode === 'globe') {
      setGlobeViewMode('map', 'webgl-fallback')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webgl])

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

  const viewModeItems = useMemo<ViewModeSwitchItem[]>(() => [
    { id: 'globe', label: 'GLOBE', disabled: !webgl, disabledReason: webgl ? undefined : 'WebGL2 is not supported in this environment' },
    { id: 'map', label: 'MAP' },
    { id: 'table', label: 'TABLE' },
  ], [webgl])

  const handleViewModeSelect = useCallback(
    (id: GlobeViewMode) => setGlobeViewMode(id, 'manual'),
    [setGlobeViewMode],
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
  // An engine-chunk failure outranks the data-freshness status the view
  // model computes — a caveat about stale grid data is moot when the stage
  // that would render it never mounted at all.
  const chromeStatus = engineFailureReason ? 'unavailable' : toChromeStatus(view.status)
  const hudLabel = engineFailureReason ? `UNAVAILABLE · ${engineFailureReason}` : view.label
  const evidenceStatusLabel = engineFailureReason ? `UNAVAILABLE · ${engineFailureReason}` : STATUS_LABELS[view.status]
  const modeNumber = ATMOSPHERIC_MODES.find((m) => m.id === view.mode)?.number ?? '—'

  // What "Pin current scene" would add to the Compare tray right now — every
  // focused reading this deck produces is a PM2.5 µg/m³ value, so the same
  // grade cut the grid snapshot's own ranking uses applies here too.
  const currentCompareSlot: CompareSlot | null = useMemo(() => {
    if (!focus || focus.value == null) return null
    return {
      id: selectedStation?.station_uid ?? `${view.mode}:${focus.label}:${view.validTime ?? 'now'}`,
      label: focus.label,
      value: focus.value,
      unit: focus.unit,
      layerLabel: view.label,
      timeLabel: view.validTime != null ? utcLabel(view.validTime) : 'NOW',
      grade: pm25ToGrade(focus.value),
      nature: view.nature,
    }
  }, [focus, selectedStation, view.mode, view.label, view.validTime, view.nature])

  const handlePinCurrent = useCallback(() => {
    if (currentCompareSlot) pinCompareSlot(currentCompareSlot)
  }, [currentCompareSlot, pinCompareSlot])

  return (
    <main
      className="obs-surface globe-page"
      data-platform={platform.kind}
      data-touch={platform.isTouch ? 'on' : 'off'}
    >
      <div className="fluid-enter" style={{ '--enter-i': 0 } as CSSProperties}>
        <GlobeObsHud
          status={chromeStatus}
          label={hudLabel}
          unit={engineFailureReason ? null : (view.unit || null)}
          range={view.range ? [view.range[0], view.range[1]] : null}
          leadHours={view.leadHours}
          nature={view.nature}
          motion={view.motion}
          source={view.source}
          validTime={view.validTime}
          mode={view.mode}
          cursor={selectedStation ? { lat: selectedStation.lat, lon: selectedStation.lon, label: selectedStation.name } : null}
        />
      </div>

      {/* T3: mode selection moved out of the left instrument rail into a HUD
          tab strip — same AtmosphericModeRail component (`orientation`
          controls the reflow), same store wiring, same 1-5 keyboard path
          (handleStageKeyDown below is unchanged). This is a pure position
          change: LAYERS/TIMELINE stay in `.globe-stage-left` since they're
          overlay controls, not the mode cursor. */}
      <div className="globe-mode-row">
        <AtmosphericModeRail items={modeItems} onSelect={handleModeSelect} orientation="horizontal" />
      </div>

      {/* Evidence row (T1): Layer 1 of the evidence card runs as one horizontal
          strip here instead of a vertical right-hand rail, with ViewModeSwitch
          docked to its right — see globe-stage.css ".globe-evidence-row". */}
      <div className="globe-evidence-row">
        <AtmosphericEvidenceCard
          status={chromeStatus}
          statusLabel={evidenceStatusLabel}
          label={view.label}
          unit={view.unit || null}
          indexLabel={modeNumber}
          focus={focus}
          range={view.range ? [view.range[0], view.range[1]] : null}
          band={band ? { low: band.low, center: band.center, high: band.high } : null}
          dqssGrade={focus?.dqssProvenance === 'measured' ? dqssScoreToGrade(focus.dqss) : null}
          mode={view.mode}
          uncertaintyMode={view.uncertainty === 'none' ? 'none' : 'band'}
          eventCoverage={view.eventCoverage}
          source={view.source}
          referenceTimeLabel={utcLabel(view.referenceTime)}
          validTimeLabel={utcLabel(view.validTime)}
          freshnessLabel={freshnessLabel(view.referenceTime ?? view.validTime)}
          provenance={[...view.provenance]}
          coverage={view.coverage}
        />
        <ViewModeSwitch mode={globeViewMode} items={viewModeItems} onSelect={handleViewModeSelect} />
      </div>

      <section className="globe-stage">
        <aside className="globe-stage-left" aria-label="Atmospheric layers and timeline">
          {/* T2: LAYERS defaults open, TIMELINE defaults collapsed — the
              timeline is a forecast-only aid, so collapsing it by default is
              the honest state for the common (non-forecast) session. */}
          <details className="globe-stage-left-controls" open>
            <summary>Layers</summary>
            <GlobeLayerToggles />
          </details>
          <details className="globe-stage-left-controls">
            <summary>Timeline</summary>
            <GlobeTimeline />
          </details>
        </aside>

        <div className="globe-stage-main">
          {globeViewMode === 'table' ? (
            <GlobeTableView />
          ) : globeViewMode === 'map' ? (
            <GlobeMapView />
          ) : (
            <>
              {webgl ? (
                <div
                  className="globe-3d-shell"
                  tabIndex={0}
                  role="application"
                  aria-label="Globe — arrow keys rotate, +/− zoom, 1–5 switch data mode, Esc clears the selection"
                  onKeyDown={handleStageKeyDown}
                >
                  <GlobeEngineErrorBoundary
                    onOpenMap={handleOpenMapAfterError}
                    onEngineError={setEngineFailureReason}
                  >
                    <Suspense fallback={<GlobeEngineLoadingGate onOpenMap={handleOpenMapAfterTimeout} />}>
                      <Globe3DScene interactiveCountries />
                    </Suspense>
                  </GlobeEngineErrorBoundary>
                </div>
              ) : (
                <GlobeFallback />
              )}

              <GlobeLegend />

              <CompareTray
                slots={compareSlots}
                currentSlot={currentCompareSlot}
                onPinCurrent={handlePinCurrent}
                onRemove={removeCompareSlot}
              />
            </>
          )}
        </div>
      </section>

      <GlobeGridTooltip />
    </main>
  )
}
