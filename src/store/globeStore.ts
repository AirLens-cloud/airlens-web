import { create } from 'zustand';
import { track } from '../lib/analytics';
import type { QualityTier, QualityPreset } from '../lib/adaptiveQuality';
import { detectQualityTier, getQualityPreset, persistQualityTier } from '../lib/adaptiveQuality';
import { GLOBE_SCENES } from '../lib/config/globeScenes';
import type { SensorType, StationAttribution, HoveredStation, SelectedCountry, DQSSProvenance, DataMode, OverlayType, ProjectionType, VisualizationType, ViewMode, VisualizationMode, ActivePanel, HUDStyle, NullschoolThemePreset, EarthStyle, AQDataSource, GridHoverInfo, FlyToTarget, WindLevel, WindFieldStatus, WindFieldMeta, SelectedPrediction, HoveredPrediction, FireCoverage, AtmosphericMode } from '../types/globe';
import type { TimelineFrameMeta } from '../api/timeline';
import type { PM25Grade } from '../types/data';

/** Which renderer the stage shows for the shared grid/mark payload — same cursor, three ways to read it. */
export type GlobeViewMode = 'globe' | 'map' | 'table';
/** Why the view switched — 'manual' is a user click, 'webgl-fallback' is the stage routing around a WebGL2 probe failure. */
export type ViewSwitchReason = 'manual' | 'webgl-fallback';

/**
 * A frozen snapshot of one selection pinned into the Compare tray. Values are
 * copied at pin time, not live-linked — comparing "then vs now" is the point.
 */
export interface CompareSlot {
  /** Stable identity for the pinned selection (station_uid / grid id / country code). */
  id: string;
  label: string;
  value: number | null;
  unit: string;
  layerLabel: string;
  timeLabel: string;
  grade: PM25Grade | null;
  /** Epistemic nature of the pinned reading — surfaces the "different data nature" warning (§4.2). */
  nature: string;
}

export interface SelectedStation {
  lat: number;
  lon: number;
  pm25: number;
  name?: string;
  p10?: number;       // model p10 (lower uncertainty bound)
  p90?: number;       // model p90 (upper uncertainty bound)
  dqss?: number;      // DQSS score 0–100
  dqss_provenance?: DQSSProvenance;  // 그 점수의 출처 (seed = 데모값, §5 Glass-box)
  source?: string;    // data source label
  // DQSS sub-scores (Glass-box AI decomposition)
  dqss_freshness?: number;
  dqss_completeness?: number;
  dqss_consistency?: number;
  dqss_stability?: number;
  dqss_model_residual?: number;
  // Station attribution and sensor type
  attribution?: StationAttribution[];
  sensor_type?: SensorType;
  station_uid?: string;
  // Plan-D — satellite/camera reliability (predictions.reliability_score /
  // .reliability_grade, populated by 00328). Optional so legacy markers
  // continue to work; surfaced via <ReliabilityBadge /> on every Tier.
  reliability_score?: number;
  reliability_grade?: 'very_high' | 'high' | 'medium' | 'low' | 'very_low';
}

export interface SelectedPolicy {
  countryCode: string;
  country: string;
  flag: string;
  lat: number;
  lon: number;
}

/** Provenance + value range of the currently-rendered overlay grid (Globe dashboard). */
export interface ActiveGridMeta {
  overlayType: OverlayType;
  source?: string;
  /** null when the source grid carries no timestamp (R-W2 — honest "unknown"). */
  timestamp: number | null;
  min: number;
  max: number;
  /** P8b timeline — forecast lead hours (0/undefined = analysis/live). */
  leadHours?: number;
  /** P8b timeline — validTime (ms) of the rendered frame. */
  validTime?: number;
  /** V-W3 — ISO model cycle of the rendered frame (undefined = live path, no frame). */
  cycle?: string;
}

interface GlobeStore {
  showStations: boolean;
  showCities: boolean;
  showDQSS: boolean;
  showPolicy: boolean;
  /** 자체 ML 예측 마커 레이어 (C1 — grid_latest.json). 기본 off (opt-in). */
  showPredictions: boolean;
  use3DTiles: boolean;
  showDotMap: boolean;
  showArcs: boolean;
  showSpikes: boolean;
  showForecast: boolean;
  showParticles: boolean;
  showPollen: boolean;
  showWindOverlay: boolean;
  showFires: boolean;
  /**
   * 화재 레이어가 실제로 보여주는 양 (탐지 → 발행 → 렌더 3단 절단).
   * FireHotspots 가 피드 로드 후 채운다. 로드 전/실패 시 null.
   */
  fireCoverage: FireCoverage | null;
  showOceanSST: boolean;
  /** Globe P5b — national PM2.5-standard-vs-WHO-guideline choropleth. */
  showChoropleth: boolean;
  showRealtimeGeohash: boolean;
  showHeatmap: boolean;
  heatmapSource: 'pm25' | 'prediction' | 'dqss';
  isPlaying: boolean;
  timeIndex: number;
  selectedStation: SelectedStation | null;
  selectedPolicy: SelectedPolicy | null;
  /** 선택된 예측 (관측소와 분리 — pointer 리스너 경합 회피 + §5 실측/예측 분리). */
  selectedPrediction: SelectedPrediction | null;
  hoveredPrediction: HoveredPrediction | null;
  qualityTier: QualityTier;
  qualityPreset: QualityPreset;
  // Phase A-C additions
  hoveredStation: HoveredStation | null;
  /** Grid cell hover readout (Globe stage tooltip) — 20Hz event, no track() */
  gridHover: GridHoverInfo | null;
  setGridHover: (g: GridHoverInfo | null) => void;
  viewCenterLocation: string | null;
  isLayerPanelExpanded: boolean;
  // Layer focus mode (legend UX)
  focusedLayer: string | null;
  setFocusedLayer: (key: string | null) => void;
  // Phase 1: Country grouping + click
  highlightedCountry: string | null;
  selectedCountry: SelectedCountry | null;
  setHighlightedCountry: (code: string | null) => void;
  setSelectedCountry: (c: SelectedCountry | null) => void;
  // Wave 19: search input + windy timeline drag
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  timeOffsetHours: number;
  setTimeOffsetHours: (h: number) => void;
  /** P8b timeline — resolved manifest frames (null = not loaded / unavailable). */
  timelineFrames: TimelineFrameMeta[] | null;
  /** P8b timeline — manifest stale (generatedAt > 12h) → slider disabled. */
  timelineStale: boolean;
  setTimeline: (frames: TimelineFrameMeta[] | null, stale: boolean) => void;
  /** P4 timeline playback — 재생 중 여부. stale/부재 데이터에선 절대 true 가 되지 않는다. */
  timelinePlaying: boolean;
  setTimelinePlaying: (playing: boolean) => void;
  /** P4 timeline playback — 배속 (1x / 2x). */
  timelineSpeed: 1 | 2;
  setTimelineSpeed: (speed: 1 | 2) => void;
  /** P6 이송 렌즈 — 흩어진 씨앗(농도색 파티클 + PM2.5 + 동적 화재 arc)을 하나의 의도된 모드로. */
  transportLens: boolean;
  setTransportLens: (v: boolean) => void;
  /** Camera fly-to request — consumed once by CameraController (search result / URL hydrate). */
  flyToTarget: FlyToTarget | null;
  setFlyToTarget: (t: FlyToTarget | null) => void;
  /** Globe P7b — active scene preset index (GLOBE_SCENES). null = no preset applied yet. */
  activeScene: number | null;
  /** Apply a GLOBE_SCENES preset — sets layer flags + overlay in one shot. */
  applyScene: (idx: number) => void;
  /** Apply one of the five evidence-led atmospheric modes as a real layer bundle. */
  setAtmosphericMode: (mode: AtmosphericMode) => void;
  /** Wave D — 5단계 DQSS 시각화. FPS 30 미만 시 자동 0 강하. */
  augmentationLevel: 0 | 1 | 2 | 3 | 4;
  setAugmentationLevel: (level: 0 | 1 | 2 | 3 | 4) => void;
  /** Globe dashboard — provenance/range of active overlay grid. */
  activeGridMeta: ActiveGridMeta | null;
  setActiveGridMeta: (m: ActiveGridMeta | null) => void;

  // ── Globe V2 (Three.js/R3F renderer) ──
  useNewGlobe: boolean;
  setUseNewGlobe: (v: boolean) => void;

  // ── Globe Visual Style ──
  hudStyle: HUDStyle;
  themePreset: NullschoolThemePreset;
  earthStyle: EarthStyle;
  aqDataSource: AQDataSource;
  setHudStyle: (v: HUDStyle) => void;
  setThemePreset: (v: NullschoolThemePreset) => void;
  setEarthStyle: (v: EarthStyle) => void;
  setAqDataSource: (v: AQDataSource) => void;

  // ── Wind altitude (P1) — only the levels we actually collect ──
  windLevel: WindLevel;
  windFieldStatus: WindFieldStatus;
  windFieldMeta: WindFieldMeta | null;
  setWindLevel: (v: WindLevel) => void;
  setWindFieldState: (status: WindFieldStatus, meta: WindFieldMeta | null) => void;

  // ── Earth Visualization (Nullschool + IQAir Clone) ──
  dataMode: DataMode;
  overlayType: OverlayType;
  projectionType: ProjectionType;
  visualizationType: VisualizationType;
  viewMode: ViewMode;
  visualizationMode: VisualizationMode;
  activePanel: ActivePanel;
  hdMode: boolean;
  showGrid: boolean;
  // Timeline
  currentTimestamp: number;
  playbackSpeed: 1 | 2 | 4;

  setDataMode: (v: DataMode) => void;
  setOverlayType: (v: OverlayType) => void;
  setProjectionType: (v: ProjectionType) => void;
  setVisualizationType: (v: VisualizationType) => void;
  setViewMode: (v: ViewMode) => void;
  setVisualizationMode: (v: VisualizationMode) => void;
  setActivePanel: (v: ActivePanel) => void;
  setHdMode: (v: boolean) => void;
  setShowGrid: (v: boolean) => void;
  setCurrentTimestamp: (v: number) => void;
  setPlaybackSpeed: (v: 1 | 2 | 4) => void;

  setLayerPanelExpanded: (v: boolean) => void;
  setShowStations: (v: boolean) => void;
  setShowCities: (v: boolean) => void;
  setShowDQSS: (v: boolean) => void;
  setShowPolicy: (v: boolean) => void;
  setShowPredictions: (v: boolean) => void;
  setSelectedPrediction: (p: SelectedPrediction | null) => void;
  setHoveredPrediction: (p: HoveredPrediction | null) => void;
  setUse3DTiles: (v: boolean) => void;
  setShowDotMap: (v: boolean) => void;
  setShowArcs: (v: boolean) => void;
  setShowSpikes: (v: boolean) => void;
  setShowForecast: (v: boolean) => void;
  setShowParticles: (v: boolean) => void;
  setShowPollen: (v: boolean) => void;
  setShowWindOverlay: (v: boolean) => void;
  setShowFires: (v: boolean) => void;
  setFireCoverage: (v: FireCoverage | null) => void;
  setShowOceanSST: (v: boolean) => void;
  setShowChoropleth: (v: boolean) => void;
  setShowRealtimeGeohash: (v: boolean) => void;
  setShowHeatmap: (v: boolean) => void;
  setHeatmapSource: (v: 'pm25' | 'prediction' | 'dqss') => void;
  setIsPlaying: (v: boolean) => void;
  setTimeIndex: (updater: number | ((prev: number) => number)) => void;
  setSelectedStation: (s: SelectedStation | null) => void;
  setSelectedPolicy: (p: SelectedPolicy | null) => void;
  setQualityTier: (tier: QualityTier) => void;
  setHoveredStation: (s: HoveredStation | null) => void;
  setViewCenterLocation: (v: string | null) => void;

  // ── ViewModeSwitch (Globe/Map/Table) ── named apart from the pre-existing
  // `viewMode`/`setViewMode` above (citizen/expert display density) — same
  // word, unrelated concept, so this one gets its own name to avoid clobbering it.
  globeViewMode: GlobeViewMode;
  setGlobeViewMode: (mode: GlobeViewMode, reason?: ViewSwitchReason) => void;

  // ── Compare tray — max 2 pinned slots, A then B ──
  compareSlots: readonly [CompareSlot | null, CompareSlot | null];
  pinCompareSlot: (slot: CompareSlot) => void;
  removeCompareSlot: (index: 0 | 1) => void;
}

const _initialTier = detectQualityTier();

/**
 * Ported verbatim from the monorepo, so the flag set is wider than the layers
 * that exist here. `showArcs` (DataArcs / TransportLens), `showChoropleth`
 * (SDID choropleth) and `hdMode` (Bloom postprocessing) have **no renderer in
 * this repo yet** — their layers are deferred to G3. The flags stay so the
 * store does not fork from its source, but any layer-toggle UI must not offer
 * a control for them: a switch that changes nothing reads as a broken feature,
 * not a missing one. Re-check this list when a deferred layer lands.
 */
export const useGlobeStore = create<GlobeStore>((set, get) => ({
  showStations: true,
  showCities: false,
  showDQSS: false,
  showPolicy: false,
  showPredictions: false,
  use3DTiles: false,
  showDotMap: false,
  showArcs: true,
  showSpikes: false,
  showForecast: false,
  showParticles: true,
  showPollen: true,
  showWindOverlay: true,
  showFires: false,
  fireCoverage: null,
  showOceanSST: false,
  showChoropleth: false,
  showRealtimeGeohash: false,
  showHeatmap: true,
  heatmapSource: 'pm25',
  isPlaying: false,
  timeIndex: 6,
  selectedStation: null,
  selectedPolicy: null,
  selectedPrediction: null,
  hoveredPrediction: null,
  qualityTier: _initialTier,
  qualityPreset: getQualityPreset(_initialTier),
  hoveredStation: null,
  gridHover: null,
  setGridHover: (g) => set({ gridHover: g }),
  viewCenterLocation: null,
  isLayerPanelExpanded: true,
  focusedLayer: null,
  setFocusedLayer: (key) => {
    set((state) => ({ focusedLayer: state.focusedLayer === key ? null : key }));
    if (key) track('globe_layer_focused', { layer: key });
  },
  highlightedCountry: null,
  selectedCountry: null,
  setHighlightedCountry: (code) => set({ highlightedCountry: code }),
  setSelectedCountry: (c) => {
    set({ selectedCountry: c, highlightedCountry: c?.code ?? null });
    if (c) track('globe_country_clicked', { countryCode: c.code });
  },
  searchQuery: '',
  setSearchQuery: (q) => set({ searchQuery: q }),
  timeOffsetHours: 0,
  setTimeOffsetHours: (h) => set({ timeOffsetHours: Math.max(-24, Math.min(24, h)) }),
  timelineFrames: null,
  timelineStale: false,
  setTimeline: (frames, stale) => set({ timelineFrames: frames, timelineStale: stale }),
  timelinePlaying: false,
  setTimelinePlaying: (playing) => {
    // 데이터가 없거나 stale 이면 재생 자체를 허용하지 않는다 — 가짜 예보 애니메이션 금지.
    const { timelineFrames, timelineStale } = get();
    const canPlay = !!timelineFrames && timelineFrames.length > 0 && !timelineStale;
    const next = playing && canPlay;
    if (next !== get().timelinePlaying) {
      set({ timelinePlaying: next });
      if (next) track('globe_timeline_play', { speed: get().timelineSpeed });
    }
  },
  timelineSpeed: 1,
  setTimelineSpeed: (speed) => set({ timelineSpeed: speed }),
  transportLens: false,
  setTransportLens: (v) => {
    if (v) {
      // 진입 = 흩어진 씨앗을 하나의 의도된 모드로. 경쟁 면색장(코로플레스)·무관 파티클(꽃가루)은
      // 실제로 끈다 — 가짜 dim 이 아니라 레이어를 진짜 언마운트한다. activeScene 을 비워 씬 UI 와
      // 상호배타(applyScene 이 transportLens 를 끄는 것과 대칭 — 둘이 동시에 "활성"으로 보이지 않게).
      set({
        transportLens: true,
        activeScene: null,
        overlayType: 'pm25',
        showParticles: true,
        showArcs: true,
        showChoropleth: false,
        showPollen: false,
      });
      track('globe_transport_lens', { on: true });
    } else {
      set({ transportLens: false });
      track('globe_transport_lens', { on: false });
    }
  },
  flyToTarget: null,
  setFlyToTarget: (t) => set({ flyToTarget: t }),
  activeScene: null,
  applyScene: (idx) => {
    const scene = GLOBE_SCENES[idx]
    if (!scene) return
    set({
      activeScene: idx,
      transportLens: false, // 씬 선택은 이송 렌즈 모드를 벗어난다 (상호배타 — globe P6)
      showGrid: scene.layers.grid,
      showParticles: scene.layers.wind,
      showFires: scene.layers.fires,
      showArcs: scene.layers.arcs,
      showStations: scene.layers.stations,
      showChoropleth: scene.layers.choropleth,
      ...(scene.overlay ? { overlayType: scene.overlay as OverlayType } : {}),
    })
    track('globe_scene_applied', { scene: scene.key })
  },
  setAtmosphericMode: (mode) => {
    const state = get()
    const sceneIndex = (key: string) => GLOBE_SCENES.findIndex((scene) => scene.key === key)
    const nextForecastFrame = mode === 'forecast'
      ? state.timelineFrames
        ?.filter((frame) => frame.offsetHours > 0)
        .sort((a, b) => a.offsetHours - b.offsetHours)[0]
      : null

    // A disabled/unavailable forecast is a strict no-op, including playback.
    if (mode === 'forecast' && (!nextForecastFrame || state.timelineStale)) return

    // A mode switch owns playback, selection, and the time axis. Hidden
    // selections must not relabel a fire or policy surface as a station.
    state.setTimelinePlaying(false)
    set({
      selectedStation: null,
      selectedPrediction: null,
      selectedPolicy: null,
      selectedCountry: null,
      highlightedCountry: null,
    })

    if (mode === 'forecast' && nextForecastFrame) {
      state.applyScene(sceneIndex('aq'))
      state.setShowStations(false)
      state.setTimeOffsetHours(nextForecastFrame.offsetHours)
    } else if (mode === 'events') {
      state.setTimeOffsetHours(0)
      state.applyScene(sceneIndex('fire'))
    } else if (mode === 'transport') {
      state.setTimeOffsetHours(0)
      state.setTransportLens(true)
    } else if (mode === 'policy') {
      state.setTimeOffsetHours(0)
      state.applyScene(sceneIndex('policy'))
    } else {
      state.setTimeOffsetHours(0)
      state.applyScene(sceneIndex('aq'))
      state.setShowStations(true)
    }

    track('globe_atmospheric_mode', { mode })
  },
  augmentationLevel: 0,
  setAugmentationLevel: (level) => set({ augmentationLevel: level }),
  activeGridMeta: null,
  setActiveGridMeta: (m) => set({ activeGridMeta: m }),

  // ── Globe V2 (Three.js/R3F renderer) ──
  useNewGlobe: true,
  setUseNewGlobe: (v) => { set({ useNewGlobe: v }); track('globe_v2_toggled', { enabled: v }); },

  // ── Globe Visual Style ──
  hudStyle: 'nullschool',
  themePreset: 'windy',
  earthStyle: 'pointcloud',
  aqDataSource: 'open-meteo',
  setHudStyle: (v) => { set({ hudStyle: v }); track('globe_hud_style', { style: v }); },
  setThemePreset: (v) => { set({ themePreset: v }); track('globe_theme_preset', { preset: v }); },
  setEarthStyle: (v) => { set({ earthStyle: v }); track('globe_earth_style', { style: v }); },
  setAqDataSource: (v) => { set({ aqDataSource: v }); track('globe_aq_source', { source: v }); },

  // ── Wind altitude (P1) ──
  windLevel: 'surface',
  windFieldStatus: 'loading',
  windFieldMeta: null,
  setWindLevel: (v) => { set({ windLevel: v }); track('globe_wind_level', { level: v }); },
  setWindFieldState: (status, meta) => set({ windFieldStatus: status, windFieldMeta: meta }),

  // ── Earth Visualization (Nullschool + IQAir Clone) ──
  dataMode: 'air',
  overlayType: 'none',
  projectionType: 'orthographic',
  visualizationType: 'wind',
  viewMode: 'citizen',
  visualizationMode: 'heatmap',
  activePanel: null,
  hdMode: false,
  showGrid: true,
  currentTimestamp: Date.now(),
  playbackSpeed: 1,

  setDataMode: (v) => { set({ dataMode: v }); track('globe_data_mode', { mode: v }); },
  setOverlayType: (v) => { set({ overlayType: v }); track('globe_overlay_type', { overlay: v }); },
  setProjectionType: (v) => { set({ projectionType: v }); track('globe_projection', { projection: v }); },
  setVisualizationType: (v) => { set({ visualizationType: v }); track('globe_visualization_type', { type: v }); },
  setViewMode: (v) => { set({ viewMode: v }); track('globe_view_mode', { mode: v }); },
  setVisualizationMode: (v) => {
    set({
      visualizationMode: v,
      showHeatmap: v === 'heatmap',
      showSpikes: v === 'spikes',
      showDotMap: v === 'dotmap',
    });
    track('globe_visualization_mode', { mode: v });
  },
  setActivePanel: (v) => set({ activePanel: v }),
  setHdMode: (v) => { set({ hdMode: v }); track('globe_hd_mode', { enabled: v }); },
  setShowGrid: (v) => { set({ showGrid: v }); track('globe_grid', { enabled: v }); },
  setCurrentTimestamp: (v) => set({ currentTimestamp: v }),
  setPlaybackSpeed: (v) => { set({ playbackSpeed: v }); track('globe_playback_speed', { speed: v }); },

  setLayerPanelExpanded: (v) => set({ isLayerPanelExpanded: v }),
  setShowStations: (v) => { set({ showStations: v }); track('globe_layer_toggled', { layer: 'stations', enabled: v }); },
  setShowCities: (v) => { set({ showCities: v }); track('globe_layer_toggled', { layer: 'cities', enabled: v }); },
  setShowDQSS: (v) => { set({ showDQSS: v }); track('globe_layer_toggled', { layer: 'dqss', enabled: v }); },
  setShowPolicy: (v) => { set({ showPolicy: v }); track('globe_layer_toggled', { layer: 'policy', enabled: v }); },
  setShowPredictions: (v) => {
    // 레이어를 끄면 선택/호버도 비운다 — 언마운트된 레이어의 패널/툴팁이 유령처럼 남지 않게.
    set(v ? { showPredictions: true } : { showPredictions: false, selectedPrediction: null, hoveredPrediction: null });
    track('globe_layer_toggled', { layer: 'predictions', enabled: v });
  },
  setSelectedPrediction: (p) => { set({ selectedPrediction: p }); if (p) track('globe_prediction_clicked', { name: p.name, p50: p.p50 }); },
  setHoveredPrediction: (p) => set({ hoveredPrediction: p }),
  setUse3DTiles: (v) => { set({ use3DTiles: v }); track('globe_layer_toggled', { layer: '3d-tiles', enabled: v }); },
  setShowDotMap: (v) => { set({ showDotMap: v }); track('globe_layer_toggled', { layer: 'dot-map', enabled: v }); },
  setShowArcs: (v) => { set({ showArcs: v }); track('globe_layer_toggled', { layer: 'data-arcs', enabled: v }); },
  setShowSpikes: (v) => { set({ showSpikes: v }); track('globe_layer_toggled', { layer: 'aq-spikes', enabled: v }); },
  setShowForecast: (v) => { set({ showForecast: v }); track('globe_layer_toggled', { layer: 'forecast', enabled: v }); },
  setShowParticles: (v) => { set({ showParticles: v }); track('globe_layer_toggled', { layer: 'particles', enabled: v }); },
  setShowPollen: (v) => { set({ showPollen: v }); track('globe_layer_toggled', { layer: 'pollen', enabled: v }); },
  setShowWindOverlay: (v) => { set({ showWindOverlay: v }); track('globe_layer_toggled', { layer: 'wind-overlay', enabled: v }); },
  setShowFires: (v) => { set({ showFires: v }); track('globe_layer_toggled', { layer: 'fires', enabled: v }); },
  setFireCoverage: (v) => set({ fireCoverage: v }),
  setShowOceanSST: (v) => { set({ showOceanSST: v }); track('globe_layer_toggled', { layer: 'ocean-sst', enabled: v }); },
  setShowChoropleth: (v) => { set({ showChoropleth: v }); track('globe_layer_toggled', { layer: 'choropleth', enabled: v }); },
  setShowRealtimeGeohash: (v) => { set({ showRealtimeGeohash: v }); track('globe_layer_toggled', { layer: 'realtime-geohash', enabled: v }); },
  setShowHeatmap: (v) => { set({ showHeatmap: v }); track('globe_layer_toggled', { layer: 'heatmap', enabled: v }); },
  setHeatmapSource: (v) => { set({ heatmapSource: v }); track('globe_heatmap_source', { source: v }); },
  setIsPlaying: (v) => set({ isPlaying: v }),
  setTimeIndex: (updater) =>
    set((state) => ({
      timeIndex: typeof updater === 'function' ? updater(state.timeIndex) : updater,
    })),
  setSelectedStation: (s) => { set({ selectedStation: s }); if (s) track('globe_station_clicked', { name: s.name, pm25: s.pm25 }); },
  setSelectedPolicy: (p) => { set({ selectedPolicy: p }); if (p) track('globe_policy_clicked', { countryCode: p.countryCode }); },
  setQualityTier: (tier) => {
    set({ qualityTier: tier, qualityPreset: getQualityPreset(tier) });
    track('globe_quality_changed', { tier });
    // Write-through so an FPS-governor downgrade (or manual override) is the
    // next visit's starting tier, not a fresh probe that re-thrashes back up.
    persistQualityTier(tier);
  },
  setHoveredStation: (s) => set({ hoveredStation: s }),
  setViewCenterLocation: (v) => set({ viewCenterLocation: v }),

  // ── ViewModeSwitch (Globe/Map/Table) ──
  globeViewMode: 'globe',
  setGlobeViewMode: (mode, reason = 'manual') => {
    const from = get().globeViewMode;
    if (from === mode) return;
    set({ globeViewMode: mode });
    track('globe_view_switch', { from, to: mode, reason });
  },

  // ── Compare tray ──
  compareSlots: [null, null],
  pinCompareSlot: (slot) => {
    set((state) => {
      const [a, b] = state.compareSlots;
      // First empty slot wins; with both full, a fresh pin replaces B so A
      // (usually the scene the user is actively looking at) stays put.
      if (!a) return { compareSlots: [slot, b] };
      return { compareSlots: [a, slot] };
    });
    track('evidence_compare_add', { id: slot.id });
    track('globe_compare_opened', {});
  },
  removeCompareSlot: (index) => {
    set((state) => {
      const next: [CompareSlot | null, CompareSlot | null] = [...state.compareSlots];
      next[index] = null;
      return { compareSlots: next };
    });
    track('evidence_compare_remove', { slot: index === 0 ? 'a' : 'b' });
  },
}));
