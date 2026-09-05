/**
 * forecastBand — TimesFM zero-shot + CQR conformal PM2.5 forecast band
 * (`w3-band-v1`). Published every 6h to the public HF live dataset
 * (`Robeedau/airlens-live`, `aq-data/forecast-band/latest.json`) by the
 * AirLens-platform models pipeline; fetched directly like every other
 * `src/api/*.ts` module (no auth, no server hop — see `HF_LIVE_BASE`'s
 * header in `lib/config/dataSources.ts`). Live-probed 2026-09-05: HTTP 200,
 * no credentials, 44 cities, `lead_hours` observed as {1, 6, 24} only.
 *
 * EXPERIMENTAL model track: the artifact ships `dqss.status: "unscored"`
 * rather than a fabricated letter grade, and each horizon's 80% interval is
 * a nominal CQR band whose empirical holdout coverage is reported
 * per-horizon in `uncertainty.picp80_claim_by_horizon` — not a live
 * guarantee. Callers must not upgrade either into something the payload did
 * not claim.
 *
 * Only h+1 / h+6 / h+24 are served here — `parseHorizon` drops any other
 * `lead_hours` value (an h+48 horizon, if the artifact ever ships one,
 * included) rather than rendering it. p10/p50/p90 are `number | null` end to
 * end and a null is never coerced to 0: `Number(null) === 0` and a
 * `Float32Array` write both silently turn "unmeasured" into a false "0
 * µg/m³" reading (see `airQualityGrid.ts`'s header for the fuller account of
 * that failure mode). A payload whose `schema_version` this module does not
 * recognise is rejected outright — never rendered under this version's
 * assumptions.
 */
import { HF_LIVE_BASE } from '../lib/config/dataSources'
import {
  FORECAST_BAND_SCHEMA_VERSION,
  FORECAST_BAND_LEAD_HOURS,
  type ForecastBandCity,
  type ForecastBandDqss,
  type ForecastBandHorizon,
  type ForecastBandPicpClaim,
  type ForecastBandResponse,
  type ForecastBandUncertainty,
} from '../types/forecastBand'

const HF_OBJECT_PATH = 'aq-data/forecast-band/latest.json'
const FETCH_TIMEOUT_MS = 5000
const VALID_LEAD_HOURS: ReadonlySet<number> = new Set(FORECAST_BAND_LEAD_HOURS)

export type ForecastBandResult = { ok: true; data: ForecastBandResponse } | { ok: false }

function isFiniteNumberOrNull(v: unknown): v is number | null {
  return v === null || (typeof v === 'number' && Number.isFinite(v))
}

function parseHorizon(raw: unknown): ForecastBandHorizon | null {
  if (typeof raw !== 'object' || raw === null) return null
  const h = raw as Record<string, unknown>
  const leadHours = h.lead_hours
  // Drops h+48 (and any other unrecognised horizon) rather than rendering it.
  if (typeof leadHours !== 'number' || !VALID_LEAD_HOURS.has(leadHours)) return null
  if (typeof h.valid_time !== 'string') return null
  if (!isFiniteNumberOrNull(h.p10) || !isFiniteNumberOrNull(h.p50) || !isFiniteNumberOrNull(h.p90)) {
    return null
  }
  return {
    lead_hours: leadHours as ForecastBandHorizon['lead_hours'],
    valid_time: h.valid_time,
    // Already narrowed to `number | null` above — no `?? 0` fallback here,
    // ever (that would be exactly the null-to-zero coercion this module
    // exists to avoid).
    p10: h.p10 as number | null,
    p50: h.p50 as number | null,
    p90: h.p90 as number | null,
  }
}

function parseCity(raw: unknown): ForecastBandCity | null {
  if (typeof raw !== 'object' || raw === null) return null
  const c = raw as Record<string, unknown>
  if (typeof c.name !== 'string' || !c.name.trim()) return null
  if (!Array.isArray(c.horizons)) return null
  const horizons = c.horizons
    .map(parseHorizon)
    .filter((h): h is ForecastBandHorizon => h !== null)
  return { name: c.name, horizons }
}

function parsePicpClaim(raw: unknown): ForecastBandPicpClaim | null {
  if (typeof raw !== 'object' || raw === null) return null
  const c = raw as Record<string, unknown>
  const status = c.status
  if (status !== 'ok' && status !== 'provisional' && status !== 'no_holdout_claim') return null
  return {
    picp80_holdout: isFiniteNumberOrNull(c.picp80_holdout) ? c.picp80_holdout : null,
    n_holdout: typeof c.n_holdout === 'number' ? c.n_holdout : 0,
    status,
  }
}

/** Malformed/missing `uncertainty` → `null`, never a fabricated method string
 * or claim map — this block is supplementary Glass-box context, not core
 * band data, so it degrades independently of the horizons above. */
function parseUncertainty(raw: unknown): ForecastBandUncertainty | null {
  if (typeof raw !== 'object' || raw === null) return null
  const u = raw as Record<string, unknown>
  const byHorizonRaw = u.picp80_claim_by_horizon
  const picp80ClaimByHorizon: Record<string, ForecastBandPicpClaim> = {}
  if (typeof byHorizonRaw === 'object' && byHorizonRaw !== null) {
    for (const [key, val] of Object.entries(byHorizonRaw as Record<string, unknown>)) {
      const claim = parsePicpClaim(val)
      if (claim) picp80ClaimByHorizon[key] = claim
    }
  }
  return {
    method: typeof u.method === 'string' ? u.method : null,
    picp80_claim_by_horizon: picp80ClaimByHorizon,
    provisional_horizons: Array.isArray(u.provisional_horizons)
      ? u.provisional_horizons.filter((n): n is number => typeof n === 'number')
      : [],
  }
}

function parseDqss(raw: unknown): ForecastBandDqss | null {
  if (typeof raw !== 'object' || raw === null) return null
  const d = raw as Record<string, unknown>
  return {
    grade: typeof d.grade === 'string' ? d.grade : null,
    status: typeof d.status === 'string' ? d.status : 'unscored',
    reason: typeof d.reason === 'string' ? d.reason : null,
  }
}

/**
 * Rejects the whole payload (`null`) on a `schema_version` this module does
 * not know how to read, or a top-level shape that doesn't match the
 * documented contract — an explicit fail, never a best-effort render of an
 * unverified shape. A malformed individual city/horizon is dropped instead
 * (handled by `parseCity`/`parseHorizon`), since one bad row is not evidence
 * the whole document is a different contract.
 */
function parseResponse(json: unknown): ForecastBandResponse | null {
  if (typeof json !== 'object' || json === null) return null
  const j = json as Record<string, unknown>
  if (j.schema_version !== FORECAST_BAND_SCHEMA_VERSION) return null
  if (typeof j.generated_at !== 'string') return null
  if (typeof j.issue_time !== 'string') return null
  if (typeof j.model !== 'string') return null
  if (!Array.isArray(j.cities)) return null
  const cities = j.cities.map(parseCity).filter((c): c is ForecastBandCity => c !== null)
  return {
    schema_version: j.schema_version,
    generated_at: j.generated_at,
    model: j.model,
    issue_time: j.issue_time,
    cities,
    uncertainty: parseUncertainty(j.uncertainty),
    dqss: parseDqss(j.dqss),
  }
}

export async function fetchForecastBand(): Promise<ForecastBandResult> {
  try {
    const res = await fetch(`${HF_LIVE_BASE}/${HF_OBJECT_PATH}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!res.ok) return { ok: false }
    // Same SPA-catch-all guard as `today/forecastSource.ts` — a 200 that is
    // actually the app shell must not be parsed as the artifact.
    const contentType = res.headers?.get('content-type') ?? ''
    if (contentType.includes('text/html')) return { ok: false }
    const json = await res.json()
    const parsed = parseResponse(json)
    return parsed ? { ok: true, data: parsed } : { ok: false }
  } catch {
    return { ok: false }
  }
}
