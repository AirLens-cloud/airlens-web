/**
 * Feed registry — the `/data-sources` page's data layer.
 *
 * `datasources-live-feed-registry.md` (Wave B-5) specs a published
 * `source_registry` artifact with license/coverage/cadence fields set by a
 * producer that does not exist yet ("B1", §3/§14 of that doc — the field is
 * explicitly `[미확인]`/`부재` throughout). Rather than invent that artifact,
 * this module derives a live registry from the feeds this app already
 * fetches — `fetchGlobalGridSnapshot`/`fetchTimelineManifest`/`fetchFireFeed`/
 * `fetchWindField`/`fetchForecast` — and from the pipeline metadata
 * (source/cadence/resolution/freshnessSlaH) `lib/config/globeOntology.ts`
 * already owns for the Globe's own layer picker. No status is a code
 * constant: each entry's `status`/`lastSuccess`/`coverage` comes from an
 * actual fetch run at call time.
 *
 * `license` is `LICENSE_NOT_PUBLISHED` for every entry on purpose — grepping
 * this codebase's data layer for a license field turns up nothing (see the
 * spec's own "소스 사실이 코드 상수에 분산" diagnosis). Inventing a plausible
 * license string would be exactly the fabrication the spec's "비협상 원칙"
 * exists to forbid.
 *
 * Last-good rule: a poll that fails to reach a feed does not overwrite what
 * the previous successful poll established — ported from
 * `hooks/useDataHealth.ts`'s "last-good over fabricated-bad" rule. Staleness
 * is still re-judged against the live clock on every call, so a feed that
 * has been unreachable for a long time does surface as `stale`, never
 * silently as `ready`.
 */
import { fetchGlobalGridSnapshot, DEFAULT_MAX_AGE_HOURS } from './gridSnapshot'
import { fetchTimelineManifest } from './timeline'
import { fetchFireFeed } from './fires'
import { fetchWindField } from './weather'
import { fetchForecast } from '../lib/today/forecastSource'
import { feedPipeline, PHENOMENA, FIRE_FRESHNESS_SLA_H } from '../lib/config/globeOntology'

const LICENSE_NOT_PUBLISHED = 'Not published — no source registry exists yet'

export type FeedStatus = 'ready' | 'stale' | 'unavailable'

export interface FeedRegistryEntry {
  id: string
  label: string
  provider: string
  tier: string
  license: string
  /**
   * A wording the upstream licence *obliges* us to reproduce, verbatim, wherever
   * its data is shown. Distinct from `license` on purpose: `license` stays
   * `LICENSE_NOT_PUBLISHED` because no source registry publishes it and guessing
   * would be fabrication — but a mandated attribution sentence is not a guess,
   * it is copied from the licence text. `null` where no such wording exists.
   */
  attribution: string | null
  cadence: string
  coverage: string
  status: FeedStatus
  lastSuccess: string | null
  note: string | null
}

export interface FeedRegistry {
  feeds: FeedRegistryEntry[]
  checkedAt: string
}

interface ProbeResult {
  lastSuccess: string | null
  coverage: string
}

interface FeedDef {
  id: string
  label: string
  provider: string
  tier: string
  cadence: string
  /** Licence-mandated wording, copied from the licence text. Omit when none. */
  attribution?: string
  /** Age past which a fetched-but-old value reads as stale. `null` = no SLA known. */
  freshnessSlaH: number | null
  probe: () => Promise<ProbeResult>
}

function ageHours(iso: string | null, nowMs: number): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isFinite(t) ? Math.max(0, (nowMs - t) / 3_600_000) : null
}

function statusFor(freshnessSlaH: number | null, lastSuccess: string | null, nowMs: number): FeedStatus {
  const age = ageHours(lastSuccess, nowMs)
  if (freshnessSlaH !== null && age !== null && age > freshnessSlaH) return 'stale'
  return 'ready'
}

// Pipeline metadata already owned by the Globe layer picker — reused, not
// re-declared, so a change to the ontology's cadence/resolution/SLA shows up
// here too rather than drifting apart.
const aqGrid = feedPipeline('aq-grid')
const timelinePipeline = PHENOMENA.pm25.forecastPipeline
const windPipeline = feedPipeline('wind-grid')
const firePipeline = feedPipeline('fire-points')

if (!timelinePipeline) throw new Error('registry: pm25 forecastPipeline missing from ontology')

const FEEDS: FeedDef[] = [
  {
    id: 'pm25-grid',
    label: 'PM2.5 current grid',
    provider: aqGrid.source,
    // `aqGrid` resolves to pm25's pipeline (GEFS-Aerosols f000/anl) — an
    // analysis field, not an interpolated one. Stale since the GEFS-Aerosols
    // correction (this repo's provenance drift fix, 2026-09-04).
    tier: 'model analysis grid',
    cadence: aqGrid.cadence,
    freshnessSlaH: DEFAULT_MAX_AGE_HOURS, // same threshold gridSnapshot.ts's own `.stale` flag uses.
    async probe() {
      const snap = await fetchGlobalGridSnapshot({ limit: 1 })
      return { lastSuccess: snap.updatedAt, coverage: `Global, ${aqGrid.resolution} grid` }
    },
  },
  {
    id: 'pm25-timeline',
    label: 'PM2.5 forecast timeline',
    provider: timelinePipeline.source,
    tier: 'model forecast',
    cadence: timelinePipeline.cadence,
    freshnessSlaH: timelinePipeline.freshnessSlaH,
    async probe() {
      const data = await fetchTimelineManifest(Date.now())
      if (!data) throw new Error('timeline manifest unavailable')
      return {
        lastSuccess: data.generatedAt,
        coverage: `Global, ${timelinePipeline.resolution} grid, ±24h at 3h steps — single deterministic member, no p10/p90 band`,
      }
    },
  },
  {
    id: 'fires',
    label: 'Active fire hotspots',
    provider: firePipeline.source,
    tier: 'satellite-derived',
    cadence: firePipeline.cadence,
    freshnessSlaH: FIRE_FRESHNESS_SLA_H,
    async probe() {
      const feed = await fetchFireFeed()
      if (!feed) throw new Error('fire feed unavailable')
      const raw = feed.raw as { refTime?: unknown } | null
      const refTime = raw && typeof raw.refTime === 'string' ? raw.refTime : null
      return {
        lastSuccess: refTime,
        coverage: `Global, point detections (${firePipeline.resolution}) — ${feed.fires.length} hotspots in this poll`,
      }
    },
  },
  {
    id: 'wind',
    label: 'Wind vector field (surface)',
    provider: windPipeline.source,
    tier: 'model forecast',
    cadence: windPipeline.cadence,
    freshnessSlaH: windPipeline.freshnessSlaH,
    async probe() {
      const field = await fetchWindField('surface')
      if (!field) throw new Error('wind field unavailable')
      return { lastSuccess: field.meta?.generatedAt ?? null, coverage: `Global, ${windPipeline.resolution}` }
    },
  },
  {
    id: 'forecast',
    label: 'PM2.5 24h forecast',
    provider: 'Open-Meteo CAMS',
    // CC BY 4.0 specifies this sentence; it is not ours to paraphrase or
    // shorten. Copernicus data reaches this surface, so the wording travels
    // with it. See ATTRIBUTION.md.
    attribution:
      'Open-Meteo CAMS. Generated using Copernicus Atmosphere Monitoring Service information 2026.',
    tier: 'model forecast',
    cadence: '6h', // lib/today/forecastSource.ts header comment: cron refreshes this every 6h.
    freshnessSlaH: 12, // 2x cadence — same margin useDataHealth's pollStaleFactor applies.
    async probe() {
      const payload = await fetchForecast()
      if (!payload) throw new Error('forecast unavailable')
      return {
        lastSuccess: payload.generated_at ?? null,
        coverage: `${payload.cities.length} cities (Open-Meteo CAMS deterministic forecast)`,
      }
    },
  },
]

/** Keyed by feed id — the last entry a successful poll produced. */
const lastGood = new Map<string, FeedRegistryEntry>()

async function pollFeed(def: FeedDef, nowMs: number): Promise<FeedRegistryEntry> {
  const base = {
    id: def.id,
    label: def.label,
    provider: def.provider,
    tier: def.tier,
    license: LICENSE_NOT_PUBLISHED,
    attribution: def.attribution ?? null,
    cadence: def.cadence,
  }
  try {
    const result = await def.probe()
    const entry: FeedRegistryEntry = {
      ...base,
      coverage: result.coverage,
      status: statusFor(def.freshnessSlaH, result.lastSuccess, nowMs),
      lastSuccess: result.lastSuccess,
      note: null,
    }
    lastGood.set(def.id, entry)
    return entry
  } catch (err) {
    const cached = lastGood.get(def.id)
    if (cached) {
      return {
        ...cached,
        // Re-judged against the live clock — an old cached "ready" does not
        // survive past its SLA just because we could not refresh it.
        status: statusFor(def.freshnessSlaH, cached.lastSuccess, nowMs),
        note: 'This poll could not reach the feed — showing the last confirmed state.',
      }
    }
    return {
      ...base,
      coverage: 'Unknown — no successful poll yet',
      status: 'unavailable',
      lastSuccess: null,
      note: err instanceof Error ? err.message : 'Feed unavailable',
    }
  }
}

/** Runs all five feed probes and returns the registry as of this call. */
export async function fetchFeedRegistry(): Promise<FeedRegistry> {
  const nowMs = Date.now()
  const feeds = await Promise.all(FEEDS.map((def) => pollFeed(def, nowMs)))
  return { feeds, checkedAt: new Date(nowMs).toISOString() }
}

/** Test seam — drops the last-good cache so a test's first poll starts cold. */
export function __resetRegistryCache(): void {
  lastGood.clear()
}
