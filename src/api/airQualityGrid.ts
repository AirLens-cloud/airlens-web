/**
 * Air Quality Grid Service — global scalar field data (grid overlays).
 *
 * Ported from AirLens-platform apps/web `src/api/airQualityGrid.ts`, with the
 * retired Supabase Edge Function on-demand step removed (this repo has no
 * backend — HF dataset repo + CDN + bundled static are the only sources left).
 *
 * Cascade: HF live-data repo (pre-collected, `HF_LIVE_BASE`) → CDN (pm25/pm10
 * only, mac GitHub Pages free-tier publish) → static fallback.
 */
import { logger } from '../lib/logger';
import { feedVarKeys, feedObjectPaths, feedPipeline, type PhenomenonPipeline } from '../lib/config/feeds';
import { SNAPSHOT_CDN_BASE, HF_LIVE_BASE } from '../lib/config/dataSources';
import type { OverlayType, OverlayGridData } from '../types/data';

// ── Variable / path mapping — derived from lib/config/feeds.ts ─────────────

const OVERLAY_TO_AQ_VAR: Partial<Record<OverlayType, string>> = feedVarKeys('aq-grid');
const WEATHER_OVERLAYS: Partial<Record<OverlayType, string>> = feedVarKeys('weather-grid');
const MARINE_OVERLAYS: Partial<Record<OverlayType, string>> = feedVarKeys('marine-grid');
const POLLEN_OVERLAYS: Partial<Record<OverlayType, string>> = feedVarKeys('pollen-grid');

const STORAGE_PATHS: Partial<Record<OverlayType, string>> = feedObjectPaths('aq-grid', 'storagePath');
const STATIC_PATHS: Partial<Record<OverlayType, string>> = feedObjectPaths('aq-grid', 'staticPath');
const CDN_PATHS: Partial<Record<OverlayType, string>> = feedObjectPaths('aq-grid', 'cdnPath');

const WEATHER_FEED = feedPipeline('weather-grid');
const MARINE_FEED = feedPipeline('marine-grid');
const POLLEN_FEED = feedPipeline('pollen-grid');

/** HF(pre-collected) → CDN(cdnPath-configured feeds only) → static. */
const feedSources = (feed: PhenomenonPipeline): string[] =>
  [
    feed.storagePath ? `${HF_LIVE_BASE}/${feed.storagePath}` : '',
    feed.cdnPath ? `${SNAPSHOT_CDN_BASE}/${feed.cdnPath}` : '',
    feed.staticPath ?? '',
  ].filter((u) => u && !u.includes('undefined'));

/**
 * Extract a real source timestamp when the payload carries one, else null —
 * never fabricate "now". `timestamp`/`generatedAt` are checked first for
 * parity with the AQGridResponse schema (`parseGridResponse`); `refTime`/
 * `collected_at` cover the weather/marine/pollen collectors.
 */
function extractSourceTimestamp(json: {
  timestamp?: number;
  generatedAt?: string;
  refTime?: string;
  collected_at?: string;
}): number | null {
  if (typeof json.timestamp === 'number' && Number.isFinite(json.timestamp)) return json.timestamp;
  for (const iso of [json.generatedAt, json.refTime, json.collected_at]) {
    if (typeof iso === 'string') {
      const ms = Date.parse(iso);
      if (Number.isFinite(ms)) return ms;
    }
  }
  return null;
}

// ── Cache ───────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

interface CacheEntry {
  data: OverlayGridData;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const timelineFrameCache = new Map<string, CacheEntry>();

// ── Grid response parser ────────────────────────────────────────────────────

interface AQGridResponse {
  variable: string;
  resolution: number;
  timestamp: number;
  nLat: number;
  nLon: number;
  latMin: number;
  lonMin: number;
  dLat: number;
  dLon: number;
  /**
   * `value` is nullable by contract — `airlens-data/contracts/current-aq-grid.v1.schema.json`
   * declares `"value": {"type": ["number", "null"]}`. A null is the producer saying
   * *this cell was not measurable*, not that it measured zero: `collect_noaa_aq.py`
   * nulls physically impossible negative mass concentrations rather than clamping
   * them to 0 or to a neighbourhood mean.
   *
   * The type said `number` until 2026-09-04, so `values[i] = p.value` type-checked
   * and `ToNumber(null) === 0` silently turned "unmeasured" into "0 µg/m³" — which
   * the scalar field renders as the cleanest air on the globe.
   */
  points: Array<{ lat: number; lon: number; value: number | null }>;
  source?: string;
}

function parseGridResponse(
  json: AQGridResponse,
  overlayType: OverlayType,
): OverlayGridData {
  const { nLat, nLon, latMin, lonMin, dLat, dLon, points, timestamp, source } = json;

  const values = new Float32Array(nLat * nLon);
  values.fill(NaN);

  for (const p of points) {
    // A null (or otherwise non-numeric) cell is left at the pre-filled NaN. That
    // is the whole fix: `Float32Array` coerces `null` to 0, and every consumer
    // downstream — `scalarField.ts` colouring, its min/max scan, the hover
    // readout — treats a finite 0 as a real reading. NaN is the value they all
    // already agree means "no data", so absence stays absence.
    // Same test `api/gridSnapshot.ts` applies to the table view's cells.
    if (typeof p.value !== 'number') continue;
    const latIdx = Math.round((p.lat - latMin) / dLat);
    const lonIdx = Math.round((p.lon - lonMin) / dLon);
    if (latIdx >= 0 && latIdx < nLat && lonIdx >= 0 && lonIdx < nLon) {
      values[latIdx * nLon + lonIdx] = p.value;
    }
  }

  return {
    values,
    nLat,
    nLon,
    latMin,
    lonMin,
    dLat,
    dLon,
    overlayType,
    timestamp,
    source,
  };
}

// ── Public API ──────────────────────────────────────────────────────────────

/** Fetch weather grid (temp, rh, precip, cloud, uvi, mslp) from weather-grid.json. */
async function fetchWeatherGrid(
  overlayType: OverlayType,
): Promise<OverlayGridData | null> {
  const field = WEATHER_OVERLAYS[overlayType];
  if (!field) return null;

  const sources = feedSources(WEATHER_FEED);

  for (const url of sources) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;
      const json = await res.json() as {
        step: number;
        timestamp?: number;
        generatedAt?: string;
        refTime?: string;
        collected_at?: string;
        points: Array<Record<string, number | null> & { lat: number; lon: number }>;
      };
      if (!json.points?.length) continue;

      const step = json.step || 10;
      const lats = [...new Set(json.points.map((p) => p.lat))].sort((a, b) => a - b);
      const lons = [...new Set(json.points.map((p) => p.lon))].sort((a, b) => a - b);
      const nLat = lats.length;
      const nLon = lons.length;
      const values = new Float32Array(nLat * nLon);
      values.fill(NaN);

      for (const p of json.points) {
        const val = p[field] ?? null;
        if (val == null) continue;
        const latIdx = Math.round((p.lat - lats[0]) / step);
        const lonIdx = Math.round((p.lon - lons[0]) / step);
        if (latIdx >= 0 && latIdx < nLat && lonIdx >= 0 && lonIdx < nLon) {
          values[latIdx * nLon + lonIdx] = val;
        }
      }

      return {
        values,
        nLat,
        nLon,
        latMin: lats[0],
        lonMin: lons[0],
        dLat: step,
        dLon: step,
        overlayType,
        timestamp: extractSourceTimestamp(json),
        source: 'Open-Meteo',
      };
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Fetch global AQ grid for a given overlay type.
 * Cascade: HF live-data repo → CDN (pm25/pm10 only) → static fallback.
 * Also supports weather overlays (temp, rh, precip, cloud, uvi, mslp) via weather-grid.json.
 */
export async function fetchAQGrid(
  overlayType: OverlayType,
): Promise<OverlayGridData | null> {
  if (overlayType in WEATHER_OVERLAYS) {
    return fetchWeatherGrid(overlayType);
  }

  if (overlayType in MARINE_OVERLAYS) {
    return fetchMarineOverlayGrid(overlayType);
  }

  if (overlayType in POLLEN_OVERLAYS) {
    return fetchPollenGrid(overlayType);
  }

  const aqVar = OVERLAY_TO_AQ_VAR[overlayType];
  if (!aqVar) return null; // Not a supported overlay

  const cacheKey = overlayType;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  // 1. HF live-data repo (GitHub Actions cron — per-pollutant grids, refreshed every 3h).
  const storagePath = STORAGE_PATHS[overlayType];
  if (storagePath) {
    try {
      const url = `${HF_LIVE_BASE}/${storagePath}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const json = await res.json() as AQGridResponse;
        if (json.points?.length > 0) {
          const data = parseGridResponse(json, overlayType);
          cache.set(cacheKey, { data, expiresAt: Date.now() + CACHE_TTL_MS });
          return data;
        }
      }
    } catch {
      // HF fetch failed, try next source
    }
  }

  // 2. CDN (mac GitHub Pages free-tier publish). pm25/pm10 only (CDN_PATHS
  //    undefined for the rest).
  const cdnPath = CDN_PATHS[overlayType];
  if (cdnPath) {
    try {
      const url = `${SNAPSHOT_CDN_BASE}/${cdnPath}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const json = await res.json() as AQGridResponse;
        if (json.points?.length > 0) {
          const data = parseGridResponse(json, overlayType);
          cache.set(cacheKey, { data, expiresAt: Date.now() + CACHE_TTL_MS });
          return data;
        }
      }
    } catch {
      // CDN failed, try static fallback
    }
  }

  // 3. Static fallback (bundled with build)
  const staticPath = STATIC_PATHS[overlayType];
  if (staticPath) {
    try {
      const res = await fetch(staticPath, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const json = await res.json() as AQGridResponse;
        if (json.points?.length > 0) {
          const data = parseGridResponse(json, overlayType);
          cache.set(cacheKey, { data, expiresAt: Date.now() + CACHE_TTL_MS });
          return data;
        }
      }
    } catch {
      // All sources failed
    }
  }

  logger.warn(`[fetchAQGrid] All sources failed for ${overlayType}`);
  return null;
}

/**
 * Fetch a single pre-collected timeline frame (PM2.5, NOAA GEFS-Aerosols) from
 * the HF live-data repo `aq-data/timeline/<file>`. Same AQGridResponse schema
 * as the current-* grids (extra leadHours/cycle fields are ignored). Cached
 * per file (TTL 30min). Powers offset≠0 slider frames only.
 */
export async function fetchTimelineFrame(file: string): Promise<OverlayGridData | null> {
  const cached = timelineFrameCache.get(file);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  try {
    const url = `${HF_LIVE_BASE}/aq-data/timeline/${file}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const json = await res.json() as AQGridResponse;
    if (!json.points?.length) return null;
    const data = parseGridResponse(json, 'pm25');
    timelineFrameCache.set(file, { data, expiresAt: Date.now() + CACHE_TTL_MS });
    return data;
  } catch {
    return null;
  }
}

/** Fetch marine overlay grid (SST, SSTA, Waves, Currents) from marine-data.json. */
async function fetchMarineOverlayGrid(
  overlayType: OverlayType,
): Promise<OverlayGridData | null> {
  const field = MARINE_OVERLAYS[overlayType];
  if (!field) return null;

  const sources = feedSources(MARINE_FEED);

  for (const url of sources) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;
      const json = await res.json() as {
        step: number;
        timestamp?: number;
        generatedAt?: string;
        refTime?: string;
        collected_at?: string;
        points: Array<Record<string, number | null>>;
      };
      if (!json.points?.length) continue;

      const step = json.step || 10;
      const lats = [...new Set(json.points.map((p) => p.lat as number))].sort((a, b) => a - b);
      const lons = [...new Set(json.points.map((p) => p.lon as number))].sort((a, b) => a - b);
      const nLat = lats.length;
      const nLon = lons.length;
      const values = new Float32Array(nLat * nLon);
      values.fill(NaN);

      for (const p of json.points) {
        const val = p[field] as number | null;
        if (val == null) continue;
        const latIdx = Math.round(((p.lat as number) - lats[0]) / step);
        const lonIdx = Math.round(((p.lon as number) - lons[0]) / step);
        if (latIdx >= 0 && latIdx < nLat && lonIdx >= 0 && lonIdx < nLon) {
          values[latIdx * nLon + lonIdx] = val;
        }
      }

      return {
        values,
        nLat,
        nLon,
        latMin: lats[0],
        lonMin: lons[0],
        dLat: step,
        dLon: step,
        overlayType,
        timestamp: extractSourceTimestamp(json),
        source: 'Open-Meteo (Marine)',
      };
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Assemble a regular lat/lon grid from a multi-field point payload, extracting
 * one numeric field per point via `pick`. Shared by pollen (species field /
 * total sum). Points that pick null are left NaN (honest gaps outside coverage).
 */
function assembleFieldGrid(
  json: { step?: number; timestamp?: number; generatedAt?: string; refTime?: string; collected_at?: string; points: Array<Record<string, number | null>> },
  overlayType: OverlayType,
  source: string,
  pick: (p: Record<string, number | null>) => number | null,
): OverlayGridData | null {
  if (!json.points?.length) return null;
  const step = json.step || 2;
  const lats = [...new Set(json.points.map((p) => p.lat as number))].sort((a, b) => a - b);
  const lons = [...new Set(json.points.map((p) => p.lon as number))].sort((a, b) => a - b);
  const nLat = lats.length;
  const nLon = lons.length;
  const values = new Float32Array(nLat * nLon);
  values.fill(NaN);

  for (const p of json.points) {
    const val = pick(p);
    if (val == null) continue;
    const latIdx = Math.round(((p.lat as number) - lats[0]) / step);
    const lonIdx = Math.round(((p.lon as number) - lons[0]) / step);
    if (latIdx >= 0 && latIdx < nLat && lonIdx >= 0 && lonIdx < nLon) {
      values[latIdx * nLon + lonIdx] = val;
    }
  }

  return {
    values, nLat, nLon,
    latMin: lats[0], lonMin: lons[0], dLat: step, dLon: step,
    overlayType, timestamp: extractSourceTimestamp(json), source,
  };
}

const POLLEN_SOURCES = (): string[] => feedSources(POLLEN_FEED);

type PollenJson = { step?: number; timestamp?: number; generatedAt?: string; refTime?: string; collected_at?: string; points: Array<Record<string, number | null>> };

async function loadPollenJson(): Promise<PollenJson | null> {
  for (const url of POLLEN_SOURCES()) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;
      const json = (await res.json()) as PollenJson;
      if (json.points?.length) return json;
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Fetch a single-species pollen overlay grid (Europe / CAMS) from
 * pollen-grid.json.
 */
async function fetchPollenGrid(
  overlayType: OverlayType,
): Promise<OverlayGridData | null> {
  const field = POLLEN_OVERLAYS[overlayType];
  if (!field) return null;
  const json = await loadPollenJson();
  if (!json) return null;
  return assembleFieldGrid(json, overlayType, 'Open-Meteo (CAMS, Europe)', (p) => p[field]);
}

/**
 * Fetch a "total pollen" grid (sum of all 6 species). Null where every
 * species is absent (outside the CAMS domain).
 */
export async function fetchPollenTotalGrid(): Promise<OverlayGridData | null> {
  const json = await loadPollenJson();
  if (!json) return null;
  const fields = Object.values(POLLEN_OVERLAYS);
  return assembleFieldGrid(json, 'pollen_grass', 'Open-Meteo (CAMS, Europe)', (p) => {
    let sum = 0;
    let any = false;
    for (const f of fields) {
      const v = p[f];
      if (v != null) { sum += v; any = true; }
    }
    return any ? sum : null;
  });
}

/** Check if an overlay type is a scalar field (AQ, weather, marine, or pollen). */
export function isAQOverlay(overlayType: OverlayType): boolean {
  return overlayType in OVERLAY_TO_AQ_VAR || overlayType in WEATHER_OVERLAYS
    || overlayType in MARINE_OVERLAYS || overlayType in POLLEN_OVERLAYS;
}
