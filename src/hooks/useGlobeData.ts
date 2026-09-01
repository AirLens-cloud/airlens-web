/**
 * useGlobeData — shared data provider for Globe layers.
 *
 * Ported from AirLens-platform apps/web. The source uses TanStack Query for
 * caching + deduplication; this repo has no query client, so the same
 * guarantee comes from `useCachedResource` (one in-flight request per key,
 * shared TTL cache). Multiple components calling `useGlobeMarkers()` still
 * result in one network request.
 *
 * Also provides `useDQSSData()` for DQSS lat/lon → score lookups.
 */
import { useCachedResource } from './useCachedResource';
import { fetchGlobalMarkers } from '../api/globeMarkers';
import { fetchGlobalGridSnapshot } from '../api/gridSnapshot';
import { fetchCityPredictions } from '../api/predictions';
import { GLOBE_CONFIG } from '../lib/config/globe';
import { wrapDeltaLon } from '../lib/earth/geo';
import type { CityPrediction } from '../types/ml';
import type { GlobalGridSnapshot } from '../types/data';
import type {
  DQSSStation, DQSSScoreMap, DQSSCache,
  DataQualityMeta, DataQualityResponse, DQSSProvenance,
} from '../types/globe';

const CACHE_TTL_MS = 5 * 60 * 1000;
const DEG2RAD = Math.PI / 180;
/** Bundled DQSS station scores — see `fetchDQSSData` on why this is absent today. */
const DQSS_SOURCE_PATH = '/data/data_quality.json';

// ── Globe Markers ──

const EMPTY_MARKERS: unknown[] = [];

export function useGlobeMarkers(): unknown[] {
  return useCachedResource<unknown[]>(
    'globe:markers',
    fetchGlobalMarkers,
    CACHE_TTL_MS,
    EMPTY_MARKERS,
  );
}

// ── Global grid snapshot (Table/Map views) ──

/**
 * Matches `fetchGlobalMarkers`' own limit — with no origin, both calls rank
 * the same artifact into the same order, so a cell's index here lines up 1:1
 * with the `grid-${i+1}` identity the 3D scene's markers already use
 * (`api/globeMarkers.ts`). No new network fetch: `fetchGlobalGridSnapshot`
 * dedupes the underlying artifact fetch through its own module cache.
 */
const GRID_SNAPSHOT_LIMIT = 5000;

export function useGlobeGridSnapshot(): GlobalGridSnapshot | null {
  return useCachedResource<GlobalGridSnapshot | null>(
    'globe:grid-snapshot',
    () => fetchGlobalGridSnapshot({ limit: GRID_SNAPSHOT_LIMIT }),
    CACHE_TTL_MS,
    null,
  );
}

// ── ML City Predictions (grid_latest.json) ──────────────────────────────────

const EMPTY_PREDICTIONS: CityPrediction[] = [];

export function usePredictionMarkers(): CityPrediction[] {
  return useCachedResource<CityPrediction[]>(
    'globe:predictions',
    fetchCityPredictions,
    CACHE_TTL_MS,
    EMPTY_PREDICTIONS,
  );
}

// ── DQSS Score Map ──────────────────────────────────────────────────────────

export type { DQSSStation, DQSSScoreMap, DQSSCache };

function dqssGridKey(lat: number, lon: number): string {
  return `${lat.toFixed(3)},${lon.toFixed(3)}`;
}

/**
 * data_quality.json 이 스스로 선언한 출처만 신뢰한다. 선언이 없거나 모르는 값이면 null —
 * 라벨을 추측해 붙이지 않는다 (§5 Glass-box: 모르는 건 모른다고).
 */
function readProvenance(meta: DataQualityMeta | undefined): DQSSProvenance | null {
  if (meta?.source === 'seed' || meta?.source === 'measured') return meta.source;
  return null;
}

/**
 * `data_quality.json` has no publisher in this repo's data cascade yet — the
 * monorepo bundled it, and the HF live dataset does not carry it (verified
 * 2026-08-26: no `*quality*` path in `Robeedau/airlens-live`). Until a source
 * exists this resolves to an empty station set, which is the honest degraded
 * state: `lookupDQSSScore` returns null and `dqssToOpacity(null)` falls to the
 * DEFAULT tier. Nothing here invents a score.
 */
async function fetchDQSSData(): Promise<DQSSCache> {
  let json: Partial<DataQualityResponse> = { stations: [] };
  try {
    const res = await fetch(DQSS_SOURCE_PATH);
    if (res.ok) json = (await res.json()) as Partial<DataQualityResponse>;
  } catch {
    /* absent or unparseable — keep the empty set */
  }
  const stations = (json.stations ?? []).filter(
    (s) => isFinite(s.lat) && isFinite(s.lon) && isFinite(s.final_score),
  );
  const map: DQSSScoreMap = new Map();
  for (const s of stations) {
    map.set(dqssGridKey(s.lat, s.lon), s.final_score);
  }
  return { map, stations, provenance: readProvenance(json.meta) };
}

export function lookupDQSSScore(
  lat: number,
  lon: number,
  cache: DQSSCache | null,
): number | null {
  if (!cache || cache.stations.length === 0) return null;

  const key = dqssGridKey(lat, lon);
  const exact = cache.map.get(key);
  if (exact !== undefined) return exact;

  const maxDist = GLOBE_CONFIG.GLOBE_V2.DQSS_ENCODING.MATCH_RADIUS_DEG;
  const cosLat = Math.cos(lat * DEG2RAD);
  let bestScore: number | null = null;
  let bestDist = Infinity;

  for (const s of cache.stations) {
    const dLat = s.lat - lat;
    // Same equirectangular + date-line correction as idwCore.buildIdwField —
    // cos scaling barely matters at this 0.05° radius, but the wraparound does.
    const dLon = wrapDeltaLon(s.lon - lon) * (0.5 * (cosLat + Math.cos(s.lat * DEG2RAD)));
    const dist = dLat * dLat + dLon * dLon;
    if (dist < bestDist && dist <= maxDist * maxDist) {
      bestDist = dist;
      bestScore = s.final_score;
    }
  }

  return bestScore;
}

export function dqssToOpacity(score: number | null): number {
  const tiers = GLOBE_CONFIG.GLOBE_V2.DQSS_ENCODING.OPACITY;
  if (score === null) return tiers.DEFAULT;

  if (score >= tiers.HIGH.MIN_SCORE)   return tiers.HIGH.OPACITY;
  if (score >= tiers.MEDIUM.MIN_SCORE) return tiers.MEDIUM.OPACITY;
  if (score >= tiers.LOW.MIN_SCORE)    return tiers.LOW.OPACITY;
  return tiers.MINIMAL.OPACITY;
}

export function useDQSSData(): DQSSCache | null {
  return useCachedResource<DQSSCache | null>(
    'globe:dqss',
    fetchDQSSData,
    CACHE_TTL_MS,
    null,
  );
}
