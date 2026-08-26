// Ported verbatim (TIME_SCALE/DECAY tuning constants and every comment below
// unchanged) from AirLens-platform apps/landing-lab
// `src/concepts/particulate/scene/FlowField.tsx` (Wave L2, 2026-08-26).
// Deviations from the source:
//  - `theme/config` import rebound to this chapter's local `../theme`
//    (PARTICULATE/SKY_RAMPS), same seam Ch1's `AtmosScene.tsx` uses.
//  - `shaders` import rebound to `../shaders` (one directory shallower here).
//  - `React.MutableRefObject<...>` prop types (used bare, no `React` import,
//    in the source) rewritten as an explicit `import type { MutableRefObject }`
//    — this repo's other r3f files (Ch1's CameraRig.tsx etc.) always import
//    the type rather than reaching for the global `React` namespace, and TS
//    strict mode here doesn't have that namespace ambiently available.
//
// `react-hooks/immutability` is disabled file-wide: this is r3f's standard
// GPU-simulation pattern — `useMemo` builds the trail render targets and
// shader materials once per (trailW, trailH) key, and `useFrame` mutates
// `advectMat`/`compositeMat` uniforms and swaps the trail render targets in
// place every frame on purpose (see the comments throughout this file for
// why: rebuilding either on every render would be a shader recompile,
// measured at 160-270ms of long-task in the source). Same documented
// r3f/React-Compiler incompatibility as Ch1's WindParticles.tsx/HotspotProjector.tsx.
/* eslint-disable react-hooks/immutability */
import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { ParticulateData, Window } from '../types'
import type { QualityTier } from '../../shared/perf/types'
import { PARTICULATE, SKY_RAMPS } from '../theme'
import { advectFrag, compositeFrag, quadVert } from '../shaders'

// Wall-clock → sim-clock. This is large on purpose and it is not a cheat: a 2.6 m/s
// surface wind needs *weeks* to cross a 44° window, so at 1× the field is a frozen
// stipple (measured: 0.08 px of drift per frame — under one texel, so no streak ever
// forms). At 120,000× each second of watching is ~33 h of drift, which puts the motion
// at ~1.2 px/frame and lets the streaks read. The multiplier is printed in the UI.
export const TIME_SCALE = 120_000

/** Hours of simulated drift per second of wall clock — what TIME_SCALE means to a human. */
export const HOURS_PER_SECOND = TIME_SCALE / 3600

const DECAY = 1.0 // trail half-life ≈ 0.69 s → a streak ~40 frames long
const SEED_RATE = 0.0018 // baseline births per pixel per frame (before the PM2.5 term)

/** Trail buffer scale, relative to the drawing buffer. */
const TRAIL_SCALE: Record<QualityTier, number> = { high: 0.75, medium: 0.5, low: 0.4 }

const col = (hex: string) => new THREE.Color(hex)

function pmTexture(pm: ParticulateData['pm25']): THREE.DataTexture {
  const t = new THREE.DataTexture(pm.data, pm.meta.nLon, pm.meta.nLat, THREE.RedFormat, THREE.UnsignedByteType)
  t.magFilter = THREE.LinearFilter
  t.minFilter = THREE.LinearFilter
  t.wrapS = THREE.RepeatWrapping
  t.unpackAlignment = 1
  t.needsUpdate = true
  return t
}

// Half-float: the advection samples a 10° GFS grid per pixel, so it needs *filtered*
// wind — and linear filtering of a 32-bit float texture is not core WebGL2 (it needs
// OES_texture_float_linear). RG16F is filterable in core WebGL2 and still far exceeds
// the precision this data is measured to.
function windTexture(wind: ParticulateData['wind']): THREE.DataTexture {
  const { nx, ny } = wind.header
  const data = new Uint16Array(nx * ny * 2)
  for (let i = 0; i < nx * ny; i++) {
    data[i * 2] = THREE.DataUtils.toHalfFloat(wind.u[i] ?? 0)
    data[i * 2 + 1] = THREE.DataUtils.toHalfFloat(wind.v[i] ?? 0)
  }
  const t = new THREE.DataTexture(data, nx, ny, THREE.RGFormat, THREE.HalfFloatType)
  t.magFilter = THREE.LinearFilter
  t.minFilter = THREE.LinearFilter
  t.wrapS = THREE.RepeatWrapping
  t.needsUpdate = true
  return t
}

// The trail is an 8-bit single-channel buffer on purpose: it is filterable everywhere
// (the back-trace samples between texels), and 256 levels of "how much air passed here"
// is more than the eye resolves through the sky behind it.
function makeTrail(w: number, h: number): THREE.WebGLRenderTarget {
  return new THREE.WebGLRenderTarget(w, h, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false,
  })
}

/** The world-sampling uniforms both passes share. */
function fieldUniforms(data: ParticulateData) {
  const m = data.pm25.meta
  const { nx, ny, lo1, la1, dx, dy } = data.wind.header
  return {
    uPmTex: { value: pmTexture(data.pm25) },
    uWindTex: { value: windTexture(data.wind) },
    uWin: { value: new THREE.Vector4(0, 0, 1, 1) },
    uWindOrigin: { value: new THREE.Vector2(lo1, la1) },
    uWindSpan: { value: new THREE.Vector2(nx * dx, (ny - 1) * dy) },
    uPmOrigin: { value: new THREE.Vector2(m.lonMin, m.latMin) },
    uPmSpan: { value: new THREE.Vector2(m.nLon * m.dLon, m.nLat * m.dLat) },
  }
}

interface Props {
  data: ParticulateData
  tier: QualityTier
  /** Live window (SW corner + span) — mutated by the page, read every frame. */
  winRef: MutableRefObject<Window>
  /** Window mean PM2.5 as a fraction of the grid cap; drives the haze. */
  hazeRef: MutableRefObject<number>
  paused: boolean
}

export default function FlowField({ data, tier, winRef, hazeRef, paused }: Props) {
  const { gl, size } = useThree()

  const shared = useMemo(() => fieldUniforms(data), [data])

  // Keyed on *numbers*, not on the size object: R3F hands back a fresh `size` identity on
  // re-render, and memoising the targets on it rebuilt both render targets and both
  // ShaderMaterials on every city click — a shader recompile, measured at 160-270 ms of
  // long-task each. The window changes every click; the buffers must not.
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const trailW = Math.max(2, Math.round(size.width * dpr * TRAIL_SCALE[tier]))
  const trailH = Math.max(2, Math.round(size.height * dpr * TRAIL_SCALE[tier]))

  const trails = useMemo(
    () => [makeTrail(trailW, trailH), makeTrail(trailW, trailH)] as const,
    [trailW, trailH],
  )

  const simScene = useMemo(() => new THREE.Scene(), [])
  const simCamera = useMemo(() => new THREE.Camera(), [])

  const advectMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: quadVert,
        fragmentShader: advectFrag,
        uniforms: {
          ...shared,
          uPrev: { value: trails[0].texture },
          uDt: { value: 0 },
          uTimeScale: { value: TIME_SCALE },
          uDecay: { value: DECAY },
          uTime: { value: 0 },
          uSeedRate: { value: SEED_RATE },
        },
      }),
    [shared, trails],
  )

  const compositeMat = useMemo(() => {
    const r = SKY_RAMPS.dusk
    return new THREE.ShaderMaterial({
      vertexShader: quadVert,
      fragmentShader: compositeFrag,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        ...shared,
        uTrail: { value: trails[0].texture },
        uRamp0: { value: col(r[0]) },
        uRamp1: { value: col(r[1]) },
        uRamp2: { value: col(r[2]) },
        uRamp3: { value: col(r[3]) },
        uVeil: { value: col(PARTICULATE.veil) },
        uClean: { value: col(PARTICULATE.clean) },
        uWarm: { value: col(PARTICULATE.warm) },
        uHot: { value: col(PARTICULATE.hot) },
        uHaze: { value: 0 },
        uTime: { value: 0 },
        uAspect: { value: 1 },
        uIntro: { value: 0 },
      },
    })
  }, [shared, trails])

  useEffect(() => {
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), advectMat)
    simScene.add(quad)
    return () => {
      simScene.remove(quad)
      quad.geometry.dispose()
    }
  }, [simScene, advectMat])

  useEffect(() => {
    compositeMat.uniforms.uAspect.value = size.width / Math.max(size.height, 1)
  }, [compositeMat, size])

  // Two lifetimes, two effects. The trails and materials are rebuilt whenever the canvas
  // resizes; the PM2.5/wind textures live as long as `data`. Disposing all of them on the
  // resize key freed textures that the *new* materials had just bound. It does not black
  // the field out (three re-uploads a disposed DataTexture from its retained image on the
  // next render — measured), but it throws away and re-uploads both textures on every
  // resize, and it only survives by accident. Free each thing on the key that owns it.
  useEffect(
    () => () => {
      trails[0].dispose()
      trails[1].dispose()
      advectMat.dispose()
      compositeMat.dispose()
    },
    [trails, advectMat, compositeMat],
  )

  useEffect(
    () => () => {
      shared.uPmTex.value.dispose()
      shared.uWindTex.value.dispose()
    },
    [shared],
  )

  const swap = useRef(0)
  const intro = useRef(0)
  const settled = useRef(0)

  useFrame((_state, delta) => {
    const dt = Math.min(delta, 1 / 30)
    const w = winRef.current

    advectMat.uniforms.uWin.value.set(w.lon0, w.lat0, w.lonSpan, w.latSpan)
    compositeMat.uniforms.uWin.value.set(w.lon0, w.lat0, w.lonSpan, w.latSpan)

    intro.current = paused ? 1 : Math.min(1, intro.current + dt / 1.4)
    compositeMat.uniforms.uIntro.value = intro.current
    compositeMat.uniforms.uTime.value += paused ? 0 : dt
    compositeMat.uniforms.uHaze.value +=
      (hazeRef.current - compositeMat.uniforms.uHaze.value) * Math.min(1, dt * 2.5)

    // Reduced motion: seed the trail once (a still frame of the same air), then stop.
    const advectSteps = paused ? (settled.current < 1 ? 1 : 0) : 1
    for (let i = 0; i < advectSteps; i++) {
      const read = trails[swap.current]
      const write = trails[1 - swap.current]
      advectMat.uniforms.uPrev.value = read.texture
      advectMat.uniforms.uDt.value = paused ? 0 : dt
      advectMat.uniforms.uTime.value += paused ? 1 : dt

      const prev = gl.getRenderTarget()
      gl.setRenderTarget(write)
      gl.render(simScene, simCamera)
      gl.setRenderTarget(prev)

      swap.current = 1 - swap.current
      compositeMat.uniforms.uTrail.value = write.texture
      settled.current++
    }
  })

  return (
    <mesh renderOrder={0} frustumCulled={false} material={compositeMat}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  )
}
