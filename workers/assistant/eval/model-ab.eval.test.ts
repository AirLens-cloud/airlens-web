// eval/model-ab.eval.test.ts — candidate-model A/B.
//
// Ported from the retired chatbot worker's eval/model-ab.eval.test.ts
// (design §1 D-1, "그대로" — this suite's logic doesn't care which backend
// RAG uses, only which CHAT_MODEL answers). OPT-IN twice over: needs the
// Workers AI generator env AND the judge env, and skips loudly without
// either. It costs real money on both sides (Workers AI neurons per
// generation, judge tokens per score), so it is never part of the default
// suite's paid surface and never runs on a PR — it is meant to be dispatched
// by hand from a workflow_dispatch workflow (see this repo's C4 handoff for
// the ported chatbot-model-ab.yml).
//
// Reads candidates from EVAL_AB_MODELS (comma-separated Workers AI model ids).
// The incumbent — wrangler.toml CHAT_MODEL — is always included, because a
// comparison without the thing you currently ship is not a comparison.
//
// This is an EXPERIMENT, not a gate: it fails only on things that are broken
// regardless of which model wins — an empty answer, or an unparseable judge.
// Ranking is reported for a human to read, never auto-applied.
//
// Two scoring modes, on purpose:
//   absolute (1-5) — comparable across runs, but SATURATED (the retired
//     worker's first live run gave 5/5/5 to every case of the incumbent). It
//     separates fabrication from competence and nothing finer.
//   pairwise       — the judge picks between two answers side by side, in both
//     orders. This is what actually ranks two decent models. Reported as
//     win/loss/tie against the incumbent, never as a score.
import { describe, it, expect } from 'vitest';
import {
  JUDGE_ENABLED,
  judgeAnswer,
  comparePair,
  tallyVerdicts,
  JUDGE_AXES,
  type JudgeScores,
  type PairwiseRecord,
  type PairwiseVerdict,
} from './judge';
import { GENERATE_ATTEMPTS, GENERATOR_ENABLED, generateAnswer, wranglerVars } from './generate';
import { CASES, type EvalCase } from './cases';

declare const process: { env: Record<string, string | undefined> };

const enabled = JUDGE_ENABLED && GENERATOR_ENABLED;

function candidateModels(): string[] {
  const incumbent = wranglerVars().chatModel;
  const extra = (process.env.EVAL_AB_MODELS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set([incumbent, ...extra])];
}

interface CaseOutcome {
  caseId: string;
  chars: number;
  finishReason: string | null;
  /** Cloudflare's own reported per-call neuron cost, null when the envelope
   *  carried none (2026-09-03, A-5 follow-up round 2 — non-reasoning model
   *  A/B needs real neurons/turn, not just judge scores, since the whole
   *  point of a non-reasoning candidate is that the same neuron spend goes
   *  to more answer and fewer thinking tokens). */
  neurons: number | null;
  /** null when the answer was empty — it was never scored. */
  scores: JudgeScores | null;
  /** Deterministic checks from cases.ts (mustAvoid / mustMentionOneOf). */
  rulesPassed: boolean;
  ruleNotes: string[];
  /** Kept for the pairwise pass against the incumbent. */
  answer: string;
  evidence: string;
  /** Set when generation itself failed after retries — a broken measurement. */
  error: string | null;
}

function checkRules(testCase: EvalCase, answer: string): { passed: boolean; notes: string[] } {
  const lower = answer.toLowerCase();
  const notes: string[] = [];
  for (const banned of testCase.mustAvoid ?? []) {
    if (lower.includes(banned.toLowerCase())) notes.push(`said "${banned}"`);
  }
  const oneOf = testCase.mustMentionOneOf ?? [];
  if (oneOf.length > 0 && !oneOf.some((s) => lower.includes(s.toLowerCase()))) {
    notes.push(`mentioned none of [${oneOf.join(', ')}]`);
  }
  return { passed: notes.length === 0, notes };
}

function mean(values: number[]): number {
  return values.length === 0 ? NaN : values.reduce((a, b) => a + b, 0) / values.length;
}

function fmt(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : '—';
}

describe.skipIf(!enabled)('candidate-model A/B (opt-in, paid)', () => {
  it(
    'scores every candidate on every case and reports a ranking',
    async () => {
      // Arrange
      const models = candidateModels();
      const report = new Map<string, CaseOutcome[]>();
      console.log(`[model-ab] ${models.length} candidate(s) × ${CASES.length} case(s)`);

      // Act — sequential on purpose: Workers AI rate-limits, and a 429 storm
      // would be reported as a model quality difference.
      for (const model of models) {
        const outcomes: CaseOutcome[] = [];
        for (const testCase of CASES) {
          // A candidate that fails on Cloudflare's side must not throw away the
          // measurements already paid for. Record it, keep going, and fail the
          // run at the end — reported, never silently dropped.
          let generated;
          try {
            generated = await generateAnswer({ model, ...testCase });
          } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            console.log(`[model-ab]   ${testCase.id}: GENERATION FAILED (${model}) — ${message}`);
            outcomes.push({
              caseId: testCase.id,
              chars: 0,
              finishReason: null,
              neurons: null,
              scores: null,
              rulesPassed: false,
              ruleNotes: [],
              answer: '',
              evidence: '',
              error: message,
            });
            continue;
          }
          const rules = checkRules(testCase, generated.text);
          outcomes.push({
            caseId: testCase.id,
            chars: generated.text.length,
            finishReason: generated.finishReason,
            neurons: generated.neurons,
            scores:
              generated.text.length === 0
                ? null
                : await judgeAnswer(generated.evidence, testCase.question, generated.text),
            rulesPassed: rules.passed,
            ruleNotes: rules.notes,
            answer: generated.text,
            evidence: generated.evidence,
            error: null,
          });
        }
        report.set(model, outcomes);
      }

      // Pairwise vs the incumbent — the pass that can actually rank two decent
      // models. Skipped when there is nothing to compare against.
      const incumbent = models[0];
      const challengers = models.slice(1);
      const records = new Map<string, PairwiseRecord>();
      for (const challenger of challengers) {
        const verdicts: PairwiseVerdict[] = [];
        for (const [i, testCase] of CASES.entries()) {
          const a = report.get(incumbent)![i];
          const b = report.get(challenger)![i];
          if (!a.answer || !b.answer) continue; // empty or errored — already a failure
          const verdict = await comparePair(a.evidence, testCase.question, a.answer, b.answer);
          verdicts.push(verdict);
          console.log(
            `[model-ab] pairwise ${testCase.id}: ${verdict === 'tie' ? 'tie' : verdict === 'B' ? 'challenger' : 'incumbent'} (${challenger})`,
          );
        }
        records.set(challenger, tallyVerdicts(verdicts));
      }

      // Report — one line per model, then the per-case detail that explains it.
      for (const [model, outcomes] of report) {
        const scored = outcomes.filter((o) => o.scores !== null);
        const axisMeans = JUDGE_AXES.map(
          (axis) => `${axis} ${fmt(mean(scored.map((o) => o.scores![axis])))}`,
        ).join(' | ');
        const errored = outcomes.filter((o) => o.error !== null).length;
        const empties = outcomes.length - scored.length - errored;
        const ruleFails = outcomes.filter((o) => o.error === null && !o.rulesPassed).length;
        const meanChars = mean(outcomes.filter((o) => o.error === null).map((o) => o.chars));
        const neuronSamples = outcomes.map((o) => o.neurons).filter((n): n is number => n !== null);
        const meanNeurons = mean(neuronSamples);
        console.log(
          `[model-ab] ${model}: ${axisMeans} | chars ${fmt(meanChars)} | neurons/turn ${fmt(meanNeurons)}` +
            `${neuronSamples.length < outcomes.length ? ` (${neuronSamples.length}/${outcomes.length} reported usage)` : ''}` +
            ` | empty ${empties}/${outcomes.length} | rule-fail ${ruleFails}/${outcomes.length} | error ${errored}/${outcomes.length}`,
        );
        for (const o of outcomes) {
          const scoreText = o.error
            ? 'ERROR'
            : o.scores
              ? JUDGE_AXES.map((a) => `${a[0]}${o.scores![a]}`).join('/')
              : 'EMPTY';
          const notes = o.ruleNotes.length > 0 ? ` ⚠ ${o.ruleNotes.join('; ')}` : '';
          console.log(
            `[model-ab]   ${o.caseId}: ${scoreText} chars=${o.chars} finish=${o.finishReason} neurons=${o.neurons ?? '—'}${notes}`,
          );
        }
      }

      for (const [challenger, record] of records) {
        console.log(
          `[model-ab] pairwise vs ${incumbent} — ${challenger}: ${record.win}W ${record.loss}L ${record.tie}T ` +
            '(both orders; a verdict that flips with order is counted as a tie)',
        );
      }
      if (challengers.length === 0) {
        console.log(
          '[model-ab] pairwise skipped — only the incumbent ran. Pass EVAL_AB_MODELS to compare.',
        );
      }

      // Assert — the only automatic failures are broken measurements, not
      // rankings. A human reads the log and decides whether to switch models.
      // These run AFTER the report so a failure never costs us the numbers.
      const errors = [...report].flatMap(([model, outcomes]) =>
        outcomes.filter((o) => o.error).map((o) => `${model}/${o.caseId}: ${o.error}`),
      );
      expect(
        errors,
        `generation failed after ${GENERATE_ATTEMPTS} attempts — this is an infrastructure failure, not a model verdict:\n${errors.join('\n')}`,
      ).toEqual([]);

      for (const [model, outcomes] of report) {
        for (const o of outcomes) {
          expect(
            o.chars,
            `${model} returned an empty answer for case "${o.caseId}" (finish_reason=${o.finishReason}) — this reaches users as a blank bubble`,
          ).toBeGreaterThan(0);
        }
      }
    },
    // 4 cases × N models × (1 generation + 1 judge call), sequential.
    30 * 60_000,
  );
});
