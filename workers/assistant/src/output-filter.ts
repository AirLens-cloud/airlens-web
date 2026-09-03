/**
 * Output-side safety for the chat stream — the half guardrails.ts does not
 * cover. guardrails.ts screens what goes IN; this screens what comes OUT.
 *
 * Ported from the retired chatbot worker's postprocess.ts, adapted to this
 * worker's shape: that one was a TransformStream over the raw upstream SSE
 * bytes, while chat-stream.ts already parses upstream frames into tokens and
 * emits its own typed events — so the port is the accumulate/holdback/scrub
 * logic, without the frame-parsing half (which would now be duplicated).
 *
 * The rule this module exists for: "the prompt instructs, the code
 * guarantees." prompts.ts §1 asks the model never to reveal its system
 * prompt. Asking is not a control — an instruction the model can be talked
 * out of is not a boundary. Two things are therefore enforced here in code:
 *
 *  1. Prompt-leak canaries — if the model starts emitting a section marker
 *     that only exists inside the system prompt, the answer is cut and
 *     replaced with an honest notice (never a silent truncation).
 *  2. Internal field names — snake_case identifiers from the evidence blocks
 *     (predicted_p50, rrf_score, …) are rewritten to human labels, since the
 *     measured failure mode is a model copying them straight into prose.
 *
 * Streaming-safe by construction: tokens split at arbitrary points, so a
 * per-token check would miss `<security_rules>` arriving as "<secu" +
 * "rity_rules>". Text is accumulated and released only up to HOLDBACK_CHARS
 * behind the frontier — every canary and field name is shorter than the
 * holdback, so it is always detected before the characters carrying it are
 * released.
 */

/** Longest canary/field token is ~30 chars — 48 gives comfortable margin. */
export const HOLDBACK_CHARS = 48;

/**
 * Markers that appear only inside the system prompt (prompts.ts). Their
 * presence in model output means the model is echoing its instructions.
 */
const LEAK_CANARIES: readonly string[] = [
  '<security_rules>',
  '</security_rules>',
  '<platform_context>',
  '</platform_context>',
  '<response_format>',
  '</response_format>',
  '<causal_reasoning>',
  '</causal_reasoning>',
  '<retrieved_context>',
  '</retrieved_context>',
  '<structured_context>',
  '</structured_context>',
  '<user_query>',
  'Absolute Security Rules',
  'Causal Explanation Skeleton',
  'Glass-box Response Guidelines',
];

/** Shown in place of the cut answer. Says what happened — a blank bubble or a
 *  sentence that stops mid-word would read as a bug, not as a safety stop. */
export const LEAK_NOTICE =
  '[AirLens] This response was stopped because it started repeating internal formatting rules. ' +
  'Please rephrase your question and I will answer from the air-quality documentation. ' +
  '(응답이 내부 형식 규칙을 포함하기 시작해 전송을 중단했습니다. 질문을 다시 표현해 주세요.)';

/**
 * Internal snake_case field names → human labels. Longer keys first so a
 * longer identifier is never partially rewritten by a shorter one.
 */
const INTERNAL_FIELD_MAP: ReadonlyArray<readonly [RegExp, string]> = [
  [/uncertainty_normalized/g, 'uncertainty indicator'],
  [/confidence_grade/g, 'confidence grade'],
  [/relevance_score/g, 'search relevance'],
  [/predicted_p10/g, 'p10 (lower bound)'],
  [/predicted_p50/g, 'p50 (median estimate)'],
  [/predicted_p90/g, 'p90 (upper bound)'],
  [/content_text/g, 'source text'],
  [/generated_at/g, 'generated at'],
  [/entity_type/g, 'source type'],
  [/rrf_score/g, 'search fusion score'],
  [/obs_age_h/g, 'observation age (hours)'],
];

export function scrubFieldNames(text: string): string {
  let out = text;
  for (const [pattern, humanName] of INTERNAL_FIELD_MAP) out = out.replace(pattern, humanName);
  return out;
}

export function containsLeakCanary(text: string): boolean {
  return LEAK_CANARIES.some((marker) => text.includes(marker));
}

export interface OutputGate {
  /** Feed one upstream token; returns the text that is safe to emit now
   *  (possibly ''). Returns '' once tripped. */
  push(token: string): string;
  /** Release whatever is still held back — call once, at end of stream. */
  flush(): string;
  /** True once a leak canary was seen: stop streaming and emit LEAK_NOTICE. */
  readonly tripped: boolean;
}

export function createOutputGate(): OutputGate {
  let accumulated = '';
  let emittedUpTo = 0;
  let tripped = false;

  function release(holdback: number): string {
    const releasable = accumulated.length - holdback;
    if (releasable <= emittedUpTo) return '';
    const chunk = accumulated.slice(emittedUpTo, releasable);
    emittedUpTo = releasable;
    return scrubFieldNames(chunk);
  }

  return {
    push(token: string): string {
      if (tripped) return '';
      accumulated += token;
      if (containsLeakCanary(accumulated)) {
        // The canary is always still inside the holdback window (every marker
        // is shorter than HOLDBACK_CHARS), so none of it has been released.
        tripped = true;
        return '';
      }
      return release(HOLDBACK_CHARS);
    },
    flush(): string {
      if (tripped) return '';
      return release(0);
    },
    get tripped(): boolean {
      return tripped;
    },
  };
}
