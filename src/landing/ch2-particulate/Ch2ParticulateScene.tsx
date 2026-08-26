/**
 * Ch2ParticulateScene — the lazy-loaded module behind Chapter 2's canvas slot.
 * Adapted from AirLens-platform apps/landing-lab
 * `src/concepts/particulate/ParticulatePage.tsx` (Wave L2, 2026-08-26).
 *
 * Deviations from the source page:
 *
 *  - **Chrome dropped**: the source page owned `<SiteNav variant="sky">` and
 *    `<LoadingVeil>` (whole-page chrome) — both are landing-lab-only shell
 *    elements this chapter doesn't own (the flight page's own chrome covers
 *    it), same call Ch1's port made for `<SiteNav>`.
 *
 *  - **City switching is progress-driven, not click-driven**: the source page
 *    kept `idx` as click state (`useState`, driven by `<nav className="pt__strip">`
 *    chip buttons) — the reader picked a city and the field/readout/overlay
 *    re-rendered for it, with no relationship to scroll position at all. This
 *    chapter is one scroll-locked 140vh section of a 5-chapter flight (see
 *    `useChapterProgress` / `CameraRig.tsx` in Ch1 for the same shape of
 *    rewiring), so there is no click surface here — `progress` (0..1) is
 *    divided into `CITY_COUNT` equal segments and the active city advances
 *    automatically as the reader scrolls, the same "story ↔ scroll" contract
 *    every other chapter uses. The source's city list (50 TFT cities, sorted
 *    worst-air-first, browsable via the chip strip) is capped to the top
 *    `CITY_COUNT` here — cycling through all 50 in one 140vh chapter would
 *    make every city flash past in a couple of vh each; a curated "descent"
 *    through the `CITY_COUNT` thickest-air cities matches this chapter's
 *    "PARTICULATE — city descent" brief instead. The chip-strip nav component
 *    itself is dropped along with it (nothing to click inside a scroll-locked
 *    chapter); a small HUD line replaces it with the same "which city, out of
 *    how many" orientation the strip gave, echoing Ch1's `.ch1-hud` corner
 *    readout instead of a bespoke widget.
 *
 *  - **Error/loading vocabulary**: the source's bespoke `<ErrorPanel>` is
 *    replaced by this repo's shared `WfDataState`/`WfPlaceholder` (same
 *    swap Ch1AtmosScene.tsx made) — one "never a fabricated field" panel
 *    vocabulary across chapters instead of a one-off per chapter.
 *
 *  - **No separate "no WebGL at all" guard**: unlike Ch1 (whose scene is a
 *    WebGL-only globe with no non-WebGL path), PARTICULATE's `resolveFieldMode`
 *    already routes devices without a WebGL2 context straight to
 *    `FallbackField` — a plain Canvas2D renderer that needs no GL context at
 *    all. So the fallback path here *is* the "no WebGL2" guard; there is
 *    nothing further to gate before mounting.
 */
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { Canvas } from '@react-three/fiber'
import { useQuality } from '../shared/perf/QualityProvider'
import { useReducedMotion } from '../shared/perf/useReducedMotion'
import WfPlaceholder from '../../components/wireframe/WfPlaceholder'
import WfDataState from '../../components/wireframe/WfDataState'
import { dataState } from '../../types/dataState'
import { useParticulateData, usePlaces } from './useParticulateData'
import { resolveFieldMode } from './capability'
import FlowField from './scene/FlowField'
import FallbackField from './scene/FallbackField'
import Readout from './sections/Readout'
import Overlay from './sections/Overlay'
import type { ParticulateData, Place, Window } from './types'
import './ch2-particulate.css'

const LON_SPAN = 44 // degrees of longitude the field covers

/** How many of the (worst-air-first) cities this chapter's scroll descends through. */
const CITY_COUNT = 6

function useAspect(): number {
  const [aspect, setAspect] = useState(() =>
    typeof window === 'undefined' ? 1 : window.innerWidth / Math.max(window.innerHeight, 1),
  )
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onResize = () => setAspect(window.innerWidth / Math.max(window.innerHeight, 1))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return aspect
}

/** The lat/lon rectangle under the viewport, centred on the city and clamped to the poles. */
function makeWindow(place: Place, aspect: number): Window {
  const lonSpan = LON_SPAN
  const latSpan = Math.min(140, lonSpan / Math.max(aspect, 0.4))
  const lat0 = Math.max(-90, Math.min(90 - latSpan, place.lat - latSpan / 2))
  return { lon0: place.lon - lonSpan / 2, lat0, lonSpan, latSpan }
}

/** Mean PM2.5 across the window as a fraction of the grid cap — this drives the haze. */
function windowHaze(data: ParticulateData, win: Window): number {
  let sum = 0
  let n = 0
  for (let i = 0; i < 24; i++) {
    for (let j = 0; j < 16; j++) {
      const lon = win.lon0 + ((i + 0.5) / 24) * win.lonSpan
      const lat = win.lat0 + ((j + 0.5) / 16) * win.latSpan
      sum += data.pm25.sampleAt(lat, lon)
      n++
    }
  }
  return Math.min(1, sum / n / (data.pm25.meta.cap * 0.35))
}

export interface Ch2ParticulateSceneProps {
  /** rAF-throttled chapter progress (0..1) — drives which city is active. */
  progress: number
  /**
   * Always-current chapter progress ref — accepted for the same prop shape
   * `Ch1AtmosCanvasSlot`/`useChapterProgress` hand every chapter scene, but
   * unused here: city switching only needs the rAF-throttled `progress`
   * state (a discrete "which segment" read), not a per-frame ref — there is
   * no r3f `useFrame` in this scene reading scroll position directly (the
   * flow field's own `useFrame` reads `winRef`/`hazeRef`, not scroll).
   */
  progressRef: MutableRefObject<number>
}

export default function Ch2ParticulateScene({ progress }: Ch2ParticulateSceneProps) {
  const { tier } = useQuality()
  const reduced = useReducedMotion()
  const state = useParticulateData()
  const allPlaces = usePlaces(state.data)
  const places = useMemo(() => allPlaces.slice(0, CITY_COUNT), [allPlaces])
  const aspect = useAspect()

  const mode = useMemo(
    () => resolveFieldMode(tier, typeof window === 'undefined' ? '' : window.location.search),
    [tier],
  )

  const idx = places.length > 0 ? Math.min(places.length - 1, Math.floor(progress * CITY_COUNT)) : 0
  const place = places[idx] ?? null
  const win = useMemo(() => (place ? makeWindow(place, aspect) : null), [place, aspect])
  const haze = useMemo(() => (state.data && win ? windowHaze(state.data, win) : 0), [state.data, win])

  // The GPU field reads these every frame — a city switch (scroll into the next
  // segment) must not remount the sim, same contract the source's click-driven
  // switch relied on.
  const winRef = useRef<Window>({ lon0: 0, lat0: 0, lonSpan: LON_SPAN, latSpan: LON_SPAN })
  const hazeRef = useRef(0)
  useEffect(() => {
    if (win) winRef.current = win
    hazeRef.current = haze
  }, [win, haze])

  if (state.status === 'error') {
    // Never a fabricated field: the real reason lives in state.error (logged for
    // debugging); the honest, shared "no data" panel is what renders.
    console.error('[ch2-particulate] data load failed:', state.error)
    return (
      <div className="ch2-pt ch2-pt--fallback">
        <WfDataState state={dataState('error', { source: 'landing mirror snapshot' })} />
      </div>
    )
  }

  if (state.status === 'loading') {
    return (
      <div className="ch2-pt ch2-pt--fallback">
        <WfPlaceholder label="Loading the particulate field…" />
      </div>
    )
  }

  if (!place || !win) {
    // The lookup succeeded but returned no cities — an honest empty state, not a
    // silently blank stage.
    return (
      <div className="ch2-pt ch2-pt--fallback">
        <WfDataState state={dataState('empty', { source: 'landing mirror snapshot' })} />
      </div>
    )
  }

  const [windU, windV] = state.data.wind.sample(place.lat, place.lon)

  return (
    <div className="ch2-pt">
      <div className="ch2-pt__hud" aria-hidden="true">
        <span>AIRLENS · PARTICULATE</span>
        <span>
          CITY {idx + 1}/{places.length} · {place.name.toUpperCase()}
        </span>
      </div>

      {mode === 'gpu' && (
        <Canvas
          className="ch2-pt__canvas"
          dpr={[1, tier === 'high' ? 2 : 1.5]}
          gl={{ antialias: false, alpha: false }}
        >
          <FlowField data={state.data} tier={tier} winRef={winRef} hazeRef={hazeRef} paused={reduced} />
        </Canvas>
      )}
      {mode === 'fallback' && <FallbackField data={state.data} win={win} haze={haze} />}

      <Overlay topo={state.data.topo} win={win} place={place} windU={windU} windV={windV} />
      <div className="ch2-pt__scrim" aria-hidden="true" />

      <div className="ch2-pt__ui">
        <Readout
          place={place}
          snapshotMs={state.data.pm25.meta.timestamp}
          forecastIssuedAt={state.data.tft.generated_at}
          modelVersion={state.data.tft.model_version}
          mode={mode}
          animated={mode === 'gpu' && !reduced}
        />
      </div>
    </div>
  )
}
