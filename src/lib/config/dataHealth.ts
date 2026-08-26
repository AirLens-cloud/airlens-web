/**
 * DataHealth tuning — single hardcoding-avoidance point. Ported verbatim from
 * AirLens-platform apps/web `src/lib/config/dataHealth.ts`.
 *
 * `useDataHealth` polls the mac free-tier CDN's `health.json`
 * (`SNAPSHOT_CDN_BASE` — see `dataSources.ts`) on this cadence. 30 minutes
 * matches the `fetchAQGrid` cache TTL in `api/airQualityGrid.ts` — polling
 * faster than the grid itself refreshes would just be noise.
 */
export const DATA_HEALTH_CONFIG = {
  /** How often to re-fetch `health.json`. */
  pollIntervalMs: 30 * 60 * 1000, // 30 min
  /** Abort a `health.json` fetch that hangs this long. */
  fetchTimeoutMs: 5000,
  /**
   * A poll silence of `pollIntervalMs × pollStaleFactor` is itself treated
   * as degraded — regardless of what the last-fetched `feeds` map says.
   */
  pollStaleFactor: 2,
  /** How often the banner should re-evaluate `isPollStale` against a live clock. */
  pollStaleCheckIntervalMs: 5 * 60 * 1000, // 5 min
} as const
