// eval/retrieval.eval.test.ts — retrieval recall@3 against the LIVE
// Vectorize corpus (design §1 D-3).
//
// REWRITTEN, not ported — the retired chatbot worker measured recall
// against a Supabase `vector-search` Edge Function; this worker's RAG
// backend is Cloudflare Vectorize (rag.ts embedQuery/queryCorpus), a
// different retrieval surface entirely, queried here over Cloudflare's
// REST APIs (Workers AI ai/run for the bge-m3 embed, Vectorize v2
// indexes/query for the search) rather than the `env.AI`/`env.VECTORIZE`
// bindings — vitest.config.ts runs this suite in a plain Node environment,
// with no Workers runtime bindings available (same portability rationale as
// generate.ts's REST-based CHAT_MODEL calls).
//
// OPT-IN: skipped unless CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_WORKERS_AI_TOKEN
// are set — the same env pair eval/generate.ts's GENERATOR_ENABLED reads.
// The token needs BOTH the "Workers AI" (Read/Run) permission group used
// for generation AND "Vectorize" (Read) — the query endpoint below 401s
// without the latter even if generation already works with the same token.
// A missing env must SKIP loudly, never fake a pass:
//   CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_WORKERS_AI_TOKEN=... \
//   npx vitest run eval/retrieval.eval.test.ts
import { describe, it, expect } from 'vitest';
import wranglerToml from '../wrangler.toml?raw';
import { checkGate } from './gate';

declare const process: { env: Record<string, string | undefined> };

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const AI_TOKEN = process.env.CLOUDFLARE_WORKERS_AI_TOKEN;
const enabled = Boolean(ACCOUNT_ID && AI_TOKEN);

/** Reads `index_name = "..."` out of the `[[vectorize]]` block — same
 *  `?raw` + regex approach as generate.ts's parseWranglerVars, so the
 *  fixture never drifts from the binding wrangler.toml actually declares. */
function vectorizeIndexName(toml: string): string {
  const m = toml.match(/^index_name\s*=\s*"([^"]*)"/m);
  if (!m) throw new Error('wrangler.toml is missing [[vectorize]] index_name');
  return m[1];
}

interface RetrievalCase {
  q: string;
  /** Vectorize vector id this question should retrieve — the exact
   *  `${category}:${slug}` scheme scripts/build-corpus.mjs assigns (e.g.
   *  `methodology:aqi-conversion`, `faq:value-not-showing`), not a keyword
   *  guess — every case below was written against the actual
   *  src/content/{methodologySections,faq}.ts source, not the retired
   *  worker's news/PlatformDoc corpus (which this worker does not have). */
  expectedId: string;
}

// Reworded (not copied verbatim from src/content/faq.ts's own question
// text) so this measures semantic retrieval, not an exact-string match.
const CASES: RetrievalCase[] = [
  { q: 'AQI 등급은 어떻게 계산하나요?', expectedId: 'methodology:aqi-conversion' },
  { q: '예측 불확실성 구간(p10-p90)은 무엇을 의미하나요?', expectedId: 'methodology:uncertainty' },
  { q: '위성 데이터로 대기질을 어떻게 추정하나요?', expectedId: 'methodology:nature-satellite-derived' },
  { q: 'DQSS 점수가 뭔가요?', expectedId: 'methodology:dqss' },
  { q: '지금 이 값이 왜 안 보이는 거예요?', expectedId: 'faq:value-not-showing' },
  { q: '.airlens 번들 파일은 어떻게 여나요?', expectedId: 'faq:open-bundle' },
];

async function embedQuery(query: string): Promise<number[]> {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/@cf/baai/bge-m3`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${AI_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: [query] }),
    },
  );
  expect(res.ok, `bge-m3 embed HTTP ${res.status} for "${query}"`).toBe(true);
  const data = (await res.json()) as { result?: { data?: number[][] } };
  const vector = data.result?.data?.[0];
  expect(vector, `bge-m3 returned no embedding for "${query}"`).toBeDefined();
  return vector as number[];
}

interface VectorizeMatch {
  id: string;
  score: number;
}

async function queryTop3(vector: number[]): Promise<VectorizeMatch[]> {
  const indexName = vectorizeIndexName(wranglerToml);
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/vectorize/v2/indexes/${indexName}/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${AI_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ vector, topK: 3, returnMetadata: 'none' }),
    },
  );
  expect(res.ok, `Vectorize query HTTP ${res.status} — token needs the Vectorize Read permission group`).toBe(true);
  const data = (await res.json()) as { result?: { matches?: VectorizeMatch[] } };
  return data.result?.matches ?? [];
}

describe.skipIf(!enabled)('retrieval recall@3 (opt-in — live Vectorize corpus)', () => {
  it(`recall@3 over ${CASES.length} fixture questions meets the baseline gate`, async () => {
    // Arrange / Act
    let hits = 0;
    const misses: string[] = [];
    for (const { q, expectedId } of CASES) {
      const vector = await embedQuery(q);
      const top3 = await queryTop3(vector);
      const hit = top3.some((m) => m.id === expectedId);
      if (hit) hits += 1;
      else misses.push(`${q} (expected ${expectedId}, got [${top3.map((m) => m.id).join(', ')}])`);
    }
    const recall = hits / CASES.length;
    if (misses.length > 0) console.log(`[retrieval-eval] misses:\n  ${misses.join('\n  ')}`);

    // Assert — baseline gate (null baseline → report-only until first commit)
    checkGate('retrieval_recall_at_3', recall);
    expect(recall).toBeGreaterThan(0); // total-miss = corpus or endpoint broken
  }, 60_000);
});
