// eval/generation-smoke.eval.test.ts — asserts generation isn't silently
// empty. No judge, no quality scoring — this is a pass/fail smoke test for
// the exact failure shape the A-5 incident produced in production.
//
// A-5 (2026-09-03): a real user question against the deployed worker
// returned citations:5 / token:0 / done — HTTP 200, no exception,
// budget:"ok", and a blank answer bubble next to real citation links. No
// eval in this directory called CHAT_MODEL with anything resembling the
// REAL SYSTEM_PROMPT (prompts.ts, ~4.3K chars) plus a REAL-SIZED grounded
// context (rag.ts buildGroundedContext, up to 5x300-char excerpts) — every
// existing case in cases.ts sends `matches: []` (retrieval eval and
// generation eval were split apart on purpose, see cases.ts's own comment,
// but that split meant nothing ever exercised BOTH the full system prompt
// AND a populated <retrieved_context> block at once, which is exactly the
// combination that pushed prompt_tokens to ~1843 and, at the old
// MAX_TOKENS=512, exhausted the reasoning-model's budget before a single
// answer token (see wrangler.toml's A-5 follow-up comment for the full
// measurement). This suite closes that gap: one live generation call, same
// question and same-shaped evidence as the incident, asserting only that
// content isn't empty and the model wasn't truncated mid-thought — not
// answer quality (that's quality.eval.test.ts's job, and it's judge-gated).
//
// OPT-IN: skipped unless CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_WORKERS_AI_TOKEN
// are set (same env pair as every other eval in this directory). A missing
// env must SKIP loudly, never fake a pass.
import { describe, it, expect } from 'vitest';
import { GENERATOR_ENABLED, generateAnswer, wranglerVars } from './generate';
import type { RetrievedMatch } from '../src/rag';

// Same question that reproduced the A-5 incident in production, and the
// same realistic 5-citation shape (EXCERPT_CHARS=300 in rag.ts) used to
// reproduce it in the throwaway diagnostic probe this smoke test replaces
// with a permanent, automated check.
const QUESTION = 'DQSS 점수가 뭔가요?';

const FAKE_MATCHES: RetrievedMatch[] = Array.from({ length: 5 }, (_, i) => ({
  id: `methodology:dqss-smoke-${i}`,
  score: 0.82 - i * 0.03,
  metadata: {
    source_title: `AirLens Methodology — DQSS Section ${i + 1}`,
    source_url: `https://airlens.cloud/methodology#dqss-${i + 1}`,
    category: 'methodology',
    excerpt:
      "DQSS (Data Quality & Source Score) is AirLens's data quality grading system, " +
      'combining sensor calibration confidence, spatial interpolation uncertainty, ' +
      'temporal staleness, and source agreement across OpenAQ, Sensor.Community, ' +
      'Open-Meteo, and NASA satellite products into a single A-F letter grade. '.repeat(2),
  },
}));

describe.skipIf(!GENERATOR_ENABLED)('generation smoke — not silently empty (opt-in, A-5 regression)', () => {
  it('answers a real-shaped question with real-shaped evidence without truncating before any content', async () => {
    // Arrange
    const { chatModel, maxTokens } = wranglerVars();

    // Act
    const result = await generateAnswer({ model: chatModel, question: QUESTION, matches: FAKE_MATCHES });

    // Assert — the exact two facts that were true of the A-5 incident and
    // must never be true again: zero content, and finish_reason "length"
    // (the budget ran out before the model could answer at all).
    expect(
      result.text.length,
      `${chatModel} returned an EMPTY answer (finish_reason=${result.finishReason}, max_tokens=${maxTokens}) — ` +
        'this is exactly the A-5 incident shape: citations would render with a blank answer bubble.',
    ).toBeGreaterThan(0);
    expect(
      result.finishReason,
      `${chatModel} was truncated (finish_reason="length" at max_tokens=${maxTokens}) before finishing its answer — ` +
        'the reasoning-token budget is too tight for this prompt size again; see wrangler.toml MAX_TOKENS comment.',
    ).not.toBe('length');
  }, 60_000);
});
