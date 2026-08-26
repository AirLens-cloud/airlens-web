/**
 * Shared "why is this section empty" mapping for the Weather page. Every
 * section on the page uses the same three states (loading / honest-missing
 * / error+retry) built from the one `useWeatherPageData` result, via the
 * existing `DataState` vocabulary (`WfDataState` renders it).
 */
import { dataState, type DataState } from '../../types/dataState'
import type { WeatherPageStatus } from '../../hooks/useWeatherPageData'

export function sectionDataState(
  status: WeatherPageStatus,
  configured: boolean,
  hasData: boolean,
  source: string | null = 'Open-Meteo via AirLens proxy',
): DataState {
  if (status === 'loading') return dataState('loading')
  if (!configured) return dataState('unavailable', { source })
  if (!hasData) return dataState('error', { source })
  return dataState('ready')
}
