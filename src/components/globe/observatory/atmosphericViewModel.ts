/**
 * atmosphericViewModel — derives every observatory readout (HUD strip, mode
 * rail state, evidence card) from one store snapshot, so the label a user
 * reads and the layer actually rendered cannot drift apart.
 *
 * Ported from AirLens-platform
 * `apps/web/src/components/globe/observatory/atmosphericViewModel.ts`.
 * Only the import paths changed (`../../../types` → `../../../types/globe`);
 * the derivation itself is verbatim, including the Glass-box branches that
 * return honest-empty values rather than inventing a number.
 */
import type { ActiveGridMeta, SelectedStation } from '../../../store/globeStore'
import type {
  AtmosphericMode,
  DQSSProvenance,
  DQSSPartialDetail,
  FireCoverage,
  OverlayType,
  SelectedCountry,
  SelectedPrediction,
  WindFieldMeta,
  WindFieldStatus,
} from '../../../types/globe'
import {
  PHENOMENA,
  layerContract,
  overlayPhenomenon,
  type ProvenanceKind,
} from '../../../lib/config/globeOntology'
import { GRAMMAR, type DataNature, type MotionKind, type UncertaintyKind } from '../../../lib/config/globeVizGrammar'

export type AtmosphericEvidenceStatus = 'ready' | 'loading' | 'stale' | 'unavailable' | 'empty'
export type AtmosphericFocusKind = 'observation' | 'model-estimate' | 'policy-location'

export interface AtmosphericFocus {
  kind: AtmosphericFocusKind
  label: string
  value: number | null
  unit: string
  p10: number | null
  p90: number | null
  dqss: number | null
  /** `dqss` 값의 출처. 'measured'/'partial' 가 아니면 카드는 숫자를 감추고 "DQSS —" 를 보인다(§5 Glass-box). */
  dqssProvenance: DQSSProvenance | null
  /** 'partial' 일 때만 값 존재 — "N/5 components measured · measured weight ≤M%" 상세의 원천. */
  dqssPartialDetail: DQSSPartialDetail | null
  qualityGrade: string | null
  source: string | null
  version: string | null
}

export interface AtmosphericViewModel {
  mode: AtmosphericMode
  nature: DataNature
  motion: MotionKind
  uncertainty: UncertaintyKind
  provenance: readonly ProvenanceKind[]
  label: string
  unit: string
  source: string | null
  referenceTime: number | null
  validTime: number | null
  cycle: string | null
  leadHours: number | null
  range: readonly [number, number] | null
  coverage: string | null
  eventCoverage: FireCoverage | null
  status: AtmosphericEvidenceStatus
  focus: AtmosphericFocus | null
  motionKey: string
}

export interface AtmosphericViewState {
  overlayType: OverlayType
  activeGridMeta: ActiveGridMeta | null
  timeOffsetHours: number
  timelineStale: boolean
  timelinePlaying: boolean
  transportLens: boolean
  showParticles: boolean
  showStations: boolean
  showFires: boolean
  showChoropleth: boolean
  selectedStation: SelectedStation | null
  selectedPrediction: SelectedPrediction | null
  selectedCountry: SelectedCountry | null
  fireCoverage: FireCoverage | null
  windFieldStatus: WindFieldStatus
  windFieldMeta: WindFieldMeta | null
}

export interface ScaledUncertaintyBand {
  low: number
  center: number
  high: number
  domainMax: number
}

const finite = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const parseTime = (value: string | null | undefined): number | null => {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function deriveAtmosphericMode(state: Pick<
  AtmosphericViewState,
  'transportLens' | 'timeOffsetHours' | 'overlayType' | 'showChoropleth' | 'showFires'
>): AtmosphericMode {
  if (state.transportLens) return 'transport'
  if (state.timeOffsetHours !== 0 && state.overlayType === 'pm25') return 'forecast'
  if (state.showChoropleth) return 'policy'
  if (state.showFires) return 'events'
  return 'live'
}

export function scaleUncertaintyBand(
  p10: number | null | undefined,
  p50: number | null | undefined,
  p90: number | null | undefined,
): ScaledUncertaintyBand | null {
  if (!finite(p10) || !finite(p50) || !finite(p90) || p10 > p50 || p50 > p90) return null
  const domainMax = Math.max(55, p90 * 1.12, 1)
  const toPct = (value: number) => Math.max(0, Math.min(100, (value / domainMax) * 100))
  return { low: toPct(p10), center: toPct(p50), high: toPct(p90), domainMax }
}

function focusFor(state: AtmosphericViewState): AtmosphericFocus | null {
  if (state.selectedStation) {
    const station = state.selectedStation
    return {
      kind: 'observation',
      label: station.name ?? '—',
      value: station.pm25,
      unit: 'µg/m³',
      p10: finite(station.p10) ? station.p10 : null,
      p90: finite(station.p90) ? station.p90 : null,
      dqss: finite(station.dqss) ? station.dqss : null,
      dqssProvenance: station.dqss_provenance ?? null,
      dqssPartialDetail: station.dqss_partial_detail ?? null,
      qualityGrade: null,
      source: station.source ?? null,
      version: null,
    }
  }

  if (state.selectedPrediction) {
    const prediction = state.selectedPrediction
    return {
      kind: 'model-estimate',
      label: prediction.name,
      value: prediction.p50,
      unit: 'µg/m³',
      p10: prediction.p10,
      p90: prediction.p90,
      dqss: null,
      dqssProvenance: null,
      dqssPartialDetail: null,
      qualityGrade: prediction.confidenceGrade ?? null,
      source: prediction.source ?? null,
      version: prediction.modelVersion ?? null,
    }
  }

  if (state.selectedCountry) {
    return {
      kind: 'policy-location',
      label: state.selectedCountry.name,
      value: null,
      unit: '',
      p10: null,
      p90: null,
      dqss: null,
      dqssProvenance: null,
      dqssPartialDetail: null,
      qualityGrade: null,
      source: null,
      version: null,
    }
  }

  return null
}

function statusFor(mode: AtmosphericMode, state: AtmosphericViewState, gridFresh: boolean): AtmosphericEvidenceStatus {
  if (mode === 'forecast') {
    if (state.timelineStale) return 'stale'
    return gridFresh && state.activeGridMeta?.leadHours != null ? 'ready' : 'loading'
  }
  if (mode === 'events') return state.fireCoverage ? (state.fireCoverage.stale ? 'stale' : 'ready') : 'loading'
  if (mode === 'transport') {
    if (state.windFieldStatus === 'unavailable') return 'unavailable'
    if (state.windFieldStatus === 'stale') return 'stale'
    return state.windFieldStatus === 'ready' ? 'ready' : 'loading'
  }
  if (mode === 'policy') return 'ready'
  if (state.overlayType !== 'none' && state.overlayType !== 'wind') return gridFresh ? 'ready' : 'loading'
  if (state.showParticles) {
    if (state.windFieldStatus === 'unavailable') return 'unavailable'
    if (state.windFieldStatus === 'stale') return 'stale'
    return state.windFieldStatus === 'ready' ? 'ready' : 'loading'
  }
  return state.showStations ? 'ready' : 'empty'
}

export function buildAtmosphericViewModel(state: AtmosphericViewState): AtmosphericViewModel {
  const mode = deriveAtmosphericMode(state)
  const gridFresh = state.activeGridMeta?.overlayType === state.overlayType
  const phenomenon = overlayPhenomenon(state.overlayType)
  const focus = focusFor(state)

  let nature: DataNature
  let motion: MotionKind
  let uncertainty: UncertaintyKind
  let provenance: readonly ProvenanceKind[]
  let label: string
  let unit = ''
  let source: string | null = null
  let coverage: string | null = null

  if (mode === 'forecast') {
    nature = 'forecast'
    ;({ motionKind: motion, uncertaintyKind: uncertainty } = GRAMMAR.forecast)
    provenance = ['forecast']
    label = PHENOMENA.pm25.hud?.label ?? 'PM2.5'
    unit = PHENOMENA.pm25.hud?.unit ?? 'µg/m³'
    source = gridFresh ? state.activeGridMeta?.source ?? null : PHENOMENA.pm25.forecastPipeline?.source ?? null
    coverage = PHENOMENA.pm25.forecastPipeline?.coverage ?? null
  } else if (mode === 'events') {
    ;({ nature, motion, uncertainty } = layerContract('FireHotspots'))
    provenance = PHENOMENA.fire.provenance
    label = PHENOMENA.fire.hud?.label ?? 'Fire hotspots'
    source = PHENOMENA.fire.pipeline?.source ?? null
    coverage = PHENOMENA.fire.pipeline?.coverage ?? null
  } else if (mode === 'transport') {
    ;({ nature, motion, uncertainty } = layerContract('WindParticles'))
    provenance = PHENOMENA.transport.provenance
    label = PHENOMENA.transport.hud?.label ?? 'Pollution transport'
    unit = PHENOMENA.transport.hud?.unit ?? ''
    const concentrationSource = state.activeGridMeta?.overlayType === 'pm25'
      ? state.activeGridMeta.source
      : PHENOMENA.pm25.pipeline?.source
    source = [concentrationSource, PHENOMENA.wind.pipeline?.source].filter(Boolean).join(' × ') || null
    coverage = PHENOMENA.transport.pipeline?.coverage ?? null
  } else if (mode === 'policy') {
    ;({ nature, motion, uncertainty } = layerContract('CountryChoropleth'))
    provenance = PHENOMENA['policy-standard'].provenance
    label = PHENOMENA['policy-standard'].hud?.label ?? 'Policy standard'
    unit = PHENOMENA['policy-standard'].hud?.unit ?? ''
    source = PHENOMENA['policy-standard'].pipeline?.source ?? null
    coverage = PHENOMENA['policy-standard'].pipeline?.coverage ?? null
  } else if (state.overlayType !== 'none' && state.overlayType !== 'wind' && phenomenon) {
    ;({ nature, motion, uncertainty } = layerContract('ScalarFieldOverlay'))
    provenance = phenomenon.provenance
    label = phenomenon.hud?.label ?? state.overlayType.toUpperCase()
    unit = phenomenon.hud?.unit ?? ''
    source = gridFresh ? state.activeGridMeta?.source ?? null : phenomenon.pipeline?.source ?? null
    coverage = phenomenon.pipeline?.coverage ?? null
  } else if (state.showParticles) {
    ;({ nature, motion, uncertainty } = layerContract('WindParticles'))
    provenance = PHENOMENA.wind.provenance
    label = PHENOMENA.wind.hud?.label ?? 'Wind'
    unit = PHENOMENA.wind.hud?.unit ?? 'm/s'
    source = PHENOMENA.wind.pipeline?.source ?? null
    coverage = PHENOMENA.wind.pipeline?.coverage ?? null
  } else {
    ;({ nature, motion, uncertainty } = layerContract('StationLabels'))
    provenance = PHENOMENA.pm25.provenance
    label = PHENOMENA.pm25.hud?.label ?? 'PM2.5'
    unit = PHENOMENA.pm25.hud?.unit ?? 'µg/m³'
    source = focus?.source ?? null
    coverage = PHENOMENA.pm25.pipeline?.coverage ?? null
  }

  if (focus?.kind === 'observation') {
    uncertainty = 'dqss-badge'
    provenance = ['observation']
  }
  if (focus?.kind === 'model-estimate') {
    uncertainty = 'band-if-available'
    provenance = PHENOMENA['pm25-prediction'].provenance
  }

  const range = gridFresh && finite(state.activeGridMeta?.min) && finite(state.activeGridMeta?.max)
    ? [state.activeGridMeta.min, state.activeGridMeta.max] as const
    : null
  const referenceTime = mode === 'events'
    ? parseTime(state.fireCoverage?.refTime)
    : mode === 'transport' || (mode === 'live' && state.overlayType === 'wind')
      ? parseTime(state.windFieldMeta?.generatedAt)
      : gridFresh ? state.activeGridMeta?.timestamp ?? null : null
  const validTime = mode === 'transport' || (mode === 'live' && state.overlayType === 'wind')
    ? parseTime(state.windFieldMeta?.refTime)
    : gridFresh ? state.activeGridMeta?.validTime ?? state.activeGridMeta?.timestamp ?? null : null

  const pointFocus = focus?.kind === 'observation' || focus?.kind === 'model-estimate'

  return {
    mode,
    nature,
    motion,
    uncertainty,
    provenance,
    label,
    unit,
    source: pointFocus ? focus.source : source,
    referenceTime: pointFocus ? null : referenceTime,
    validTime: pointFocus ? null : validTime,
    cycle: gridFresh ? state.activeGridMeta?.cycle ?? null : null,
    leadHours: gridFresh ? state.activeGridMeta?.leadHours ?? null : null,
    range,
    coverage,
    eventCoverage: mode === 'events' ? state.fireCoverage : null,
    status: statusFor(mode, state, gridFresh),
    focus,
    motionKey: [
      mode,
      state.overlayType,
      state.timeOffsetHours,
      state.activeGridMeta?.timestamp ?? '—',
      state.selectedStation?.station_uid ?? state.selectedStation?.name ?? '—',
      state.selectedPrediction?.name ?? '—',
      state.fireCoverage?.refTime ?? '—',
      state.timelinePlaying ? 'play' : 'pause',
    ].join(':'),
  }
}
