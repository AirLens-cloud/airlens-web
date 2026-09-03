// eval/generation-smoke.eval.test.ts — asserts generation isn't silently
// empty OR badly truncated. No judge, no quality scoring — this is a
// pass/fail smoke test for the exact failure shape the A-5 incident
// produced in production.
//
// A-5 (2026-09-03): a real user question against the deployed worker
// returned citations:5 / token:0 / done — HTTP 200, no exception,
// budget:"ok", and a blank answer bubble next to real citation links.
//
// A-5 FOLLOW-UP ROUND 1 (2026-09-03): this suite originally used a
// synthetic FAKE_MATCHES fixture (5 citations with repeated boilerplate
// excerpt text) and asserted only `text.length > 0` — a threshold so weak
// a 7-character answer passes it. That combination PASSED in CI on the same
// commit a live production re-gate proved still truncated both incident
// questions to 7-37 characters. Root cause: the real RAG path embeds the
// question (bge-m3) and retrieves REAL corpus excerpts from Vectorize —
// varied, information-dense text that measurably draws more
// reasoning-token budget from this thinking model than the synthetic
// fixture's repeated boilerplate did. A gate that doesn't exercise the real
// retrieval path isn't measuring what production actually sends the model.
//
// ROUND 2 fixes both gaps:
//   1. Real retrieval — embedQuery + Vectorize query (returnMetadata:'all')
//      against the live corpus, mirroring retrieval.eval.test.ts's REST
//      pattern, for the SAME questions that reproduced A-5 in production.
//   2. A real minimum-length assertion — grounded in actual measured normal
//      answers at MAX_TOKENS=2048 with real retrieval: 527 chars (DQSS
//      question) and 631 chars (AQI question). MIN_ANSWER_CHARS=150 is set
//      well below both (a 37-char truncation, the exact A-5 shape, still
//      fails it) without being so tight that natural answer-length
//      variance (temperature=0.3) produces a false failure.
// finish_reason:"length" still fails independently — a truncated answer
// that happens to clear MIN_ANSWER_CHARS must still fail this gate.
//
// OPT-IN: skipped unless CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_WORKERS_AI_TOKEN
// are set (same env pair as every other eval in this directory — the token
// needs BOTH Workers AI Read/Run and Vectorize Read, same as
// retrieval.eval.test.ts). A missing env must SKIP loudly, never fake a pass.
import { describe, it, expect } from 'vitest';
import wranglerToml from '../wrangler.toml?raw';
import { GENERATOR_ENABLED, generateAnswer, wranglerVars } from './generate';
import type { RetrievedMatch } from '../src/rag';
import type { CorpusVectorMetadata } from '../src/types';

declare const process: { env: Record<string, string | undefined> };

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const AI_TOKEN = process.env.CLOUDFLARE_WORKERS_AI_TOKEN;

// The exact two questions that reproduced the A-5 incident in production
// (team-lead's live re-gate, 2026-09-03).
const QUESTIONS = ['DQSS 점수가 뭔가요?', 'AQI 등급은 어떻게 계산하나요?'];

// Well below both real measured normal-answer lengths (527, 631 chars) at
// MAX_TOKENS=2048 with real retrieval; well above the truncated A-5 shape
// (7-37 chars) — see this file's header comment.
const MIN_ANSWER_CHARS = 150;

/** Same regex-over-`?raw` approach as generate.ts's parseWranglerVars and
 *  retrieval.eval.test.ts's vectorizeIndexName — the fixture never drifts
 *  from the binding wrangler.toml actually declares. */
function vectorizeIndexName(toml: string): string {
  const m = toml.match(/^index_name\s*=\s*"([^"]*)"/m);
  if (!m) throw new Error('wrangler.toml is missing [[vectorize]] index_name');
  return m[1];
}

async function embedQuery(query: string): Promise<number[]> {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/@cf/baai/bge-m3`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${AI_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: [query] }),
  });
  expect(res.ok, `bge-m3 embed HTTP ${res.status} for "${query}"`).toBe(true);
  const data = (await res.json()) as { result?: { data?: number[][] } };
  const vector = data.result?.data?.[0];
  expect(vector, `bge-m3 returned no embedding for "${query}"`).toBeDefined();
  return vector as number[];
}

/** Real Vectorize retrieval WITH metadata (unlike retrieval.eval.test.ts's
 *  `returnMetadata:'none'`, which only checks recall) — the actual
 *  source_title/source_url/excerpt this worker's buildGroundedContext needs
 *  to build the same grounded-context block chat-stream.ts sends. */
async function queryRealMatches(vector: number[]): Promise<RetrievedMatch[]> {
  const indexName = vectorizeIndexName(wranglerToml);
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/vectorize/v2/indexes/${indexName}/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${AI_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ vector, topK: 5, returnMetadata: 'all' }),
  });
  expect(res.ok, `Vectorize query HTTP ${res.status} — token needs the Vectorize Read permission group`).toBe(true);
  const data = (await res.json()) as { result?: { matches?: Array<{ id: string; score: number; metadata?: CorpusVectorMetadata }> } };
  const matches = data.result?.matches ?? [];
  return matches
    .filter((m): m is typeof m & { metadata: CorpusVectorMetadata } => m.metadata !== undefined)
    .map((m) => ({ id: m.id, score: m.score, metadata: m.metadata }));
}

describe.skipIf(!GENERATOR_ENABLED)('generation smoke — not silently empty or badly truncated (opt-in, A-5 regression)', () => {
  for (const question of QUESTIONS) {
    it(`answers "${question}" with REAL retrieved evidence, complete and above the minimum length`, async () => {
      // Arrange — real retrieval, not a synthetic fixture (round 1's gap).
      const { chatModel, maxTokens } = wranglerVars();
      const vector = await embedQuery(question);
      const matches = await queryRealMatches(vector);
      expect(matches.length, `Vectorize returned no matches with metadata for "${question}" — corpus or index broken`).toBeGreaterThan(0);

      // Act
      const result = await generateAnswer({ model: chatModel, question, matches });

      // Assert — three facts that were each individually true of the A-5
      // incident and must never be true again: zero content, a truncation
      // (finish_reason "length"), or content so short it's a truncation in
      // everything but name (round 1's gap — 7-37 chars passed `length > 0`).
      expect(
        result.text.length,
        `${chatModel} returned an EMPTY answer for "${question}" (finish_reason=${result.finishReason}, max_tokens=${maxTokens}) — ` +
          'this is exactly the A-5 incident shape: citations would render with a blank answer bubble.',
      ).toBeGreaterThan(0);
      expect(
        result.finishReason,
        `${chatModel} was truncated (finish_reason="length" at max_tokens=${maxTokens}) before finishing its answer for "${question}" — ` +
          'the reasoning-token budget is too tight for this prompt size again; see wrangler.toml MAX_TOKENS comment.',
      ).not.toBe('length');
      expect(
        result.text.length,
        `${chatModel} answered "${question}" with only ${result.text.length} chars (finish_reason=${result.finishReason}) — ` +
          `below the ${MIN_ANSWER_CHARS}-char floor. A short-but-nonempty answer is still the A-5 failure shape in disguise ` +
          '(the round-1 gate that only checked length > 0 passed a 7-char answer).',
      ).toBeGreaterThanOrEqual(MIN_ANSWER_CHARS);
    }, 60_000);
  }
});
