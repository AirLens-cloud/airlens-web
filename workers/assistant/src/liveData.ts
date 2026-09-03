// liveData.ts — structured live-data tool call (C3, design §4 stage 3 +
// §1 D-5). Fetches the SAME public HF snapshots the frontend renders
// (`src/api/predictions.ts`, `src/api/policy.ts` — this worker keeps its own
// minimal type mirror rather than importing browser code, same convention as
// rag.ts's CorpusVectorMetadata) and formats them into a labeled evidence
// block for the system prompt (`<structured_context>`, referenced by
// prompts.ts's response_format section since C2).
//
// Server-Collect: the worker fetches a public, keyless, CDN-served HF
// dataset — the same one the browser reads directly (dataSources.ts) — so
// this adds no new external-API exposure. Every fetch is best-effort with a
// timeout + null fallback, same fail-open contract as rag.ts: a failed
// snapshot narrows the evidence, it never fails the chat request (Glass-box
// §D-5 fail-honest: no fabricated numbers, an honest "unavailable" instead).
import type { Env } from './types';

// ── snapshot schemas — subset of src/types/ml.ts CityPrediction /
//    src/api/policy.ts RawPolicyImpactData that this module actually reads.

export interface CityPredictionRow {
  name: string;
  lat: number;
  lon: number;
  predicted_p10: number;
  predicted_p50: number;
  predicted_p90: number;
  observed_pm25?: number | null;
  model_version?: string;
  confidence_grade?: string | null;
}

interface GridLatestSnapshot {
  generated_at: string;
  model_version: string;
  predictions: CityPredictionRow[];
}

interface RawPolicyImpactData {
  country: string;
  method: string;
  att: number | null;
  ci_95: [number, number] | null;
  p_value: number | null;
  significant: boolean | null;
  status?: string | null;
  treatment_year: number | null;
  data_quality?: { dqss_score?: number; disclaimer?: string };
  generated_at?: string;
}

const FETCH_TIMEOUT_MS = 3000;
const SNAPSHOT_CACHE_TTL_MS = 5 * 60 * 1000; // isolate-level memo — snapshots refresh hourly at most

/**
 * Containment-inversion name match (ported from the retired chatbot worker's
 * causalData.ts cityMentionedInMessage): the known city name must appear
 * inside the user's message — we never regex-cut the user's own text. This
 * repo's ChatRequest carries no location field (design §2), so a name match
 * in the message is the only city-resolution path (unlike the retired
 * worker, which also had a coordinates-based nearest-city path).
 */
const MIN_NAME_MATCH_LENGTH = 4; // avoid accidental substring hits on short names

export function cityMentionedInMessage(rows: CityPredictionRow[], message: string): CityPredictionRow | null {
  const haystack = message.toLowerCase();
  let best: CityPredictionRow | null = null;
  for (const row of rows) {
    const name = row.name.trim().toLowerCase();
    if (name.length < MIN_NAME_MATCH_LENGTH) continue;
    if (!haystack.includes(name)) continue;
    if (!best || name.length > best.name.trim().length) best = row;
  }
  return best;
}

/**
 * Extracts a country code from the `page` context hint (design §2 example:
 * `page: '/country/KR'`) — the only location signal this repo's ChatRequest
 * carries. Returns null for any other route (a country-profile page is the
 * one place a 2-3 letter code is unambiguous; guessing from message text
 * would risk matching an unrelated word).
 */
export function countryCodeFromPage(page: string | undefined): string | null {
  if (!page) return null;
  const match = /^\/country\/([A-Za-z]{2,3})(?:[/?#]|$)/.exec(page);
  return match ? match[1].toUpperCase() : null;
}

interface MemoEntry {
  at: number;
  value: unknown;
}
const snapshotMemo = new Map<string, MemoEntry>();

async function fetchSnapshot<T>(url: string): Promise<T | null> {
  const memo = snapshotMemo.get(url);
  if (memo && Date.now() - memo.at < SNAPSHOT_CACHE_TTL_MS) return memo.value as T;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) {
      console.warn(`liveData fetch failed: ${res.status} ${url}`);
      return null;
    }
    const value = (await res.json()) as T;
    snapshotMemo.set(url, { at: Date.now(), value });
    return value;
  } catch (err) {
    console.warn('liveData fetch error:', err instanceof Error ? err.message : err);
    return null;
  }
}

/** Test seam — clears the isolate memo between test cases. */
export function clearSnapshotMemo(): void {
  snapshotMemo.clear();
}

/** Hours between an ISO timestamp and now — used in place of "실시간"/
 *  "real-time" language (design §1 D-5: "obs_age_h 수치 노출로 대체"). null
 *  when the timestamp is missing or unparseable, never a fabricated 0. */
function obsAgeHours(iso: string | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const hours = (Date.now() - t) / 3_600_000;
  return hours >= 0 ? Math.round(hours * 10) / 10 : null;
}

/**
 * This repo's own registry carries no independently-measured coverage figure
 * for the epistemic p10-p90 band (unlike the retired worker's causalData.ts,
 * which cited specific measured coverage numbers for ITS deployed artifact —
 * a different model/pipeline, so those numbers do not transfer here). Citing
 * an unverified number would itself violate the honesty rule it's meant to
 * serve, so this disclosure states the uncertainty qualitatively only.
 */
const BAND_DISCLOSURE =
  'band caveat: the p10-p90 band is epistemic-only (model uncertainty). Its ' +
  'own empirical coverage has not been independently verified for this ' +
  'deployment — present it as a lower bound on uncertainty, never as a ' +
  'guarantee, and do not state a coverage percentage that was not provided.';

/** Exported for eval/cases.ts parity (C4) — same reason rag.ts exports
 *  buildGroundedContext: the model-ab harness must feed candidates the
 *  byte-identical evidence production builds. */
export function formatPrediction(row: CityPredictionRow, generatedAt: string): string {
  const ageH = obsAgeHours(generatedAt);
  const staleness = ageH === null ? 'snapshot age: unknown' : `snapshot generated ${ageH}h ago`;
  const observed =
    typeof row.observed_pm25 === 'number'
      ? `co-located MEASURED observation: ${row.observed_pm25} µg/m³`
      : 'co-located measured observation: none';
  const grade = row.confidence_grade ?? null;

  return [
    `[P] own-ML PM2.5 prediction — city: ${row.name}`,
    `ESTIMATED prediction: median p50 ${row.predicted_p50} µg/m³, band p10-p90 ${row.predicted_p10}-${row.predicted_p90} µg/m³`,
    `prediction confidence grade: ${grade ?? '— (not computed; say "미산출"/"not computed", do not invent one)'}`,
    'Note: this repo does not attach a separate DQSS score to this prediction row — do not state one.',
    observed,
    `model: ${row.model_version || 'unknown'} | ${staleness}`,
    BAND_DISCLOSURE,
  ].join('\n');
}

/** Exported for eval/cases.ts parity (C4) — see formatPrediction. */
export function formatPolicyImpact(snapshot: RawPolicyImpactData): string {
  const ageH = obsAgeHours(snapshot.generated_at);
  const staleness = ageH === null ? 'snapshot age: unknown' : `snapshot generated ${ageH}h ago`;

  if (snapshot.att === null || snapshot.att === undefined) {
    const reason = snapshot.status ?? 'unknown';
    const disclaimer = snapshot.data_quality?.disclaimer;
    return [
      `[S] SDID policy causal estimate — country: ${snapshot.country}`,
      `no ESTIMATE available (honesty gate: ${reason})${disclaimer ? ` — ${disclaimer}` : ''}`,
      'Do NOT fabricate a policy effect for this country; state that the estimate did not pass quality gates.',
      staleness,
    ].join('\n');
  }

  const ci = snapshot.ci_95 ? `95% CI [${snapshot.ci_95[0]}, ${snapshot.ci_95[1]}]` : '95% CI unavailable';
  const p = snapshot.p_value != null ? `p=${snapshot.p_value}` : 'p-value unavailable';
  const sig = snapshot.significant === true ? 'statistically significant' : 'NOT statistically significant';
  const dqss = snapshot.data_quality?.dqss_score;

  return [
    `[S] SDID policy causal estimate — country: ${snapshot.country} (treatment year ${snapshot.treatment_year ?? 'unknown'})`,
    `ESTIMATED ATT ${snapshot.att} µg/m³, ${ci}, ${p} → ${sig}`,
    `panel data quality score: ${dqss ?? 'unknown'}/100`,
    'Frame as an estimated effect under SDID assumptions (parallel trends), never as a proven fact.',
    staleness,
  ].join('\n');
}

export interface LiveDataContext {
  /** Serialized evidence blocks ready for the <structured_context> section. */
  blocks: string[];
}

/**
 * Assembles the structured live-data context for one request. Every fetch is
 * best-effort with the same timeout+null fallback contract as rag.ts's
 * Vectorize query — a failed snapshot never fails the chat, it just narrows
 * the evidence (fail-honest, design §4 item 4: no invented numbers on tool
 * failure, only a narrower — never wrong — answer).
 */
export async function fetchLiveDataContext(env: Env, message: string, page: string | undefined): Promise<LiveDataContext> {
  const blocks: string[] = [];
  const base = env.HF_LIVE_BASE;
  if (!base) return { blocks };

  const countryCode = countryCodeFromPage(page);

  const [grid, policy] = await Promise.all([
    fetchSnapshot<GridLatestSnapshot>(`${base}/ml-data/predictions/grid_latest.json`),
    countryCode
      ? fetchSnapshot<RawPolicyImpactData>(`${base}/insights-data/policy-impact/${countryCode}.json`)
      : Promise.resolve<RawPolicyImpactData | null>(null),
  ]);

  if (grid && Array.isArray(grid.predictions) && grid.predictions.length > 0) {
    const mentioned = cityMentionedInMessage(grid.predictions, message);
    if (mentioned) blocks.push(formatPrediction(mentioned, grid.generated_at));
  }

  if (policy && typeof policy.country === 'string') {
    blocks.push(formatPolicyImpact(policy));
  }

  return { blocks };
}

/**
 * Wraps live-data blocks in the `<structured_context>` boundary tag
 * prompts.ts's response_format section already references. Empty string
 * (not an empty-tag pair) when there is nothing to report — an intent that
 * doesn't call this tool at all should not add a "no data" block the model
 * has to read past.
 */
export function buildStructuredContext(blocks: string[]): string {
  if (blocks.length === 0) return '';
  return `<structured_context>
The following structured AirLens data was looked up for this question.
Values marked ESTIMATED/prediction are model outputs, not measurements —
never state them with the same certainty as a MEASURED value.

${blocks.join('\n\n')}
</structured_context>`;
}
