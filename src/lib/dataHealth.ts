/**
 * DataHealth pure helpers — ported verbatim from AirLens-platform apps/web
 * `src/lib/dataHealth.ts`. Parsing/judgment logic kept separate from the
 * store (data only) and from the fetch hook, so both are testable without a
 * network or a timer.
 */
import type { FeedHealth, ServedFrom } from '../types/dataHealth'

interface CdnHealthSourceEntry {
  generatedAt?: string | null
  expiresAt?: string | null
  servedFrom?: string | null
  available?: boolean | null
}

interface CdnHealthDoc {
  generatedAt?: string
  sources?: Record<string, CdnHealthSourceEntry>
}

function parseIsoMs(iso: string | null | undefined): number | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? ms : null
}

function normalizeServedFrom(v: string | null | undefined): ServedFrom {
  return v === 'fresh' || v === 'baseline' ? v : null
}

/**
 * One `health.json` source entry → `FeedHealth`.
 *
 * Absent (`available: false`), stale (`expiresAt` already passed), and
 * degraded (`available: true` but `servedFrom === 'baseline'`) all collapse
 * into a single `stale: true`. The banner only needs "trust this or not",
 * not why.
 */
export function buildFeedHealthFromCdnEntry(
  name: string,
  entry: CdnHealthSourceEntry,
  nowMs: number,
): FeedHealth {
  const generatedAt = parseIsoMs(entry.generatedAt)
  const expiresAt = parseIsoMs(entry.expiresAt)
  const available = entry.available === true
  const servedFrom = normalizeServedFrom(entry.servedFrom)
  const expired = expiresAt !== null && nowMs > expiresAt
  return {
    generatedAt,
    ageMs: generatedAt !== null ? Math.max(0, nowMs - generatedAt) : null,
    source: name,
    servedFrom,
    available,
    stale: !available || expired || servedFrom === 'baseline',
  }
}

/** Parses a whole `health.json` document into a `{sourceKey: FeedHealth}` map.
 *  Malformed/missing `sources` → `{}` (never throws — a bad poll should not
 *  crash the banner, it should just not update anything this cycle). */
export function parseCdnHealthDoc(json: unknown, nowMs: number): Record<string, FeedHealth> {
  if (typeof json !== 'object' || json === null) return {}
  const doc = json as CdnHealthDoc
  const sources = doc.sources
  if (typeof sources !== 'object' || sources === null) return {}
  const out: Record<string, FeedHealth> = {}
  for (const [name, entry] of Object.entries(sources)) {
    if (entry && typeof entry === 'object') {
      out[name] = buildFeedHealthFromCdnEntry(name, entry, nowMs)
    }
  }
  return out
}

/**
 * Per-feed gate — degraded when at least one tracked feed is stale.
 * Zero tracked feeds → `false`, not `true` (not knowing is not the same as
 * knowing it's broken).
 */
export function isFeedsDegraded(feeds: Record<string, FeedHealth>): boolean {
  const values = Object.values(feeds)
  if (values.length === 0) return false
  return values.some((f) => f.stale)
}

/**
 * True when the last successful poll is old enough that we can no longer
 * vouch for the feed map's freshness — regardless of what the individual
 * `stale` flags say (they're frozen at that poll's `nowMs`).
 * `lastPolledAt === null` (no poll has EVER succeeded yet) returns `false`.
 */
export function isPollStale(
  lastPolledAt: number | null,
  nowMs: number,
  pollIntervalMs: number,
  staleFactor: number,
): boolean {
  return lastPolledAt !== null && nowMs - lastPolledAt > pollIntervalMs * staleFactor
}

/**
 * Full banner gate — degraded when polling itself has gone stale OR at
 * least one feed's last-known state was itself stale.
 */
export function isDegraded(feeds: Record<string, FeedHealth>, pollStale: boolean): boolean {
  return pollStale || isFeedsDegraded(feeds)
}
