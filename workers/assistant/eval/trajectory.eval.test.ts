// eval/trajectory.eval.test.ts — per-intent assembly trajectory.
//
// CI-always: deterministic. Verifies the REAL pipeline pieces chained the
// way chat-stream.ts's buildRagStream chains them — classifyIntent → layer
// gating → grounded context → buildMessages — stage by stage, per intent.
// Ported from the retired chatbot worker's eval/trajectory.eval.test.ts,
// minus the output-safety-transform stage: this worker has no
// postprocess.ts equivalent (see safety.eval.test.ts's file header for why
// that gap exists and isn't papered over here either).
import { describe, it, expect } from 'vitest';
import { classifyIntent } from '../src/guardrails';
import { buildGroundedContext } from '../src/rag';
import { buildMessages } from '../src/prompts';
import { wrapStructuredContext } from './generate';

const STRUCTURED_BLOCK =
  '[P] own-ML PM2.5 prediction — city: Seoul\n' +
  'ESTIMATED prediction: median p50 25 µg/m³, band p10-p90 18-32 µg/m³\n' +
  'model: gtwr-xgb-2026.07 | snapshot generated 1h ago';

/** Mirror of chat-stream.ts buildRagStream's gating so a drift there fails
 *  HERE loudly. buildGroundedContext runs unconditionally (matches=[] here —
 *  retrieval itself is covered by retrieval.eval.test.ts); only the
 *  structured-context layer is intent-gated (wantsLiveData). */
function assemble(q: string, structuredBlocks: string[]): {
  intent: ReturnType<typeof classifyIntent>;
  system: string;
} {
  const intent = classifyIntent(q);
  const wantsLiveData = intent !== 'general';
  const includeCausalReasoning = intent === 'causal' || intent === 'policy';
  const grounded = [buildGroundedContext([]), wrapStructuredContext(wantsLiveData ? structuredBlocks : [])]
    .filter(Boolean)
    .join('\n\n');
  const messages = buildMessages(q, [], 3, grounded, includeCausalReasoning);
  return { intent, system: messages[0].content };
}

describe('trajectory — causal intent', () => {
  it('assembles causal skeleton + structured context', () => {
    // Arrange / Act
    const { intent, system } = assemble('왜 오늘 미세먼지가 심한가요?', [STRUCTURED_BLOCK]);
    // Assert — stage 1: routing
    expect(intent).toBe('causal');
    // Stage 2: prompt carries the causal skeleton, the structured block, and
    // retrieved_context (unconditional)
    expect(system).toContain('<causal_reasoning>');
    expect(system).toContain('<structured_context>');
    expect(system).toContain('<retrieved_context>');
    expect(system).toContain('city: Seoul');
  });
});

describe('trajectory — policy intent', () => {
  it('keeps the causal skeleton (SDID rule lives there) and the structured context', () => {
    const { intent, system } = assemble('한국 대기 정책이 실제로 효과가 있었나요?', [STRUCTURED_BLOCK]);
    expect(intent).toBe('policy');
    expect(system).toContain('Policy causal claims (SDID)');
    expect(system).toContain('<structured_context>');
  });
});

describe('trajectory — data_lookup intent', () => {
  it('keeps the structured block but drops the causal skeleton', () => {
    const { intent, system } = assemble('지금 서울 미세먼지 얼마야?', [STRUCTURED_BLOCK]);
    expect(intent).toBe('data_lookup');
    expect(system).toContain('<structured_context>');
    expect(system).not.toContain('<causal_reasoning>');
  });
});

describe('trajectory — general intent', () => {
  it('drops both the causal skeleton and the structured-context layer (no live-data fetch)', () => {
    const { intent, system } = assemble('Globe 페이지 사용법 알려줘', [STRUCTURED_BLOCK]);
    expect(intent).toBe('general');
    // Checked via the CLOSING tag — the base system prompt's own
    // response_format rule 1 names `<structured_context>` in prose on every
    // request, so the opening tag alone is present regardless of gating
    // (see generate.test.ts for the same note).
    expect(system).not.toContain('</structured_context>');
    expect(system).not.toContain('<causal_reasoning>');
    // retrieved_context still runs unconditionally
    expect(system).toContain('<retrieved_context>');
    // Base rules always survive the gating
    expect(system).toContain('Uncertainty is mandatory');
  });
});
