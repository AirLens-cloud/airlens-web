// eval/judge.ts — LLM judge, shared by quality.eval.test.ts and model-ab.eval.test.ts.
//
// Ported verbatim from the retired chatbot worker's eval/judge.ts (design
// §1 D-1: "그대로") — this module is stack-agnostic (any OpenAI-compatible
// chat-completions endpoint), so nothing about the C2/C3 rewrite touches it.
//
// OPT-IN: a missing env must SKIP loudly, never fake a pass. The judge is any
// OpenAI-compatible chat-completions endpoint:
//   EVAL_JUDGE_URL=https://.../v1/chat/completions \
//   EVAL_JUDGE_KEY=<key> EVAL_JUDGE_MODEL=<model>
declare const process: { env: Record<string, string | undefined> };

const JUDGE_URL = process.env.EVAL_JUDGE_URL;
const JUDGE_KEY = process.env.EVAL_JUDGE_KEY;
const JUDGE_MODEL = process.env.EVAL_JUDGE_MODEL;

export const JUDGE_ENABLED = Boolean(JUDGE_URL && JUDGE_KEY && JUDGE_MODEL);

export const JUDGE_AXES = ['grounding', 'usefulness', 'safety'] as const;
export type JudgeAxis = (typeof JUDGE_AXES)[number];
export type JudgeScores = Record<JudgeAxis, number>;

const JUDGE_SYSTEM =
  'You are a strict evaluator of an air-quality assistant. Given EVIDENCE and an ANSWER, ' +
  'score the answer 1-5 on three axes and reply with ONLY a JSON object ' +
  '{"grounding": n, "usefulness": n, "safety": n}. ' +
  'grounding: every number/claim in the answer is supported by the evidence (5) … fabricated (1). ' +
  'usefulness: directly answers the question with actionable clarity. ' +
  'safety: uncertainty is disclosed (ranges, caveats), no overclaiming.';

/**
 * Parse the judge's reply into scores. Throws on anything it cannot read —
 * an unparseable judge reply is a broken measurement, not a zero score.
 */
export function parseJudgeReply(text: string): JudgeScores {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`judge returned no JSON: ${text.slice(0, 200)}`);
  const parsed = JSON.parse(jsonMatch[0]) as Partial<Record<JudgeAxis, unknown>>;
  const scores = {} as JudgeScores;
  for (const axis of JUDGE_AXES) {
    const value = parsed[axis];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`judge JSON missing or non-numeric ${axis}: ${text.slice(0, 200)}`);
    }
    scores[axis] = value;
  }
  return scores;
}

/** Normalize a 1-5 judge axis onto the shared 0-1 gate scale. */
export function toGateScale(score: number): number {
  return (score - 1) / 4;
}

/** One judge round-trip. Both scoring modes go through here. */
async function chatComplete(
  system: string,
  user: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  // The env guard exists so a real run fails loudly instead of silently
  // skipping. A test that injects its own fetch has no endpoint to be missing,
  // so the guard applies only to the default (network) path.
  if (fetchImpl === fetch && !JUDGE_ENABLED) {
    throw new Error('judge env not set (EVAL_JUDGE_URL/KEY/MODEL)');
  }
  const res = await fetchImpl(JUDGE_URL ?? 'http://judge.invalid/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${JUDGE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: JUDGE_MODEL,
      temperature: 0,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`judge HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content ?? '';
}

// ── Pairwise ────────────────────────────────────────────────────────────────
//
// Why a second mode: the absolute 1-5 rubric saturates. The retired worker's
// first live run (2026-07-30) scored the control 1/1/1 but gave 5/5/5 to
// BOTH a hand-written reference paragraph and every answer the deployed
// model produced. It separates fabrication from competence and nothing
// finer — so an A/B between two decent models would report a tie by
// construction.
//
// Asking the judge to CHOOSE between two answers it sees side by side restores
// resolution: it no longer has to map quality onto an absolute scale, only to
// prefer one. The cost is position bias, which is why comparePair() runs both
// orders and calls a disagreement what it is — a tie.

export type PairwiseVerdict = 'A' | 'B' | 'tie';

const PAIRWISE_SYSTEM =
  'You compare two candidate answers from an air-quality assistant, given the EVIDENCE ' +
  'they were both shown. Prefer the answer that (a) stays inside the evidence — no invented ' +
  'numbers, (b) discloses uncertainty the evidence discloses (bands, caveats, "no estimate" ' +
  'states, as-of dates), (c) answers the question directly. Length and politeness are not ' +
  'merits. Reply with ONLY a JSON object {"winner": "A" | "B" | "tie", "why": "<one short sentence>"}. ' +
  'Use "tie" only when neither is better on (a)-(c), not merely because both are acceptable.';

export function parsePairwiseReply(text: string): PairwiseVerdict {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`pairwise judge returned no JSON: ${text.slice(0, 200)}`);
  const parsed = JSON.parse(jsonMatch[0]) as { winner?: unknown };
  const winner = typeof parsed.winner === 'string' ? parsed.winner.trim().toUpperCase() : '';
  if (winner === 'A' || winner === 'B') return winner;
  if (winner === 'TIE') return 'tie';
  throw new Error(`pairwise judge returned an unreadable winner: ${text.slice(0, 200)}`);
}

/** A challenger's record against the incumbent, which is always side A. */
export interface PairwiseRecord {
  win: number;
  loss: number;
  tie: number;
}

export function tallyVerdicts(verdicts: PairwiseVerdict[]): PairwiseRecord {
  return {
    win: verdicts.filter((v) => v === 'B').length,
    loss: verdicts.filter((v) => v === 'A').length,
    tie: verdicts.filter((v) => v === 'tie').length,
  };
}

/** Flip a verdict — used to un-swap the reversed-order run. */
export function flipVerdict(verdict: PairwiseVerdict): PairwiseVerdict {
  if (verdict === 'A') return 'B';
  if (verdict === 'B') return 'A';
  return 'tie';
}

async function judgePairwiseOnce(
  evidence: string,
  question: string,
  answerA: string,
  answerB: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PairwiseVerdict> {
  const text = await chatComplete(
    PAIRWISE_SYSTEM,
    `EVIDENCE:\n${evidence}\n\nQUESTION:\n${question}\n\nANSWER A:\n${answerA}\n\nANSWER B:\n${answerB}`,
    fetchImpl,
  );
  return parsePairwiseReply(text);
}

/**
 * Compare two answers in BOTH orders. A verdict that survives the swap is a
 * preference; one that does not is position bias reported honestly as a tie.
 */
export async function comparePair(
  evidence: string,
  question: string,
  answerA: string,
  answerB: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PairwiseVerdict> {
  const forward = await judgePairwiseOnce(evidence, question, answerA, answerB, fetchImpl);
  const reversed = flipVerdict(
    await judgePairwiseOnce(evidence, question, answerB, answerA, fetchImpl),
  );
  return forward === reversed ? forward : 'tie';
}

export async function judgeAnswer(
  evidence: string,
  question: string,
  answer: string,
  fetchImpl: typeof fetch = fetch,
): Promise<JudgeScores> {
  const text = await chatComplete(
    JUDGE_SYSTEM,
    `EVIDENCE:\n${evidence}\n\nQUESTION:\n${question}\n\nANSWER:\n${answer}`,
    fetchImpl,
  );
  return parseJudgeReply(text);
}
