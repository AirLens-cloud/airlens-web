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
//
// Two renderers per fact (model-facing `format*` vs. plain `format*ForUser`)
// — the model-facing text carries instructions to the LLM ("do not invent
// one", "Do NOT fabricate…") that must never reach an end user verbatim; the
// degraded (budget-exhausted) chat path streams `format*ForUser`'s plain
// text directly, with no LLM pass to strip those instructions for it (PR
// #47 review B1).
import type { Env } from './types';

// ── snapshot schemas — subset of src/types/ml.ts CityPrediction /
//    src/api/policy.ts RawPolicyImpactData that this module actually reads.
// Field types below are the CONTRACT, not a runtime guarantee — every field
// actually interpolated into a prompt or user-facing string is defensively
// re-checked (safeNum/safeStr) before use, because this is a public remote
// dataset this worker does not control (PR #47 review S1).

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
  /** Publisher-side snapshot metadata (predict_grid). `picp80` is the
   *  pipeline's own measured empirical coverage of the 80% band — cited
   *  ONLY when the snapshot itself delivers it (the honesty rule behind
   *  BAND_DISCLOSURE: this worker never hardcodes a coverage figure that
   *  wasn't measured for the artifact that produced these rows). */
  metadata?: {
    band_calibration_applied?: unknown;
    picp80?: unknown;
  };
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

// ── boundary-tag neutralization (PR #47 review S1) ──────────────────────
//
// rag.ts's neutralizeContextDelimiters and prompts.ts's
// neutralizeUserQueryDelimiters each defuse ONE tag they own
// (<retrieved_context>, <user_query>) because their inputs are admin-
// authored (the corpus) or the live end-user turn. This module's inputs are
// neither — they're a public remote HF dataset payload this worker doesn't
// control, so a corrupted or malicious field (country/status/disclaimer/
// name/confidence_grade/model_version) could contain ANY of this worker's
// boundary tags, not just its own — e.g. closing `</structured_context>`
// early and opening a forged `<security_rules>` block. The net here is
// every tag name prompts.ts defines.
const BOUNDARY_TAG_NAMES = [
  'security_rules',
  'platform_context',
  'response_format',
  'causal_reasoning',
  'data_interpretation',
  'retrieved_context',
  'structured_context',
  'user_query',
];
const BOUNDARY_TAG_PATTERN = new RegExp(`<\\/?(?:${BOUNDARY_TAG_NAMES.join('|')})>`, 'gi');

function neutralizeBoundaryTags(text: string): string {
  return text.replace(BOUNDARY_TAG_PATTERN, (tag) => tag.replace(/[<>]/g, (c) => (c === '<' ? '[' : ']')));
}

/** Type-guards a value that the RawPolicyImpactData/CityPredictionRow
 *  interfaces *declare* as a number but whose actual runtime shape (a
 *  parsed remote JSON payload) is unverified — a malformed or malicious
 *  string in a numeric field must not reach a template-string interpolation
 *  unchecked (S1). Returns null (never NaN, never the raw value) so callers
 *  can fall through to the same "unavailable" / honesty-gate path a
 *  genuinely-missing number takes. */
function safeNum(n: unknown): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/** Same defensive-typing role as safeNum, for string fields — and
 *  neutralizes boundary tags in the same pass, so every call site gets
 *  both protections at once. */
function safeStr(s: unknown, fallback: string): string {
  return typeof s === 'string' && s.length > 0 ? neutralizeBoundaryTags(s) : fallback;
}

/** Escapes a string for literal use inside a RegExp — city names can
 *  contain regex metacharacters in principle (dataset is remote/public). */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Word-boundary name match (PR #47 review M2 — the prior `haystack.includes
 * (name)` substring test let "climate" match "Lima" and "aerodrome" match
 * "Rome"). The known city name must appear as a whole word inside the
 * user's message — we never regex-cut the user's own text. This repo's
 * ChatRequest carries no location field (design §2), so a name match in the
 * message is the only city-resolution path (unlike the retired worker,
 * which also had a coordinates-based nearest-city path).
 */
const MIN_NAME_MATCH_LENGTH = 4; // avoid accidental substring hits on short names

export function cityMentionedInMessage(rows: CityPredictionRow[], message: string): CityPredictionRow | null {
  let best: CityPredictionRow | null = null;
  for (const row of rows) {
    const name = row.name.trim();
    if (name.length < MIN_NAME_MATCH_LENGTH) continue;
    const pattern = new RegExp(`\\b${escapeRegExp(name)}\\b`, 'i');
    if (!pattern.test(message)) continue;
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

/** Same resolve-and-compare-origin technique as index.ts isValidSourceUrl
 *  (design §2 H2 pattern) — a second, independent defense on top of S1's
 *  interpolation-time neutralization: HF_LIVE_BASE is an operator-set
 *  wrangler.toml var, not user input, but asserting it once here catches a
 *  misconfiguration (http, a non-URL string) before it's used to build two
 *  fetch URLs per request. */
function isSafeSnapshotBase(base: string): boolean {
  try {
    return new URL(base).protocol === 'https:';
  } catch {
    return false;
  }
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
 * serve, so this disclosure states the uncertainty qualitatively only. A
 * static string literal — no interpolation, so no neutralization needed.
 */
const BAND_DISCLOSURE =
  'band caveat: the p10-p90 band is epistemic-only (model uncertainty). Its ' +
  'own empirical coverage has not been independently verified for this ' +
  'deployment — present it as a lower bound on uncertainty, never as a ' +
  'guarantee, and do not state a coverage percentage that was not provided.';

// ── model-facing renderers (carry instructions to the LLM — system prompt
//    <structured_context> ONLY, never streamed to a user directly) ────────

/** Exported for eval/cases.ts parity (C4) — same reason rag.ts exports
 *  buildGroundedContext: the model-ab harness must feed candidates the
 *  byte-identical evidence production builds. */
export function formatPrediction(row: CityPredictionRow, generatedAt: string): string {
  const ageH = obsAgeHours(generatedAt);
  const staleness = ageH === null ? 'snapshot age: unknown' : `snapshot generated ${ageH}h ago`;
  const name = safeStr(row.name, 'unknown');
  const modelVersion = safeStr(row.model_version, 'unknown');
  const grade = typeof row.confidence_grade === 'string' && row.confidence_grade.length > 0
    ? neutralizeBoundaryTags(row.confidence_grade)
    : null;
  const p10 = safeNum(row.predicted_p10);
  const p50 = safeNum(row.predicted_p50);
  const p90 = safeNum(row.predicted_p90);
  const bandLine =
    p10 !== null && p50 !== null && p90 !== null
      ? `ESTIMATED prediction: median p50 ${p50} µg/m³, band p10-p90 ${p10}-${p90} µg/m³`
      : 'ESTIMATED prediction: unavailable (malformed snapshot data — do not invent a value)';
  const observed =
    typeof row.observed_pm25 === 'number' && Number.isFinite(row.observed_pm25)
      ? `co-located MEASURED observation: ${row.observed_pm25} µg/m³`
      : 'co-located measured observation: none';

  return [
    `[P] own-ML PM2.5 prediction — city: ${name}`,
    bandLine,
    `prediction confidence grade: ${grade ?? '— (not computed; say "미산출"/"not computed", do not invent one)'}`,
    'Note: this repo does not attach a separate DQSS score to this prediction row — do not state one.',
    observed,
    `model: ${modelVersion} | ${staleness}`,
    BAND_DISCLOSURE,
  ].join('\n');
}

/** Grid-level fallback renderer — see LiveDataContext.gridSummary. Tells
 *  the model the grid exists and how fresh it is, while explicitly barring
 *  a per-city attribution the data cannot support. */
export function formatGridSummary(summary: NonNullable<LiveDataContext['gridSummary']>): string {
  const ageH = obsAgeHours(summary.generatedAt);
  const staleness = ageH === null ? 'snapshot age: unknown' : `snapshot generated ${ageH}h ago`;
  const median =
    summary.medianP50 !== null
      ? `median p50 across the grid: ${summary.medianP50} µg/m³`
      : 'median p50 across the grid: unavailable';
  return [
    `[P] own-ML PM2.5 prediction grid — ${summary.count} station-level rows | ${staleness}`,
    `ESTIMATED, station-level: ${median}`,
    'No station in this grid matched the user\'s message (the grid is keyed by station IDs, not city names).',
    'Do NOT present any single number above as "the value for the user\'s city" — offer the grid-level context qualitatively and point the user to /globe or /today for their location.',
  ].join('\n');
}

/** Exported for eval/cases.ts parity (C4) — see formatPrediction. */
export function formatPolicyImpact(snapshot: RawPolicyImpactData): string {
  const ageH = obsAgeHours(snapshot.generated_at);
  const staleness = ageH === null ? 'snapshot age: unknown' : `snapshot generated ${ageH}h ago`;
  const country = safeStr(snapshot.country, 'unknown');
  const att = safeNum(snapshot.att);

  if (att === null) {
    const reason = safeStr(snapshot.status, 'unknown');
    const disclaimer =
      typeof snapshot.data_quality?.disclaimer === 'string' && snapshot.data_quality.disclaimer.length > 0
        ? neutralizeBoundaryTags(snapshot.data_quality.disclaimer)
        : null;
    return [
      `[S] SDID policy causal estimate — country: ${country}`,
      `no ESTIMATE available (honesty gate: ${reason})${disclaimer ? ` — ${disclaimer}` : ''}`,
      'Do NOT fabricate a policy effect for this country; state that the estimate did not pass quality gates.',
      staleness,
    ].join('\n');
  }

  const ci0 = safeNum(snapshot.ci_95?.[0]);
  const ci1 = safeNum(snapshot.ci_95?.[1]);
  const ci = ci0 !== null && ci1 !== null ? `95% CI [${ci0}, ${ci1}]` : '95% CI unavailable';
  const pv = safeNum(snapshot.p_value);
  const p = pv !== null ? `p=${pv}` : 'p-value unavailable';
  // Tri-state (PR #47 review M1) — `significant: null` is a THIRD fact
  // ("not computed"), not the same as "computed and found insignificant"
  // (`false`). Collapsing them previously asserted a negative finding the
  // pipeline never actually made.
  const sig =
    snapshot.significant === true
      ? 'statistically significant'
      : snapshot.significant === false
        ? 'NOT statistically significant'
        : 'significance: not computed';
  const dqss = safeNum(snapshot.data_quality?.dqss_score);
  const ty = safeNum(snapshot.treatment_year);

  return [
    `[S] SDID policy causal estimate — country: ${country} (treatment year ${ty ?? 'unknown'})`,
    `ESTIMATED ATT ${att} µg/m³, ${ci}, ${p} → ${sig}`,
    `panel data quality score: ${dqss ?? 'unknown'}/100`,
    'Frame as an estimated effect under SDID assumptions (parallel trends), never as a proven fact.',
    staleness,
  ].join('\n');
}

// ── user-facing renderers (plain data only — degraded/budget-exhausted
//    chat path, PR #47 review B1: no model instructions may reach here,
//    since nothing downstream strips them before the text streams out) ────

export function formatPredictionForUser(row: CityPredictionRow, generatedAt: string): string {
  const ageH = obsAgeHours(generatedAt);
  const staleness = ageH === null ? 'snapshot age unknown' : `snapshot generated ${ageH}h ago`;
  const name = safeStr(row.name, 'unknown');
  const grade = typeof row.confidence_grade === 'string' && row.confidence_grade.length > 0
    ? neutralizeBoundaryTags(row.confidence_grade)
    : null;
  const p10 = safeNum(row.predicted_p10);
  const p50 = safeNum(row.predicted_p50);
  const p90 = safeNum(row.predicted_p90);
  const band = p10 !== null && p50 !== null && p90 !== null ? `estimated median ${p50} µg/m³ (range ${p10}-${p90} µg/m³)` : 'prediction unavailable';
  const observed = typeof row.observed_pm25 === 'number' && Number.isFinite(row.observed_pm25) ? `, measured ${row.observed_pm25} µg/m³` : '';
  const gradeText = grade ? `, confidence grade ${grade}` : '';
  return `${name}: ${band}${observed}${gradeText} (${staleness})`;
}

export function formatPolicyImpactForUser(snapshot: RawPolicyImpactData): string {
  const country = safeStr(snapshot.country, 'unknown');
  const att = safeNum(snapshot.att);
  if (att === null) {
    const reason = safeStr(snapshot.status, 'unknown');
    return `${country}: no policy-impact estimate available (${reason})`;
  }
  const ci0 = safeNum(snapshot.ci_95?.[0]);
  const ci1 = safeNum(snapshot.ci_95?.[1]);
  const ciText = ci0 !== null && ci1 !== null ? `, 95% CI [${ci0}, ${ci1}]` : '';
  const sig =
    snapshot.significant === true
      ? 'statistically significant'
      : snapshot.significant === false
        ? 'not statistically significant'
        : 'significance not computed';
  return `${country}: estimated policy effect ${att} µg/m³${ciText} (${sig})`;
}

export interface LiveDataContext {
  prediction: { row: CityPredictionRow; generatedAt: string } | null;
  /** Grid-level fallback when the snapshot loaded but no station name
   *  matched the message — the current grid publishes station IDs
   *  ("openaq-2622558"), not city names, so an exact-name match is the
   *  exception, not the rule. A summary keeps the model honestly grounded
   *  ("the grid exists, N rows, this fresh") without inventing a per-city
   *  value it doesn't have. */
  gridSummary: {
    count: number;
    generatedAt: string;
    medianP50: number | null;
  } | null;
  /** Snapshot-level band metadata — non-null only when the publisher put a
   *  finite picp80 figure in grid_latest.json metadata (see
   *  GridLatestSnapshot.metadata). */
  bandCoverage: { picp80: number } | null;
  policy: RawPolicyImpactData | null;
}

/**
 * Assembles the structured live-data context for one request. Every fetch is
 * best-effort with the same timeout+null fallback contract as rag.ts's
 * Vectorize query — a failed snapshot never fails the chat, it just narrows
 * the evidence (fail-honest, design §4 item 4: no invented numbers on tool
 * failure, only a narrower — never wrong — answer). Returns raw matched
 * data, not pre-rendered strings, so callers can choose the model-facing or
 * user-facing renderer from the same fetch (PR #47 review B1).
 */
export async function fetchLiveDataContext(env: Env, message: string, page: string | undefined): Promise<LiveDataContext> {
  const base = env.HF_LIVE_BASE;
  if (!base || !isSafeSnapshotBase(base)) return { prediction: null, gridSummary: null, bandCoverage: null, policy: null };

  const countryCode = countryCodeFromPage(page);

  const [grid, policy] = await Promise.all([
    // aq-data/ is the path the publisher actually writes (verified against
    // the live dataset tree 2026-09-05); the previous ml-data/ prefix has
    // never existed on Robeedau/airlens-live, so every prediction fetch
    // 404'd silently under the fail-open contract.
    fetchSnapshot<GridLatestSnapshot>(`${base}/aq-data/predictions/grid_latest.json`),
    countryCode
      ? fetchSnapshot<RawPolicyImpactData>(`${base}/insights-data/policy-impact/${countryCode}.json`)
      : Promise.resolve<RawPolicyImpactData | null>(null),
  ]);

  let prediction: LiveDataContext['prediction'] = null;
  let gridSummary: LiveDataContext['gridSummary'] = null;
  let bandCoverage: LiveDataContext['bandCoverage'] = null;
  if (grid && Array.isArray(grid.predictions) && grid.predictions.length > 0) {
    const picp80 = safeNum(grid.metadata?.picp80);
    if (picp80 !== null && picp80 > 0 && picp80 <= 1) bandCoverage = { picp80 };
    const mentioned = cityMentionedInMessage(grid.predictions, message);
    if (mentioned) {
      prediction = { row: mentioned, generatedAt: grid.generated_at };
    } else {
      const p50s = grid.predictions
        .map((r) => safeNum(r.predicted_p50))
        .filter((n): n is number => n !== null)
        .sort((a, b) => a - b);
      gridSummary = {
        count: grid.predictions.length,
        generatedAt: grid.generated_at,
        medianP50: p50s.length > 0 ? p50s[Math.floor(p50s.length / 2)] : null,
      };
    }
  }

  return { prediction, gridSummary, bandCoverage, policy: policy && typeof policy.country === 'string' ? policy : null };
}

/**
 * Wraps live-data blocks in the `<structured_context>` boundary tag
 * prompts.ts's response_format section already references. Empty string
 * (not an empty-tag pair) when there is nothing to report — an intent that
 * doesn't call this tool at all should not add a "no data" block the model
 * has to read past.
 */
export function buildStructuredContext(ctx: LiveDataContext): string {
  const blocks: string[] = [];
  if (ctx.prediction) blocks.push(formatPrediction(ctx.prediction.row, ctx.prediction.generatedAt));
  else if (ctx.gridSummary) blocks.push(formatGridSummary(ctx.gridSummary));
  if (ctx.bandCoverage && (ctx.prediction || ctx.gridSummary)) {
    // Snapshot-delivered figure only (GridLatestSnapshot.metadata contract) —
    // this line is the ONE sanctioned way a coverage percentage reaches the
    // model, and it always names its provenance.
    blocks.push(
      `band coverage (from snapshot metadata): the 80% band's measured empirical coverage for this pipeline is PICP80=${ctx.bandCoverage.picp80}. You may phrase this as "약 ${Math.round(ctx.bandCoverage.picp80 * 100)}% 적중이 실측된 범위" — never round it up to a guarantee.`,
    );
  }
  if (ctx.policy) blocks.push(formatPolicyImpact(ctx.policy));
  if (blocks.length === 0) return '';

  return `<structured_context>
The following structured AirLens data was looked up for this question.
Values marked ESTIMATED/prediction are model outputs, not measurements —
never state them with the same certainty as a MEASURED value.

${blocks.join('\n\n')}
</structured_context>`;
}

/**
 * Plain-text lines for the degraded (budget-exhausted) chat path — no
 * model instructions, streamed directly to the user with no LLM pass in
 * between (PR #47 review B1).
 */
export function buildUserFacingSummary(ctx: LiveDataContext): string[] {
  const out: string[] = [];
  if (ctx.prediction) out.push(formatPredictionForUser(ctx.prediction.row, ctx.prediction.generatedAt));
  if (ctx.policy) out.push(formatPolicyImpactForUser(ctx.policy));
  return out;
}
