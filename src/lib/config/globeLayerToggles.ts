/**
 * The layer switches the Globe stage is allowed to offer.
 *
 * Membership rule (do not relax): an entry belongs here only if
 * `Globe3DScene` actually gates a mounted layer on that store flag. The store
 * was ported verbatim from the monorepo, so it still carries `showArcs`,
 * `showChoropleth`, `showSpikes` and `hdMode` — none of which have a renderer
 * in this repo (their layers are deferred with G3). A switch that changes
 * nothing on screen reads as a broken feature, not a missing one, so those
 * flags get no control here.
 *
 * When a deferred layer lands, add its row in the same commit as its renderer.
 */
import type { useGlobeStore } from '../../store/globeStore';

type GlobeState = ReturnType<typeof useGlobeStore.getState>;

/** Boolean layer flags on the store that have a renderer behind them. */
export type ToggleableLayerFlag = Extract<
  {
    [K in keyof GlobeState]: GlobeState[K] extends boolean ? K : never;
  }[keyof GlobeState],
  'showStations' | 'showPredictions' | 'showParticles' | 'showFires' | 'showPollen' | 'showGrid'
>;

export interface GlobeLayerToggleDef {
  flag: ToggleableLayerFlag;
  label: string;
  /** What is on screen when this is on — shown as the switch's secondary line. */
  detail: string;
}

export const GLOBE_LAYER_TOGGLES: readonly GlobeLayerToggleDef[] = [
  { flag: 'showStations', label: 'STATIONS', detail: 'Ground monitor readings' },
  { flag: 'showPredictions', label: 'PREDICTIONS', detail: 'Model cells with p10–p90' },
  { flag: 'showParticles', label: 'WIND', detail: 'GFS surface wind trails' },
  { flag: 'showFires', label: 'FIRES', detail: 'FIRMS hotspots + smoke' },
  { flag: 'showPollen', label: 'POLLEN', detail: 'CAMS pollen — Europe only' },
  { flag: 'showGrid', label: 'GRATICULE', detail: 'Lat/lon reference lines' },
];
