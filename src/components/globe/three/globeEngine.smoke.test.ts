/**
 * Globe engine module-graph smoke (G1 landing gate).
 *
 * This is deliberately NOT a render test: `<Canvas>` asks jsdom for a WebGL
 * context, jsdom has none, and three throws before any of our code runs — a
 * "mount" test here would only ever assert that jsdom lacks a GPU. What it does
 * instead is import the engine the way the scene does at runtime (the scene
 * module plus every lazily-imported layer) and assert each resolves to a
 * component. That is the part typecheck cannot prove: an import that type-checks
 * against a `.ts` file but fails to resolve at runtime — a stale relative path,
 * a barrel that no longer exists, a worker URL, a package that was only ever
 * hoisted — fails here.
 *
 * The layer list mirrors `Globe3DScene`'s `lazy(...)` calls. Adding a layer to
 * the scene without adding it here leaves that import unexercised.
 */
import { describe, it, expect } from 'vitest'

const SCENE_MODULES: Record<string, () => Promise<{ default: unknown }>> = {
  Globe3DScene: () => import('./Globe3DScene'),
  Atmosphere: () => import('./Atmosphere'),
  OceanSphere: () => import('./OceanSphere'),
  CountryClickHandler: () => import('./CountryClickHandler'),
  CameraController: () => import('./CameraController'),
  CountryExtrude: () => import('./layers/CountryExtrude'),
  WindParticles: () => import('./layers/WindParticles'),
  AlertPulse: () => import('./layers/AlertPulse'),
  StationLabels: () => import('./layers/StationLabels'),
  PredictionMarkers: () => import('./layers/PredictionMarkers'),
  CoastlineOutlines: () => import('./layers/CoastlineOutlines'),
  Graticule: () => import('./layers/Graticule'),
  ScalarFieldOverlay: () => import('./layers/ScalarFieldOverlay'),
  FireHotspots: () => import('./layers/FireHotspots'),
  SmokeEmitter: () => import('./layers/SmokeEmitter'),
  PollenParticles: () => import('./layers/PollenParticles'),
  CountryLabels: () => import('./layers/CountryLabels'),
}

describe('Globe engine module graph', () => {
  for (const [name, load] of Object.entries(SCENE_MODULES)) {
    it(`${name} resolves to a component`, async () => {
      const mod = await load()
      expect(typeof mod.default).toBe('function')
    })
  }
})

describe('Globe engine wiring', () => {
  it('the scene reads only layer flags the store actually defines', async () => {
    // A flag the scene reads but the store never sets renders as permanently
    // off, silently. `showArcs` / `showChoropleth` are intentionally absent
    // from this list: their layers are deferred, so the scene must not read them.
    const { useGlobeStore } = await import('../../../store/globeStore')
    const state = useGlobeStore.getState() as unknown as Record<string, unknown>
    for (const flag of [
      'showParticles',
      'showStations',
      'showGrid',
      'showPollen',
      'showFires',
      'showPredictions',
    ]) {
      expect(typeof state[flag], flag).toBe('boolean')
    }
    expect(state.qualityPreset).toBeTypeOf('object')
    expect(typeof state.overlayType).toBe('string')
  })

  it('the fire feed path comes from the ontology, not a literal', async () => {
    const { feedPipeline } = await import('../../../lib/config/globeOntology')
    const fire = feedPipeline('fire-points')
    // Verified against the HF dataset tree on 2026-08-26 — the object exists at
    // this path on `Robeedau/airlens-live`. A rename upstream must break here.
    expect(fire.storagePath).toBe('wind-data/active-fires.json')
  })
})
