import { useShallow } from 'zustand/react/shallow'
import { useGlobeStore } from '../../../store/globeStore'
import { buildAtmosphericViewModel, type AtmosphericViewModel } from './atmosphericViewModel'

/** One selector for every observatory surface, so labels and motion cannot drift. */
export function useAtmosphericViewModel(): AtmosphericViewModel {
  const state = useGlobeStore(
    useShallow((s) => ({
      overlayType: s.overlayType,
      activeGridMeta: s.activeGridMeta,
      timeOffsetHours: s.timeOffsetHours,
      timelineStale: s.timelineStale,
      timelinePlaying: s.timelinePlaying,
      transportLens: s.transportLens,
      showParticles: s.showParticles,
      showStations: s.showStations,
      showFires: s.showFires,
      showChoropleth: s.showChoropleth,
      selectedStation: s.selectedStation,
      selectedPrediction: s.selectedPrediction,
      selectedCountry: s.selectedCountry,
      fireCoverage: s.fireCoverage,
      windFieldStatus: s.windFieldStatus,
      windFieldMeta: s.windFieldMeta,
    })),
  )

  return buildAtmosphericViewModel(state)
}
