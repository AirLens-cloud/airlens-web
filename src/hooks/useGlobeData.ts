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
import { fetchGlobalGridSnapshot, GLOBAL_GRID_SAMPLE_LIMIT } from '../api/gridSnapshot';
import { fetchCityPredictions } from '../api/predictions';
import { HF_LIVE_BASE } from '../lib/config/dataSources';
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
/** HF live DQSS publish (`ml-predict` → `hf_publish.py`, W1 honest-publishing). */
const HF_DQSS_PATH = `${HF_LIVE_BASE}/aq-data/data_quality.json`;
/** Bundled DQSS station scores — fallback when the HF live copy is unreachable. */
const DQSS_SOURCE_PATH = '/data/data_quality.json';
const DQSS_FETCH_TIMEOUT_MS = 5000;

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
 * `GLOBAL_GRID_SAMPLE_LIMIT` (`api/gridSnapshot.ts`) is the shared constant —
 * with no origin, both this call and `fetchGlobalMarkers` (`api/globeMarkers.ts`)
 * rank the same artifact into the same order, so a cell's index here lines up
 * 1:1 with the `grid-${i+1}` identity the 3D scene's markers already use. No
 * new network fetch: `fetchGlobalGridSnapshot` dedupes the underlying
 * artifact fetch through its own module cache.
 */
export function useGlobeGridSnapshot(): GlobalGridSnapshot | null {
  return useCachedResource<GlobalGridSnapshot | null>(
    'globe:grid-snapshot',
    () => fetchGlobalGridSnapshot({ limit: GLOBAL_GRID_SAMPLE_LIMIT }),
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
 * `data_quality.json` is now published to the HF live dataset by the
 * monorepo's DQSS pipeline (`aq-data/data_quality.json`, W1 honest-publishing
 * — verified 2026-09-03, superseding the 2026-08-26 "no publisher yet" note).
 * HF is the primary source; the bundled static copy is a fallback for when the
 * live fetch fails. A `meta.source` value outside `'seed' | 'measured'`
 * (`'partial'`, `'withheld'`, …) is not an error — `readProvenance` already
 * treats it as "not measured" (honest-empty), so `lookupDQSSScore` and
 * `dqssToOpacity(null)` degrade the same way whether the file is absent or
 * merely not yet fully measured. Nothing here invents a score.
 */
async function readDQSSManifest(url: string): Promise<Partial<DataQualityResponse> | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(DQSS_FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    return (await res.json()) as Partial<DataQualityResponse>;
  } catch {
    return null;
  }
}

/**
 * The fallback only fires when the HF fetch itself fails (network error,
 * non-2xx, unparseable body — `readDQSSManifest` returns null in all three
 * cases). A *successful* HF response with an empty `stations: []` array is
 * not a failure — it stands as-is and does NOT fall through to the bundled
 * copy, since an empty live array is real (honest) coverage information,
 * not an outage.
 */
async function fetchDQSSData(): Promise<DQSSCache> {
  const json =
    (await readDQSSManifest(HF_DQSS_PATH)) ??
    (await readDQSSManifest(DQSS_SOURCE_PATH)) ??
    { stations: [] };
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
