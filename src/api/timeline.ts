/**
 * Timeline manifest + frame resolution — PM2.5 time-slider data source.
 * Ported verbatim from AirLens-platform apps/web `src/api/timeline.ts`.
 *
 * Reads pre-collected PM2.5 forecast frames (NOAA GEFS-Aerosols, ±24h @ 3h)
 * from the HF live-data repo `aq-data/timeline/`. offset=0 stays on the live
 * current-* path (`api/airQualityGrid.ts`, 1° grid); this module only powers
 * offset≠0 frames (2° grid).
 *
 * Glass-box: GEFS is a single deterministic member — NO p10–p90 is
 * fabricated here. The legend carries the honest "no uncertainty band"
 * caveat instead.
 */
import { logger } from '../lib/logger';
import { TIMELINE_STALE_MS } from '../lib/config/feeds';
import { HF_LIVE_BASE } from '../lib/config/dataSources';

const TIMELINE_DIR = 'aq-data/timeline';
const MANIFEST_FILE = 'manifest.json';
/** Manifest older than this (generatedAt vs now) → stale → slider disabled. */
const STALE_THRESHOLD_MS = TIMELINE_STALE_MS;
const FETCH_TIMEOUT_MS = 5000;
const MS_PER_HOUR = 3_600_000;

/** One forecast/analysis frame, with offset-from-now injected at fetch time. */
export interface TimelineFrameMeta {
  /** ISO validTime of the frame. */
  validTime: string;
  /** Forecast lead hours (0 = analysis, >0 = forecast). */
  leadHours: number;
  /** ISO model cycle. */
  cycle: string;
  /** Storage file name (e.g. "pm25-2026070506.json"). */
  file: string;
  /** round((validTime − now) / 1h) — the slider snap point. */
  offsetHours: number;
}

/** Raw manifest frame (before offsetHours injection). */
interface TimelineManifestFrame {
  validTime: string;
  leadHours: number;
  cycle: string;
  file: string;
}

/** Full manifest.json shape. */
export interface TimelineManifest {
  variable: string;
  source: string;
  refTime: string;
  generatedAt: string;
  stepHours: number;
  windowHours: number;
  resolution: number;
  frames: TimelineManifestFrame[];
}

/** Resolved manifest returned to the UI (frames carry offsetHours; staleness flagged). */
export interface TimelineData {
  frames: TimelineFrameMeta[];
  refTime: string;
  generatedAt: string;
  stale: boolean;
}

/**
 * Fetch the timeline manifest and inject each frame's offsetHours relative to `now`.
 * `now` is a parameter so the offset math stays pure/testable.
 * Returns null when the manifest is missing/unreadable — the caller then
 * disables the slider with an honest "unavailable" notice (never fabricates data).
 */
export async function fetchTimelineManifest(now: number): Promise<TimelineData | null> {
  const url = `${HF_LIVE_BASE}/${TIMELINE_DIR}/${MANIFEST_FILE}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const json = (await res.json()) as TimelineManifest;
    if (!Array.isArray(json.frames) || json.frames.length === 0) return null;

    const frames: TimelineFrameMeta[] = json.frames.map((f) => ({
      validTime: f.validTime,
      leadHours: f.leadHours,
      cycle: f.cycle,
      file: f.file,
      offsetHours: Math.round((Date.parse(f.validTime) - now) / MS_PER_HOUR),
    }));

    const generatedMs = Date.parse(json.generatedAt);
    const stale = Number.isFinite(generatedMs) && now - generatedMs > STALE_THRESHOLD_MS;

    return { frames, refTime: json.refTime, generatedAt: json.generatedAt, stale };
  } catch {
    logger.warn('[fetchTimelineManifest] manifest fetch failed');
    return null;
  }
}

/**
 * Nearest-frame resolver — pure. Returns the frame whose offsetHours is
 * closest to `offsetHours`. offset 0 → null (caller uses the live current-*
 * path instead). Empty frames → null. Out-of-range offsets clamp to the
 * nearest available frame.
 */
export function resolveFrame(
  frames: TimelineFrameMeta[],
  offsetHours: number,
): TimelineFrameMeta | null {
  if (offsetHours === 0 || frames.length === 0) return null;
  let best: TimelineFrameMeta | null = null;
  let bestDist = Infinity;
  for (const f of frames) {
    const dist = Math.abs(f.offsetHours - offsetHours);
    if (dist < bestDist) {
      bestDist = dist;
      best = f;
    }
  }
  return best;
}
