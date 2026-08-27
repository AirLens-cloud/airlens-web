/**
 * stationParse — raw globe marker → StationData (pure, testable).
 * 마커가 보유한 Glass-box 필드(p10/p90/source/station_id)를 떨어뜨리지 않고 통과.
 * DQSS 수치는 여기서 만들지 않는다 — SOT = useGlobeData.lookupDQSSScore (호출부).
 */
import { GLOBE_CONFIG } from '../../../../lib/config/globe';
import { aqiToPm25 } from '../../../../lib/config/aqi';
import { latLonToVec3, GLOBE_R } from './geoUtils';
import { isSatelliteSource } from './stationIconAtlas';
import type { StationData } from '../../../../types/globe';

const AQ = GLOBE_CONFIG.AQ_SPIKES;

export function parseStationData(rawMarkers: unknown[]): StationData[] {
  const results: StationData[] = [];
  for (const item of rawMarkers) {
    const m = item as Record<string, unknown>;
    const loc = m.location as { lat?: number; lon?: number } | undefined;
    if (!loc?.lat || !loc?.lon) continue;
    const aqi = typeof m.aqi === 'number' ? m.aqi : 0;
    if (aqi <= 0) continue;
    const pm25 = Math.min(aqiToPm25(aqi), AQ.PM25_CLAMP_MAX);
    const source = typeof m.source === 'string' ? m.source : undefined;
    const sensorType = typeof m.sensor_type === 'string' ? m.sensor_type : undefined;
    results.push({
      lat: loc.lat,
      lon: loc.lon,
      pm25,
      name: typeof m.city === 'string' ? m.city : '',
      position: latLonToVec3(loc.lat, loc.lon, GLOBE_R),
      isSatellite: isSatelliteSource(source, sensorType),
      source,
      sensorType,
      p10: typeof m.pm25_p10 === 'number' ? m.pm25_p10 : undefined,
      p90: typeof m.pm25_p90 === 'number' ? m.pm25_p90 : undefined,
      stationUid: typeof m.station_id === 'string' ? m.station_id : undefined,
    });
  }
  return results;
}
