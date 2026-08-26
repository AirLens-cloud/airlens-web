/**
 * fires — NASA FIRMS active-hotspot feed reader.
 *
 * The monorepo's module of the same name was a client for the `firms-proxy`
 * Supabase Edge Function — an authenticated on-demand tier layered over the
 * static feed for when the 6h collection cron went stale. This repo has no
 * Supabase and no session, so that tier is gone: the published feed is the
 * only path, and staleness is surfaced rather than silently patched over
 * (`buildFireCoverage` owns the staleness verdict, `lib/globe/fireCoverage.ts`).
 *
 * Cascade matches the rest of `api/`: HF live dataset first
 * (`wind-data/active-fires.json`, republished by the collection cron), bundled
 * static second. The whole payload is returned, not just `fires[]` — the same
 * file carries the truncation facts (`totalDetections` / `capped` /
 * `minFrpPublished`) that the coverage badge reads, and dropping them would
 * make a truncated feed look complete.
 */
import { HF_LIVE_BASE } from '../lib/config/dataSources'
import { feedPipeline } from '../lib/config/globeOntology'
import { readCached } from '../lib/resourceCache'
import { logger } from '../lib/logger'
import type { FireHotspot } from '../types/globe'

const FIRE_FEED = feedPipeline('fire-points')
const FETCH_TIMEOUT_MS = 8000
const CACHE_TTL_MS = 30 * 60 * 1000
const CACHE_KEY = 'globe:fires'

export interface FireFeed {
  fires: FireHotspot[]
  /** The payload verbatim — `buildFireCoverage` reads its truncation/freshness fields. */
  raw: unknown
}

/** Coordinates must be finite; a NaN row would put NaN into an instance matrix. */
function usableFires(raw: unknown): FireHotspot[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((f): f is FireHotspot => {
    if (typeof f !== 'object' || f === null) return false
    const r = f as Record<string, unknown>
    return (
      typeof r.lat === 'number' && Number.isFinite(r.lat) &&
      typeof r.lon === 'number' && Number.isFinite(r.lon)
    )
  })
}

async function readFeed(url: string): Promise<FireFeed | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    if (!res.ok) return null
    const json = (await res.json()) as { fires?: unknown }
    return { fires: usableFires(json?.fires), raw: json }
  } catch {
    return null
  }
}

/**
 * Shared fire feed. `null` means "could not load" — distinct from a feed that
 * loaded with zero hotspots, which is `{ fires: [] }`. Collapsing the two would
 * render "no fires" as a fact when it is really "no data".
 */
export async function fetchFireFeed(): Promise<FireFeed | null> {
  return readCached(
    CACHE_KEY,
    async () => {
      const hf = FIRE_FEED.storagePath
        ? await readFeed(`${HF_LIVE_BASE}/${FIRE_FEED.storagePath}`)
        : null
      if (hf) return hf
      const staticFeed = FIRE_FEED.staticPath ? await readFeed(FIRE_FEED.staticPath) : null
      if (!staticFeed) logger.warn('fetchFireFeed: no fire feed available (HF and static both failed)')
      return staticFeed
    },
    CACHE_TTL_MS,
  )
}
