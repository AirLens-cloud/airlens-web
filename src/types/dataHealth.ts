/**
 * DataHealth contract — ported verbatim from AirLens-platform apps/web
 * `src/types/dataHealth.ts`.
 *
 * Source of truth for the shape below: `scripts/etl/build_web_aq_grid.py`
 * `build_health()` (the mac free-tier CDN's `health.json`, 4 fields per
 * source) and `scripts/etl/probe_mac_snapshot.py` `classify_source()` (the
 * 3-way absent / stale / degraded judgment this type's `stale` flag
 * collapses into one boolean).
 */

/** `"fresh"` = this collection run's own output. `"baseline"` = a stale
 *  snapshot being republished because the live collector is down — looks
 *  "available" but is not actually current. `null` = source didn't report it. */
export type ServedFrom = 'fresh' | 'baseline' | null

export interface FeedHealth {
  /** Epoch ms of the source's OWN generation time. Never "now" — null when
   *  the source payload didn't carry one. */
  generatedAt: number | null
  /** `nowMs - generatedAt` at read time. Null when `generatedAt` is null. */
  ageMs: number | null
  /** Feed identifier (mac `health.json` source key — e.g. `'gefs-chem'`, `'cams'`). */
  source: string
  /** Raw provenance label as declared by the source pipeline. */
  servedFrom: ServedFrom
  /** Raw availability as declared by the source pipeline. */
  available: boolean
  /** Combined "don't trust this" signal — absent, past its declared
   *  `expiresAt`, or coasting on a `servedFrom: 'baseline'` snapshot. */
  stale: boolean
}
