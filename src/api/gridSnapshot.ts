/**
 * Grid snapshot adapter. Ported verbatim (logic) from AirLens-platform
 * apps/web `src/api/gridSnapshot.ts` — the retired `global-grid-snapshot`
 * Supabase Edge Fn never held data of its own; it read the harvester-exported
 * PM2.5 grid artifact and ran pure client-safe computation on it (haversine
 * proximity ranking, grade cut 15/35/75, 48h staleness). One deliberate
 * divergence from that port: the Edge Fn's `aqi = round(pm25*1.25)` fallback
 * is replaced with `pm25ToAqi()` (EPA piecewise, the inverse of the
 * `aqiToPm25()` decoder downstream consumers apply) — B0 Truth Kernel,
 * EVIDENCE_CONTRACT §7. That artifact is published straight to the browser via
 * two channels this module reads instead:
 *
 *   1. HF dataset (`Robeedau/airlens-live`, `HF_LIVE_BASE`) — GitHub Actions
 *      cron republishes `aq-data/current-pm25-grid.json` every 3h.
 *   2. Bundled static fallback (`/data/current-pm25-grid.json`).
 *
 * Glass-box: the source artifact carries no p10/p90 uncertainty band and
 * only a bare numeric `dqss` per point — neither is fabricated here.
 * `dqss`/`confidence` stay `undefined` unless present verbatim in the source point.
 */
import { HF_LIVE_BASE } from '../lib/config/dataSources';
import { pm25ToAqi } from '../lib/config/aqi';
import type { GlobalGridCell, GlobalGridSnapshot, GlobalGridSnapshotOptions, PM25Grade } from '../types/data';

const GRID_OBJECT_PATH = 'aq-data/current-pm25-grid.json';
const STATIC_GRID_PATH = '/data/current-pm25-grid.json';

const CACHE_TTL_MS = 30 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;
/** Exported so other Today-surface sources (e.g. `useTodayCams.ts`) judge
 * staleness against the same threshold rather than inventing their own. */
export const DEFAULT_MAX_AGE_HOURS = 48;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 5000;
const DEFAULT_RADIUS_KM = 600;
const MAX_RADIUS_KM = 20000;

interface RawGridPoint {
  lat?: unknown;
  lon?: unknown;
  value?: unknown;
  pm25?: unknown;
  aqi?: unknown;
  confidence?: unknown;
  dqss?: unknown;
}

interface RawGridArtifact {
  timestamp?: unknown;
  generated_at?: unknown;
  updated_at?: unknown;
  points?: unknown;
  cells?: unknown;
  data?: { points?: unknown; cells?: unknown };
}

interface FinitePoint {
  lat: number;
  lon: number;
  pm25: number;
  aqi?: number;
  confidence?: number;
  dqss?: number;
}

let cache: { artifact: RawGridArtifact; fetchedAt: number } | null = null;
let inflight: Promise<RawGridArtifact | null> | null = null;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function gradeFromPm25(pm25: number): PM25Grade {
  if (pm25 <= 15) return 'Good';
  if (pm25 <= 35) return 'Moderate';
  if (pm25 <= 75) return 'Unhealthy';
  return 'Very Unhealthy';
}

function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lon - a.lon) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return r * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** `updated_at` → `generated_at` → `timestamp` (epoch ms or ISO string) → ISO. */
function updatedAtOf(artifact: RawGridArtifact): string | null {
  const raw = artifact.updated_at ?? artifact.generated_at ?? artifact.timestamp;
  if (raw == null) return null;
  if (typeof raw === 'number') {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof raw === 'string') {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

function rawPointsOf(artifact: RawGridArtifact): unknown[] {
  const arr = artifact.points ?? artifact.cells ?? artifact.data?.points ?? artifact.data?.cells;
  return Array.isArray(arr) ? arr : [];
}

/** Finite-value filter — only points where lat/lon/pm25(or value) are all finite pass. */
function finitePointsOf(artifact: RawGridArtifact): FinitePoint[] {
  const out: FinitePoint[] = [];
  for (const raw of rawPointsOf(artifact)) {
    if (!raw || typeof raw !== 'object') continue;
    const p = raw as RawGridPoint;
    const pm25 = isFiniteNumber(p.pm25) ? p.pm25 : p.value;
    if (!isFiniteNumber(p.lat) || !isFiniteNumber(p.lon) || !isFiniteNumber(pm25)) continue;
    out.push({
      lat: p.lat,
      lon: p.lon,
      pm25,
      aqi: isFiniteNumber(p.aqi) ? p.aqi : undefined,
      confidence: isFiniteNumber(p.confidence) ? p.confidence : undefined,
      dqss: isFiniteNumber(p.dqss) ? p.dqss : undefined,
    });
  }
  return out;
}

async function fetchArtifact(url: string): Promise<RawGridArtifact | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const body = (await res.json()) as unknown;
    return body && typeof body === 'object' ? (body as RawGridArtifact) : null;
  } catch {
    return null;
  }
}

/**
 * Source cascade — HF live dataset first (freshest, 3h cron), bundled static
 * fallback second. 30-minute in-memory cache.
 */
async function readArtifact(): Promise<RawGridArtifact | null> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.artifact;
  if (inflight) return inflight;

  inflight = (async () => {
    const hfUrl = `${HF_LIVE_BASE}/${GRID_OBJECT_PATH}`;
    let artifact = await fetchArtifact(hfUrl);
    if (!artifact) artifact = await fetchArtifact(STATIC_GRID_PATH);
    if (artifact) cache = { artifact, fetchedAt: Date.now() };
    return artifact;
  })();
  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

/**
 * Client-side reimplementation of the retired `global-grid-snapshot` Edge
 * Fn's ranking response. Same defaults (limit 50 / radiusKm 600, capped at
 * 5000 / 20000). Throws instead of returning a Response — callers wrap this
 * in try/catch and fall back on any rejection.
 */
export async function fetchGlobalGridSnapshot(
  options: GlobalGridSnapshotOptions = {},
): Promise<GlobalGridSnapshot> {
  const artifact = await readArtifact();
  if (!artifact) throw new Error('Grid snapshot unavailable');

  const points = finitePointsOf(artifact);
  const updatedAt = updatedAtOf(artifact);
  if (!updatedAt || points.length === 0) throw new Error('Grid snapshot manifest empty');

  const ageHours = (Date.now() - new Date(updatedAt).getTime()) / 3600_000;
  const stale = ageHours > DEFAULT_MAX_AGE_HOURS;

  const hasLat = isFiniteNumber(options.lat);
  const hasLon = isFiniteNumber(options.lon);
  const origin = hasLat && hasLon ? { lat: options.lat as number, lon: options.lon as number } : null;

  const limit = Math.max(1, Math.min(MAX_LIMIT, Math.trunc(options.limit ?? DEFAULT_LIMIT)));
  const radiusKm = Math.max(1, Math.min(MAX_RADIUS_KM, options.radiusKm ?? DEFAULT_RADIUS_KM));

  const ranked: GlobalGridCell[] = points
    .map((p) => {
      const distanceKm = origin ? haversineKm(origin, p) : 0;
      return {
        lat: p.lat,
        lon: p.lon,
        pm25: p.pm25,
        aqi: p.aqi ?? pm25ToAqi(p.pm25),
        grade: gradeFromPm25(p.pm25),
        updatedAt,
        dqss: p.dqss,
        confidence: p.confidence,
        distanceKm,
      };
    })
    .filter((p) => !origin || (p.distanceKm ?? 0) <= radiusKm)
    .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));

  const nearbyCells = ranked.slice(0, limit);
  if (nearbyCells.length === 0) throw new Error('No grid cells in requested radius');

  const primary = nearbyCells[0];
  return {
    pm25: primary.pm25,
    aqi: primary.aqi,
    grade: primary.grade,
    lat: primary.lat,
    lon: primary.lon,
    source: 'global_grid',
    updatedAt,
    dqss: primary.dqss,
    confidence: primary.confidence,
    stale,
    nearbyCells,
  };
}
