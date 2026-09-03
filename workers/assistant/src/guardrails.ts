import type { ChatIntent, ChatMessageWire, GuardrailResult } from './types';

/**
 * Best-effort domain gating (injection-pattern / system-probe / out-of-scope
 * regex matches on the current turn) — ported near-verbatim from the retired
 * chatbot worker's guardrails.ts (design §1 D-1: "데이터 소스 독립적",
 * stack-agnostic). Regex-only, zero extra LLM calls. Fallback copy is
 * reworded for this repo's no-account, no-live-API product framing (dropped
 * "sign in" / "실시간" language the retired worker's copy still had).
 *
 * NOT a complete prompt-injection defense. `checkGuardrails` inspects ONE
 * message; `checkConversationGuardrails` (below, 2026-09-03) walks the whole
 * client-supplied conversation, which closes the measured single-message
 * history bypass — but a multi-turn injection assembled from individually
 * innocuous fragments still passes, because no regex list can see intent
 * spread across turns. Do not describe this module as "prompt-injection
 * defense" anywhere (comments, docs, PR bodies) — "domain gating
 * (best-effort)" only.
 */
const INJECTION_PATTERNS: RegExp[] = [
  // English — direct instruction override
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /disregard\s+(all\s+)?(your|above|prior)/i,
  /override\s+(all|your|the)/i,
  /forget\s+(everything|all|your)/i,

  // English — role hijacking
  /you\s+are\s+now\s+a/i,
  /act\s+as\s+(a|an|if)\b/i,
  /pretend\s+(to\s+be|you\s+are)/i,
  /from\s+now\s+on\s+you/i,
  /switch\s+to\s+.+\s+mode/i,

  // English — system prompt extraction
  /system\s*prompt\s*:/i,
  /output\s+(your|the)\s+(system|api|secret|internal)/i,
  /reveal\s+(your|the)\s+(instructions|prompt|key|rules)/i,
  /what\s+are\s+your\s+(instructions|rules|guidelines)/i,
  /show\s+(me\s+)?(your|the)\s+(system|prompt|instructions)/i,
  /repeat\s+(your|the)\s+(system|initial)\s+(prompt|instructions)/i,

  // Korean — instruction override
  /이전\s*(지시|명령|규칙|지침).*무시/,
  /시스템\s*프롬프트.*(보여|알려|출력|공개)/,
  /너(는|의)\s*(규칙|지침|명령).*(알려|보여|말해)/,
  /어떤\s*(지시|명령|규칙).*받았/,
  /지금부터\s*너는/,
  /다른\s*AI(처럼|같이|로)\s*(행동|작동)/,
];

const SYSTEM_PROBE_PATTERNS: RegExp[] = [
  /워크스페이스|workspace/i,
  /파일\s*경로|file\s*path|directory/i,
  /설정\s*파일|config\s*file/i,
  /api\s*key|api\s*키|secret\s*key|시크릿/i,
  /supabase|cloudflare|wrangler|vectorize/i,
  /\.env|\.toml|\.json\s*설정/i,
  /모델\s*(가중치|파라미터|아티팩트)|model\s*(weights|artifacts)/i,
  /데이터베이스\s*(스키마|테이블)|database\s*(schema|table)/i,
  /서버\s*(구조|설정|아키텍처)|server\s*(config|architecture)/i,
];

const OUT_OF_SCOPE_PATTERNS: RegExp[] = [
  /주식|비트코인|코인|투자\s*추천|stock|bitcoin|crypto|invest/i,
  /정치\s*(의견|입장)|선거|대통령|political\s*opinion|election/i,
  /코드\s*(작성|짜|만들)|write\s*code|programming|debug/i,
  /개인\s*정보|주민등록|personal\s*data|social\s*security/i,
  /의료\s*진단|처방|medical\s*diagnosis|prescription/i,
  /법률\s*자문|legal\s*advice/i,
];

const FALLBACK_INJECTION = {
  ko: '요청을 처리할 수 없습니다. 대기질 관련 질문을 해주세요.',
  en: 'I can only assist with air quality and environmental policy questions. How can I help?',
};

const FALLBACK_SYSTEM_PROBE = {
  ko: '내부 시스템 정보는 제공할 수 없습니다. 대기질 데이터나 AirLens 사용법에 대해 도와드릴까요?',
  en: 'I cannot share internal system details. Can I help you with air quality data or how AirLens works instead?',
};

const FALLBACK_OUT_OF_SCOPE = {
  ko: '저는 AirLens의 대기질 데이터와 문서에 특화된 에이전트입니다. 관심 지역의 PM2.5 예측이나 정책 분석 데이터를 찾아 드릴까요?',
  en: 'I specialize in AirLens air quality data and documentation. Would you like me to look up PM2.5 predictions or policy impact data for your region?',
};

function isKorean(message: string): boolean {
  return /[가-힣]/.test(message);
}

export function detectInjection(message: string): boolean {
  return INJECTION_PATTERNS.some((p) => p.test(message));
}

function detectSystemProbe(message: string): boolean {
  return SYSTEM_PROBE_PATTERNS.some((p) => p.test(message));
}

function detectOutOfScope(message: string): boolean {
  return OUT_OF_SCOPE_PATTERNS.some((p) => p.test(message));
}

/**
 * Runs all three guardrail checks on the current user turn. Precedence
 * (injection > system_probe > out_of_scope) matches the retired worker —
 * an injection attempt that also happens to mention e.g. "supabase" is
 * reported as injection, the higher-severity finding.
 */
export function checkGuardrails(message: string): GuardrailResult {
  const ko = isKorean(message);

  if (detectInjection(message)) {
    return { passed: false, reason: 'injection', fallback_message: ko ? FALLBACK_INJECTION.ko : FALLBACK_INJECTION.en };
  }
  if (detectSystemProbe(message)) {
    return { passed: false, reason: 'system_probe', fallback_message: ko ? FALLBACK_SYSTEM_PROBE.ko : FALLBACK_SYSTEM_PROBE.en };
  }
  if (detectOutOfScope(message)) {
    return { passed: false, reason: 'out_of_scope', fallback_message: ko ? FALLBACK_OUT_OF_SCOPE.ko : FALLBACK_OUT_OF_SCOPE.en };
  }
  return { passed: true, reason: null, fallback_message: null };
}

/**
 * Runs the input gate over the WHOLE conversation, not just the current turn.
 *
 * The single-turn version had a measured bypass: a phrase blocked as the
 * current turn streamed a full 176-token answer when the client moved it into
 * `history`, because `messages` is entirely client-supplied and prompts.ts
 * buildMessages folds history straight into the model's message array. The
 * request's length cap already walked history for that exact reason; the
 * content check did not, and that asymmetry was the hole. (This is the gap
 * the module header above described as an open backlog item — it is closed
 * for single-message injections; a multi-turn injection assembled from
 * individually-innocuous fragments is still not caught by regex, and calling
 * this module "prompt-injection defense" is still overclaiming.)
 *
 * Role determines WHICH patterns apply, deliberately:
 *  - user turns (current + historical) get the full gate — the same kind of
 *    input the patterns were written for;
 *  - assistant turns get injection patterns ONLY. A role label is not
 *    provenance (this worker never wrote those entries — the client did), so
 *    a forged "assistant" turn carrying "from now on you are…" must still be
 *    caught. But system-probe and out-of-scope patterns match words the
 *    assistant's own legitimate answers contain ("cloudflare", "개인정보"),
 *    so applying them to real transcript would make a conversation
 *    un-continuable the moment the assistant answered a question about how
 *    the data is published. Injection patterns have no such overlap: no
 *    honest answer of ours says "ignore all previous instructions".
 */
export function checkConversationGuardrails(
  lastUserMessage: string,
  history: readonly ChatMessageWire[],
): GuardrailResult {
  const current = checkGuardrails(lastUserMessage);
  if (!current.passed) return current;

  for (const message of history) {
    if (message.role === 'user') {
      const result = checkGuardrails(message.content);
      if (!result.passed) return result;
    } else if (detectInjection(message.content)) {
      // detectInjection already matched and injection has top precedence in
      // checkGuardrails, so this returns the injection verdict with its
      // language-matched fallback copy, never a system_probe/out_of_scope one.
      return checkGuardrails(message.content);
    }
  }
  return { passed: true, reason: null, fallback_message: null };
}

// ── deterministic intent routing (ported verbatim — design §1 D-1: "그대로",
//    §1 D-5 causal_reasoning gate is C3 scope) ──
//
// Regex-only classifier — zero extra LLM calls (an LLM router would double
// the per-request neuron budget). Runs AFTER checkGuardrails in the caller
// (index.ts handleChat) — domain gating first, then routing.
// Precedence: causal > policy > data_lookup > general.

const CAUSAL_PATTERNS: RegExp[] = [
  /왜|어째서|원인|이유|때문/,
  /\bwhy\b|\bcause[sd]?\b|\breason\b|\bwhat('| i)?s (causing|behind)\b/i,
];

const POLICY_PATTERNS: RegExp[] = [
  /정책|규제|법안|배출\s*기준|저감\s*조치/,
  /\bpolic(y|ies)\b|\bregulations?\b|\blegislation\b|\bemission\s+standards?\b|\bsdid\b/i,
];

const DATA_LOOKUP_TIME: RegExp[] = [
  /지금|현재|오늘|실시간|얼마/,
  /\bnow\b|\bcurrent(ly)?\b|\btoday\b|\breal.?time\b|\bhow (bad|high|much)\b/i,
];
const DATA_LOOKUP_SUBJECT: RegExp[] = [
  /미세먼지|초미세먼지|대기질|공기|농도|수치|오존/,
  /pm\s*2\.?5|pm\s*10|\bair\s*quality\b|\baqi\b|\bozone\b|\bo3\b|\bconcentration\b/i,
];

/**
 * Classify a (guardrail-passed) message into one deterministic intent.
 * data_lookup requires BOTH a time cue and an air-quality subject — a bare
 * "today" ("what can I do today?") must not trigger a live-data fetch.
 */
export function classifyIntent(message: string): ChatIntent {
  if (CAUSAL_PATTERNS.some((p) => p.test(message))) return 'causal';
  if (POLICY_PATTERNS.some((p) => p.test(message))) return 'policy';
  if (DATA_LOOKUP_TIME.some((p) => p.test(message)) && DATA_LOOKUP_SUBJECT.some((p) => p.test(message))) {
    return 'data_lookup';
  }
  return 'general';
}
