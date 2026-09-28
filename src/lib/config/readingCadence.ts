/**
 * Refresh cadence for the two sources `resolvePrimaryReading` (`lib/reading/`)
 * chooses between — how often the *source artifact* is republished upstream,
 * not how old any single reading is right now (that's `ageMs`/`stale`,
 * already computed per-hook against `gridSnapshot.ts`'s own
 * `DEFAULT_MAX_AGE_HOURS`). This is a labeling value only ("refreshes every
 * Xh") — it must never be used to judge staleness itself.
 */

/**
 * GEFS-Aerosols grid analysis. `api/gridSnapshot.ts`'s own header comment:
 * "GitHub Actions cron republishes `aq-data/current-pm25-grid.json` every
 * 3h" — corroborated by `lib/config/feeds.ts`'s `CADENCE_3H` on the same
 * `pm25` pipeline (`data-collect-hourly.yml`'s cron cadence for the GEFS
 * pm25/pm10 grids).
 */
export const GRID_REFRESH_MS = 3 * 60 * 60 * 1000

/**
 * Open-Meteo CAMS PM2.5 forecast. `lib/today/forecastSource.ts`'s own header
 * comment: "GitHub Actions cron fetches the Open-Meteo CAMS PM2.5 forecast"
 * plus its source-list comment "cron refreshes the CAMS forecast every 6h" —
 * the same figure `AqiCapsule.tsx`'s idle-bar countdown assumes for a
 * forecast-sourced reading (W1b commit ②: via `reading.refreshMs`, not a
 * local constant).
 */
export const CAMS_REFRESH_MS = 6 * 60 * 60 * 1000
