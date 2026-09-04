#!/usr/bin/env -S node --experimental-strip-types
/**
 * prefetch-fallback-data.mjs — populates the bundled static fallback files
 * (public/data/current-pm25-grid.json, public/data/predictions/cams_forecast.json,
 * public/data/weather/current/wind-{surface,850hpa}.json) from the HF live
 * dataset before every build.
 *
 * Why this exists: `src/api/gridSnapshot.ts`, `src/lib/today/forecastSource.ts`,
 * and `src/api/weather.ts` all cascade to these paths when the HF live fetch
 * fails, but nothing ever wrote the files — the fallback tier was silently
 * inert. Worse, `public/_redirects`'s SPA catch-all (`/* /index.html 200`)
 * answers any missing `/data/*` path with 200 + the index.html shell, so a
 * missing fallback file used to fail as a JSON.parse() error deep in a
 * catch block rather than a clean 404. `functions/data/[[path]].ts` closes
 * that half (turns 200+HTML into an honest 404); this script closes the
 * other half by making sure the files actually exist and are current.
 *
 * fail-soft by design: HF being briefly unreachable during a build must not
 * block deploys of everything else this repo ships. Each target file is
 * fetched independently, failures are logged and skipped (leaving whatever
 * the file already had from the last successful run), and the script always
 * exits 0.
 *
 * Reuses HF_LIVE_BASE / WIND_LEVELS / windLevelSlug from the real TS config
 * modules (`src/lib/config/dataSources.ts`, `src/lib/config/feeds.ts`)
 * instead of a second hand-typed copy of those paths — same
 * `--experimental-strip-types` type-only-import technique as
 * `scripts/build-corpus.mjs` (Node 22.6+; CI runs Node 22, see
 * .github/workflows/{ci,deploy}.yml). `.npmrc` sets `ignore-scripts=true`,
 * so this only runs via the explicit `npm run build` chain in package.json
 * — never as an npm lifecycle hook.
 *
 * Deliberately dependency-free: built-in `fetch`/`fs`/`path` only.
 */
import { writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { HF_LIVE_BASE } from '../src/lib/config/dataSources.ts'
import { WIND_LEVELS, windLevelSlug } from '../src/lib/config/feeds.ts'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const FETCH_TIMEOUT_MS = 15_000

const TARGETS = [
  { url: `${HF_LIVE_BASE}/aq-data/current-pm25-grid.json`, out: 'public/data/current-pm25-grid.json' },
  { url: `${HF_LIVE_BASE}/aq-data/forecast.json`, out: 'public/data/predictions/cams_forecast.json' },
  ...WIND_LEVELS.map((level) => {
    const slug = windLevelSlug(level)
    return { url: `${HF_LIVE_BASE}/wind-data/${slug}.json`, out: `public/data/weather/current/${slug}.json` }
  }),
]

/**
 * Fetch one target and write it to disk. Rejects HTML bodies (HF serves
 * JSON as `text/plain`, so a `text/html` content-type here means something
 * upstream — a CDN error page, a redirect landing page — is not the
 * artifact) and empty/unparsable bodies before ever touching the file on
 * disk, so a bad response can never clobber a previously-good fallback.
 */
async function fetchOne({ url, out }) {
  const dest = join(ROOT, out)
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const contentType = res.headers.get('content-type') ?? ''
    if (contentType.includes('text/html')) {
      throw new Error(`content-type "${contentType}" — looks like an HTML error page, not the artifact`)
    }
    const text = await res.text()
    if (!text.trim()) throw new Error('empty response body')
    JSON.parse(text) // throws on malformed JSON — validate before writing
    await mkdir(dirname(dest), { recursive: true })
    await writeFile(dest, text)
    console.log(`ok    ${out}  (${(text.length / 1024).toFixed(0)} KB)`)
    return true
  } catch (err) {
    console.warn(`skip  ${out} — ${err instanceof Error ? err.message : String(err)}`)
    return false
  }
}

const results = await Promise.all(TARGETS.map(fetchOne))
const okCount = results.filter(Boolean).length
console.log(`prefetch-fallback-data: ${okCount}/${TARGETS.length} files updated`)

// Always exit 0 (fail-soft — see module header). A partial or total miss
// here must not block the build.
process.exit(0)
