#!/usr/bin/env -S node --experimental-strip-types
/**
 * build-corpus.mjs — turns src/content/*.ts into embeddable chunks and POSTs
 * them to the assistant worker's POST /api/admin/reindex, which embeds each
 * with bge-m3 and upserts into Vectorize (workers/assistant/src/rag.ts
 * reindexChunks).
 *
 * Five of the six sources are this repo's own live content — the same files
 * Methodology/Glossary/Faq/About/Legal actually render. The sixth
 * (`literature.ts`) is external published work and renders nowhere yet; its
 * chunks are labeled `category: 'literature'` so the prompt block can keep
 * them distinct from AirLens's own documentation.
 *
 * Field Assistant v2 design §1 D-3: "코퍼스 소스 교체... 소스=렌더 소스와
 * 동일 파일 = 드리프트 구조적 해소". Run this again whenever content/*.ts
 * changes and the corpus should catch up — chunk ids are stable
 * (`${category}:${slug}`), so re-running overwrites in place rather than
 * accumulating duplicates.
 *
 * Requires Node 22.6+ (`--experimental-strip-types` — type-only stripping,
 * no transform needed: content/*.ts uses only interfaces/types/const arrays,
 * no enums or namespaces). Deliberately dependency-free (karpathy.md's
 * ladder: platform-native feature covers it) rather than adding tsx/esbuild
 * just to import these six files. Note that type-only stripping does no module
 * resolution — relative imports between content files must carry the `.ts`
 * extension or this script cannot load them.
 *
 * Usage:
 *   ADMIN_REINDEX_SECRET=... node --experimental-strip-types scripts/build-corpus.mjs [worker-url]
 *   # worker-url defaults to http://localhost:8787 (wrangler dev)
 *
 * NOT run by CI or by this PR — an operator runs it once against the
 * deployed worker after ADMIN_REINDEX_SECRET is provisioned (see this repo's
 * PR description / wrangler.toml secrets comment block).
 */

import { METHODOLOGY_SECTIONS } from '../src/content/methodologySections.ts'
import { FAQ_ITEMS } from '../src/content/faq.ts'
import { GLOSSARY_TERMS } from '../src/content/glossaryTerms.ts'
import { ROADMAP_STATE, THREE_PRODUCTS, TWO_INFRA, OPERATING_PRINCIPLES } from '../src/content/aboutState.ts'
import { LEGAL_DOCS } from '../src/content/legal.ts'
import { literatureChunks } from '../src/content/literature.ts'

/** Vectorize upsert batches — matches EMBED_BATCH_LIMIT in workers/assistant/
 *  src/rag.ts (bge-m3's 100-item-per-call ceiling). The worker itself loops
 *  in batches of this size too, so this script's batching is a second,
 *  outer safety margin on HTTP body size, not the only batching layer. */
const POST_BATCH_SIZE = 80

/** @typedef {{id: string, text: string, source_title: string, source_url: string, category: string}} CorpusChunk */

/** @returns {CorpusChunk[]} */
function methodologyChunks() {
  return METHODOLOGY_SECTIONS.map((s) => ({
    id: `methodology:${s.sectionId}`,
    text: `${s.title}\n${s.what}\n${s.why}\nLimitations: ${s.limitations}`,
    source_title: s.title,
    source_url: s.exampleHref ?? `/methodology#${s.sectionId}`,
    category: 'methodology',
  }))
}

/** @returns {CorpusChunk[]} */
function faqChunks() {
  return FAQ_ITEMS.map((item) => ({
    id: `faq:${item.id}`,
    text: `${item.question}\n${item.answer}`,
    source_title: item.question,
    source_url: `/faq#${item.id}`,
    category: 'faq',
  }))
}

/** relations[] carries typed edges (isA/partOf/measures/derivedFrom/
 *  contrastsWith/seeAlso) to other termIds — appending the related term
 *  labels to the embedded text is the retrieval lever the design doc calls
 *  for ("동의어 메타데이터... recall 개선 레버"): a query using a related
 *  term's own wording still has a chance to match this chunk.
 *  @returns {CorpusChunk[]} */
function glossaryChunks() {
  return GLOSSARY_TERMS.map((t) => {
    const relatedLabels = t.relations
      .map((r) => GLOSSARY_TERMS.find((other) => other.termId === r.target)?.term)
      .filter((label) => typeof label === 'string')
    const relatedLine = relatedLabels.length > 0 ? `\nRelated terms: ${relatedLabels.join(', ')}` : ''
    return {
      id: `glossary:${t.termId}`,
      text: `${t.term}: ${t.definition}\nExample: ${t.example}${relatedLine}`,
      source_title: t.term,
      source_url: `/glossary#${t.termId}`,
      category: 'glossary',
    }
  })
}

/** Two hand-summarized chunks rather than one-per-row — the roadmap table
 *  and principles list are each small enough that per-row chunking would
 *  just fragment a single coherent answer across multiple citations.
 *  @returns {CorpusChunk[]} */
function aboutChunks() {
  const roadmapText = ROADMAP_STATE.map(
    (r) => `- ${r.stage}: ${r.outcome} — status: ${r.status} (${r.statusNote}, last verified ${r.lastVerified})`,
  ).join('\n')
  const principlesText = [
    ...OPERATING_PRINCIPLES,
    ...THREE_PRODUCTS.map((p) => `${p.name} (${p.surface}): ${p.description}`),
    ...TWO_INFRA.map((i) => `${i.name}: ${i.role}`),
  ].join('\n')

  return [
    {
      id: 'about:roadmap',
      text: `AirLens roadmap state\n${roadmapText}`,
      source_title: 'AirLens roadmap state',
      source_url: '/about#roadmap',
      category: 'about',
    },
    {
      id: 'about:principles',
      text: `AirLens operating principles and products\n${principlesText}`,
      source_title: 'AirLens operating principles',
      source_url: '/about',
      category: 'about',
    },
  ]
}

/** First 3 body paragraphs only — legal docs run long, and the chunk only
 *  needs enough to ground a citation, not the full document (the citation
 *  card's source_url already links to the full text). @returns {CorpusChunk[]} */
function legalChunks() {
  return LEGAL_DOCS.map((doc) => ({
    id: `legal:${doc.id}`,
    text: `${doc.title}\n${doc.summary}\n${doc.body.slice(0, 3).join(' ')}`,
    source_title: doc.title,
    source_url: `/legal/${doc.id}`,
    category: 'legal',
  }))
}

/**
 * Sixth source — external published work behind AirLens's methods. Unlike the
 * five above it is not this site's rendered content, and its emission has real
 * invariants to keep (byte-capped ASCII ids, per-domain counts computed from
 * the ledger rather than typed in, a scope note on every card), so it lives in
 * `src/content/literature.ts` next to its data where `literature.test.ts` can
 * reach it — not inline here, where nothing can test it.
 */
function buildChunks() {
  return [
    ...methodologyChunks(),
    ...faqChunks(),
    ...glossaryChunks(),
    ...aboutChunks(),
    ...legalChunks(),
    ...literatureChunks(),
  ]
}

function batches(items, size) {
  const out = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

async function main() {
  const secret = process.env.ADMIN_REINDEX_SECRET
  if (!secret) {
    console.error('ADMIN_REINDEX_SECRET is not set — refusing to run (the reindex endpoint fails closed without it anyway).')
    process.exitCode = 1
    return
  }
  const workerUrl = (process.argv[2] ?? 'http://localhost:8787').replace(/\/$/, '')

  const chunks = buildChunks()
  if (chunks.length === 0) {
    // Every content/*.ts import resolved to an empty array — most likely
    // symptom of a broken import path or an upstream content-file rewrite
    // that dropped its exports. Reporting "Done — 0 chunks indexed" here
    // would look like a clean run while silently wiping the live corpus
    // (an empty reindex batch is never sent, so this is the one place that
    // failure is visible at all).
    console.error('Built 0 chunks — content/*.ts sources look empty. Refusing to run (nothing to index).')
    process.exitCode = 1
    return
  }
  const byCategory = chunks.reduce((acc, c) => ({ ...acc, [c.category]: (acc[c.category] ?? 0) + 1 }), {})
  console.log(`Built ${chunks.length} chunks:`, byCategory)

  let totalIndexed = 0
  for (const batch of batches(chunks, POST_BATCH_SIZE)) {
    let res
    try {
      res = await fetch(`${workerUrl}/api/admin/reindex`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-secret': secret },
        body: JSON.stringify({ chunks: batch }),
      })
    } catch (err) {
      console.error(`Could not reach ${workerUrl}/api/admin/reindex — is the worker deployed / running? (${err.message})`)
      process.exitCode = 1
      return
    }
    if (!res.ok) {
      console.error(`Reindex batch failed: ${res.status} ${await res.text()}`)
      process.exitCode = 1
      return
    }
    const body = await res.json()
    totalIndexed += body.indexed
    console.log(`  batch of ${batch.length} → indexed ${body.indexed} (worker reports ${body.batches} internal batch(es))`)
  }

  console.log(`Done — ${totalIndexed} chunks indexed at ${workerUrl}.`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
