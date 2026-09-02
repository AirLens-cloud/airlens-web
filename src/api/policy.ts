/**
 * SDID policy-impact reader.
 *
 * Adapted from AirLens-platform `apps/web/src/api/policy.ts`. Three changes,
 * each forced by what this repo actually has:
 *
 * 1. **One tier, not three.** The source read Supabase `policy_results` first,
 *    then the static JSON, then a mockup file. Supabase is retired, and the
 *    mockup tier shipped invented ATT numbers behind a dev flag. What remains
 *    is the published artifact — `insights-data/policy-impact/` on the HF live
 *    dataset — which is also the freshest: the 2026-08-26 ACAG re-estimation.
 *
 * 2. **No fabricated band.** The source turned each synthetic-control point
 *    into `p10 = pm25 × 0.8 / p90 = pm25 × 1.25` from a constant, and fed that
 *    to the trend chart as an uncertainty interval. Those multipliers measured
 *    nothing. The real per-year interval lives in `insights-data/by_country/`
 *    and is read by `api/countrySeries.ts`; this module no longer emits
 *    before/after series at all.
 *
 * 3. **`cross_check` is surfaced.** The re-estimation publishes what two
 *    independent lanes (CAMS EAC4, ground stations) concluded on the same
 *    country. The monorepo predates the field and dropped it.
 */
import { POLICY_IMPACT_BASE } from '../lib/config/dataSources'
import { ATT_PLAUSIBLE_MAX, POLICY_FIT_GRADE_CUTOFFS } from '../lib/config/policy'
import { logger } from '../lib/logger'
import type {
  CrossCheckLane,
  LaneCrossCheck,
  PolicyImpact,
  PolicyIndexEntry,
  PolicySummary,
  RawSyntheticPoint,
  SdidPoint,
} from '../types/policy'

const POLICY_INDEX_URL = `${POLICY_IMPACT_BASE}/index.json`
const POLICY_SUMMARY_URL = `${POLICY_IMPACT_BASE}/summary.json`

interface RawCrossCheckLane {
  att?: number | null
  status?: string | null
  p_value?: number | null
}

interface RawPolicyImpactData {
  country: string
  method: string
  panel_source?: string | null
  // att / se / ci_95 / p_value are null for honesty-gated countries (no valid
  // counterfactual). `status` carries the gate reason.
  att: number | null
  se: number | null
  ci_95: [number, number] | null
  p_value: number | null
  significant: boolean
  status?: string
  treatment_year: number
  synthetic_control: RawSyntheticPoint[]
  robustness?: {
    parallel_trend?: { p_value?: number | null; pass?: boolean | null }
    placebo?: { mean?: number | null; pass?: boolean | null }
  }
  generated_at?: string
  data_quality?: {
    dqss_score?: number
    station_count?: number
    coverage_years?: number
    data_source?: string
    disclaimer?: string
  }
  cross_check?: Record<string, RawCrossCheckLane>
}

/**
 * SDID panel *fit* score → grade. Shares a letter scale with sensor DQSS and
 * nothing else: this one comes from station density, period coverage, source
 * mix, parallel trends and robustness. Converting between the two would be
 * measuring different things with the same ruler, so they stay apart.
 */
function policyFitToGrade(score: number | undefined): 'A' | 'B' | 'C' | 'D' | 'F' | undefined {
  // No computed score → no grade (the UI renders '—'), never a fabricated 'C'.
  if (score === undefined || !Number.isFinite(score)) return undefined
  for (const [floor, grade] of POLICY_FIT_GRADE_CUTOFFS) {
    if (score >= floor) return grade
  }
  return 'F'
}

function toNumber(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null
  const n = typeof v === 'number' ? v : parseFloat(v)
  return Number.isFinite(n) ? n : null
}

/** Year from a `date` field — tolerates "YYYY" and "YYYY-MM" without losing precision. */
function parseYear(d: string | number | null | undefined): number | null {
  if (d === null || d === undefined) return null
  const y = Number(String(d).slice(0, 4))
  return Number.isInteger(y) ? y : null
}

/** synthetic_control[] → yearly observed-vs-synthetic curve, non-finite dropped. */
function mapSyntheticControl(sc: unknown): SdidPoint[] | undefined {
  if (!Array.isArray(sc)) return undefined
  const out: SdidPoint[] = []
  for (const raw of sc as RawSyntheticPoint[]) {
    const year = parseYear(raw?.date)
    const observed = toNumber(raw?.pm25)
    const synthetic = toNumber(raw?.synthetic_pm25)
    if (year === null || observed === null || synthetic === null) continue
    out.push({ year, observed, synthetic })
  }
  if (out.length === 0) return undefined
  return out.sort((a, b) => a.year - b.year)
}

function mapLane(raw: RawCrossCheckLane | undefined): CrossCheckLane | undefined {
  if (!raw) return undefined
  return {
    att: toNumber(raw.att),
    status: raw.status ?? null,
    p_value: toNumber(raw.p_value),
  }
}

function mapCrossCheck(raw: Record<string, RawCrossCheckLane> | undefined): LaneCrossCheck | undefined {
  if (!raw) return undefined
  const cams = mapLane(raw.cams_eac4)
  const ground = mapLane(raw.ground_stations)
  if (!cams && !ground) return undefined
  return { ...(cams ? { cams_eac4: cams } : {}), ...(ground ? { ground_stations: ground } : {}) }
}

function mapRawPolicyData(raw: RawPolicyImpactData, index: PolicyIndexEntry | undefined): PolicyImpact {
  const sc = Array.isArray(raw.synthetic_control) ? raw.synthetic_control : []
  const eventName = sc.find((p) => p.event)?.event
  const ci = Array.isArray(raw.ci_95) ? raw.ci_95 : null

  return {
    id: raw.country,
    country: raw.country,
    city: index?.country ?? raw.country,
    flag: index?.flag,
    title: eventName || undefined,
    att: raw.att,
    ci_low: ci ? ci[0] : null,
    ci_high: ci ? ci[1] : null,
    p_value: raw.p_value,
    significant: raw.significant ?? null,
    dqss: policyFitToGrade(raw.data_quality?.dqss_score),
    sdid_series: mapSyntheticControl(raw.synthetic_control),
    status: raw.status,
    panelSource: raw.panel_source ?? null,
    robustness: raw.robustness
      ? {
          parallelTrendPass: raw.robustness.parallel_trend?.pass ?? null,
          placeboPass: raw.robustness.placebo?.pass ?? null,
          placeboMean: toNumber(raw.robustness.placebo?.mean),
        }
      : undefined,
    crossCheck: mapCrossCheck(raw.cross_check),
  }
}

let _indexCache: PolicyIndexEntry[] | null = null
let _summaryCache: PolicySummary | null = null

/** Test seam — drops the memoized index/summary so a fetch runs again. */
export function resetPolicyIndexCache(): void {
  _indexCache = null
  _summaryCache = null
}

/**
 * The whole estimated set in one request: every country the SDID batch ran on,
 * with its verdict and the gate reason when it declined.
 *
 * It exists because the alternative — probing 119 files to learn which ones
 * exist — makes "which countries were analysed" cost 119 round trips, and the
 * index alone cannot answer it: the index labels 124 countries, of which only
 * 118 were estimated, and one estimated country is missing from it entirely.
 *
 * Returns null (never throws) so the page can say the result set is unavailable
 * rather than presenting an empty one as "nothing was analysed".
 */
export async function fetchPolicySummary(): Promise<PolicySummary | null> {
  if (_summaryCache) return _summaryCache
  try {
    const res = await fetch(POLICY_SUMMARY_URL)
    if (!res.ok) return null
    const parsed = (await res.json()) as PolicySummary
    if (!Array.isArray(parsed?.countries)) return null
    _summaryCache = parsed
    return _summaryCache
  } catch (err) {
    logger.warn('fetchPolicySummary failed:', err)
    return null
  }
}

export async function fetchPolicyIndex(): Promise<PolicyIndexEntry[]> {
  if (_indexCache) return _indexCache
  try {
    const res = await fetch(POLICY_INDEX_URL)
    if (!res.ok) return []
    const parsed = (await res.json()) as PolicyIndexEntry[]
    if (!Array.isArray(parsed)) return []
    _indexCache = parsed
    return _indexCache
  } catch (err) {
    logger.warn('fetchPolicyIndex failed:', err)
    return []
  }
}

/**
 * One country's SDID impact.
 *
 * `null` means ABSENT: no file is published for this country (404). Anything
 * else — a 5xx, a network error, unparseable JSON — THROWS, because "we could
 * not read it" and "there is nothing to read" are different facts and the
 * caller has different copy for each. Collapsing them, which an earlier version
 * of this function did, made a transient outage render as "this country was
 * never analysed".
 *
 * Glass-box: att / ci / p_value stay null for honesty-gated countries — the
 * caller surfaces the reason via `attGateReason`, never a substitute number.
 */
export async function fetchCountryPolicyImpact(countryCode: string): Promise<PolicyImpact | null> {
  const cc = (countryCode ?? '').toUpperCase()
  if (!/^[A-Z]{2,3}$/.test(cc)) return null
  const res = await fetch(`${POLICY_IMPACT_BASE}/${cc}.json`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`policy-impact/${cc}.json: HTTP ${res.status}`)
  const raw = (await res.json()) as RawPolicyImpactData
  const index = await fetchPolicyIndex()
  const entry = index.find((e) => e.countryCode.toUpperCase() === cc)
  return mapRawPolicyData(raw, entry)
}

export type AttReliability = 'reliable' | 'insignificant' | 'unstable' | 'no_data'

/**
 * Glass-box reliability of an SDID ATT estimate.
 *  - 'no_data': att is null → the honesty gate found no valid counterfactual.
 *      Distinct from 'insignificant': no causal estimate was run at all, so it
 *      must never read as "ran, found no effect".
 *  - 'unstable': |att| beyond ATT_PLAUSIBLE_MAX → synthetic-control divergence.
 *  - 'insignificant': estimated but not distinguishable from zero.
 *  - 'reliable': otherwise.
 * Most estimates in the batch are insignificant or gated; this drives the muted
 * style that keeps them from being read as confirmed effects.
 */
export function attReliability(
  p: Pick<PolicyImpact, 'att' | 'p_value' | 'ci_low' | 'ci_high' | 'significant'>,
): AttReliability {
  const { att } = p
  if (att === null || att === undefined) return 'no_data'
  if (Math.abs(att) > ATT_PLAUSIBLE_MAX) return 'unstable'
  const ciCrossesZero =
    p.ci_low !== null && p.ci_low !== undefined &&
    p.ci_high !== null && p.ci_high !== undefined &&
    p.ci_low <= 0 && p.ci_high >= 0
  const insignificant =
    p.significant === false ||
    (p.p_value !== null && p.p_value !== undefined && p.p_value >= 0.05) ||
    ciCrossesZero
  return insignificant ? 'insignificant' : 'reliable'
}

/**
 * Why a gated country has no estimate, so the UI can say which wall the
 * pipeline hit instead of a generic "no data".
 *
 * The monorepo returned an i18n key plus a Korean fallback; this repo has no
 * i18n layer, so the English sentence is the value.
 */
export function attGateReason(status?: string | null): string {
  switch (status) {
    case 'insufficient_controls':
      return 'No clean control countries — a counterfactual could not be built.'
    case 'poor_pre_fit':
      return 'Counterfactual fit rejected — pre-treatment trends did not match.'
    case 'degenerate_weights':
    case 'degenerate_synth':
      return 'Synthetic control was unstable — the estimate is not trustworthy.'
    case 'no_pre_period':
    case 'no_post_period':
    case 'no_treatment':
      return 'Too little observed history around the policy to estimate an effect.'
    default:
      return 'Not enough data to construct a counterfactual.'
  }
}

/** Test-only handle — keeps the mapper private to runtime callers. */
export const __test = { mapRawPolicyData, policyFitToGrade }
