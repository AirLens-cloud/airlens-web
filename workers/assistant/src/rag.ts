import type { ChatCitationWire, CorpusChunk, CorpusVectorMetadata, Env } from './types';

/** bge-m3 accepts at most 100 strings per `text` array call (catalog schema
 *  maxItems). Both embedQuery (1 string) and the reindex batch loop respect
 *  this. */
const EMBED_BATCH_LIMIT = 100;

const EXCERPT_CHARS = 300;

/**
 * Embeds a batch of strings with the configured Workers AI embedding model
 * (bge-m3 — design §1 D-3, single-embedder, no OpenAI dual-write). Throws on
 * failure; callers decide whether that means "fail open" (query embedding —
 * chat still answers without RAG) or "fail loud" (reindex — an operator is
 * watching the response).
 */
async function embedBatch(env: Env, texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  if (texts.length > EMBED_BATCH_LIMIT) {
    throw new Error(`embedBatch: ${texts.length} texts exceeds bge-m3's ${EMBED_BATCH_LIMIT}-item limit`);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = (await env.AI.run(env.EMBEDDING_MODEL as any, { text: texts })) as { data?: number[][] };
  if (!Array.isArray(result.data) || result.data.length !== texts.length) {
    throw new Error('embedBatch: embedding model returned an unexpected shape');
  }
  return result.data;
}

/**
 * Embeds a single user query — best-effort. Returns null on any failure
 * (model error, missing binding) so the chat path can fail OPEN into
 * "answer without RAG" rather than failing the whole request over a search
 * outage (same fail-open philosophy as quota.ts's KV guards).
 */
export async function embedQuery(env: Env, query: string): Promise<number[] | null> {
  try {
    const [vector] = await embedBatch(env, [query]);
    return vector ?? null;
  } catch (err) {
    console.warn('embedQuery failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

export interface RetrievedMatch {
  id: string;
  score: number;
  metadata: CorpusVectorMetadata;
}

/**
 * Queries the corpus index for the topK nearest chunks — best-effort, same
 * fail-open contract as embedQuery. Returns [] when VECTORIZE is unbound
 * (not yet provisioned) or the query itself errors.
 */
export async function queryCorpus(env: Env, queryVector: number[], topK: number): Promise<RetrievedMatch[]> {
  if (!env.VECTORIZE) return [];
  try {
    const result = await env.VECTORIZE.query(queryVector, { topK, returnMetadata: 'all' });
    return result.matches
      .filter((m): m is typeof m & { metadata: CorpusVectorMetadata } => m.metadata !== undefined)
      .map((m) => ({ id: m.id, score: m.score, metadata: m.metadata as CorpusVectorMetadata }));
  } catch (err) {
    console.warn('queryCorpus failed:', err instanceof Error ? err.message : err);
    return [];
  }
}

export function toCitations(matches: RetrievedMatch[]): ChatCitationWire[] {
  return matches.map((m) => ({
    source_title: m.metadata.source_title,
    source_url: m.metadata.source_url,
    relevance: m.score,
    excerpt: m.metadata.excerpt,
  }));
}

const NO_EVIDENCE_BLOCK = `<retrieved_context>
No matching AirLens documentation was retrieved for this query. You do NOT
have grounded evidence from AirLens's own content for this question.
- Say so before answering (e.g. "관련 문서를 찾지 못했습니다").
- Do not fabricate a specific AirLens feature, page, or number.
- You may still answer with general atmospheric-science knowledge, clearly
  framed as general knowledge rather than an AirLens documentation lookup.
</retrieved_context>`;

/**
 * Structures retrieved chunks into a labeled evidence block for the system
 * prompt — ported pattern from the retired chatbot worker's grounding.ts
 * (numbered [1]/[2] entries + explicit "relevance is not a confidence score"
 * instruction), adapted to Vectorize's {id, score, metadata} shape.
 */
export function buildGroundedContext(matches: RetrievedMatch[]): string {
  if (matches.length === 0) return NO_EVIDENCE_BLOCK;

  const entries = matches
    .map((m, i) => `[${i + 1}] source: ${m.metadata.source_title} (${m.metadata.source_url}) | retrieval relevance: ${m.score.toFixed(2)}\n${m.metadata.excerpt}`)
    .join('\n\n');

  return `<retrieved_context>
The following documents from AirLens's own documentation (methodology,
glossary, FAQ, about, legal) were retrieved as relevant to the question.
"retrieval relevance" is a cosine-similarity score (0-1) from the search
step — it is NOT a DQSS quality score and NOT a statistical confidence
interval; do not present it to the user as either. Cite sources as [1], [2],
etc. matching the numbering below.

${entries}
</retrieved_context>`;
}

/** Truncates chunk text into the excerpt stored as vector metadata (shown in
 *  the citation card and reused in the grounded-context prompt block). */
export function toExcerpt(text: string): string {
  return text.length <= EXCERPT_CHARS ? text : `${text.slice(0, EXCERPT_CHARS)}…`;
}

export interface ReindexResult {
  indexed: number;
  batches: number;
}

/**
 * Embeds and upserts a full chunk set. Fails LOUD (throws) — unlike the
 * query-time helpers above, this only ever runs from an operator-triggered
 * POST /api/admin/reindex call, so a silent partial index would be worse
 * than a visible 500.
 */
export async function reindexChunks(env: Env, chunks: CorpusChunk[]): Promise<ReindexResult> {
  if (!env.VECTORIZE) {
    throw new Error('VECTORIZE binding is not configured — see wrangler.toml [[vectorize]]');
  }

  let indexed = 0;
  let batches = 0;

  for (let i = 0; i < chunks.length; i += EMBED_BATCH_LIMIT) {
    const batch = chunks.slice(i, i + EMBED_BATCH_LIMIT);
    const vectors = await embedBatch(env, batch.map((c) => c.text));

    await env.VECTORIZE.upsert(
      batch.map((chunk, j) => ({
        id: chunk.id,
        values: vectors[j],
        metadata: {
          source_title: chunk.source_title,
          source_url: chunk.source_url,
          category: chunk.category,
          excerpt: toExcerpt(chunk.text),
        } satisfies CorpusVectorMetadata,
      })),
    );

    indexed += batch.length;
    batches += 1;
  }

  return { indexed, batches };
}
