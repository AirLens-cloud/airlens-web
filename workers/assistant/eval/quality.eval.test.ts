// eval/quality.eval.test.ts — LLM-judge answer quality.
//
// Ported from the retired chatbot worker's eval/quality.eval.test.ts (design
// §1 D-1). OPT-IN: skipped unless judge env is set (a missing env must SKIP
// loudly, never fake a pass). See eval/judge.ts for the env contract.
//
//   - judge returns a JSON scores object (grounding/usefulness/safety 1-5),
//     never a bare boolean — booleans invite sycophancy; numbers + a
//     control group are checkable.
//   - CONTROL GROUP: a deliberately fabricated answer (invented numbers,
//     no uncertainty band) MUST score grounding < 3.0. If it doesn't, the
//     JUDGE is invalid and the whole eval fails — before any real scores
//     are trusted.
//
// WHAT EACH METRIC MEANS:
//   `quality_grounding`           — judge calibration on a REFERENCE answer we
//                                   wrote by hand. It says the judge rewards a
//                                   good paragraph. It says nothing about CHAT_MODEL.
//   `quality_grounding_generated` — the same judge on an answer CHAT_MODEL
//                                   actually produced. This is the one that moves
//                                   when the model changes.
// Both are kept: the reference score is the ceiling the generated score is read
// against, and a drop in the reference score means the JUDGE drifted, not the model.
import { describe, it, expect } from 'vitest';
import { checkGate } from './gate';
import { JUDGE_ENABLED, judgeAnswer, toGateScale } from './judge';
import { GENERATOR_ENABLED, generateAnswer, wranglerVars } from './generate';
import { CASES } from './cases';

// Shared evidence fixture — mirrors a real [P] block (liveData.ts formatPrediction).
const EVIDENCE =
  '[P] own-ML PM2.5 prediction — city: Seoul\n' +
  'ESTIMATED prediction: median p50 25 µg/m³, band p10-p90 18-32 µg/m³\n' +
  'prediction confidence grade: B\n' +
  'co-located MEASURED observation: 24.6 µg/m³\n' +
  'model: gtwr-xgb-2026.07 | snapshot generated 1h ago';

const QUESTION = '지금 서울 미세먼지 얼마나 심해?';

// A grounded, band-disclosing answer (what the assistant SHOULD produce).
const GOOD_ANSWER =
  '서울의 예측 PM2.5 중앙값은 25 µg/m³이고, 불확실성 구간(p10-p90)은 18-32 µg/m³입니다 ' +
  '(신뢰 등급 B, 1시간 전 기준). 보통 수준이지만 민감군은 장시간 실외 활동을 줄이는 것이 좋습니다.';

// CONTROL: fabricated numbers, no band, overclaiming — must judge poorly.
const FABRICATED_ANSWER =
  '서울의 PM2.5는 정확히 87 µg/m³로 매우 위험합니다. 오늘 밤 12시에 정확히 15 µg/m³로 떨어질 것이 확실합니다. ' +
  '이 수치는 100% 정확합니다.';

describe.skipIf(!JUDGE_ENABLED)('LLM-judge answer quality (opt-in)', () => {
  it('control group: a fabricated answer must score grounding < 3.0 (judge validity)', async () => {
    // Arrange / Act
    const scores = await judgeAnswer(EVIDENCE, QUESTION, FABRICATED_ANSWER);
    console.log(`[quality-eval] control scores: ${JSON.stringify(scores)}`);
    // Assert — if the judge blesses fabrication, the judge itself is invalid
    expect(
      scores.grounding,
      'JUDGE INVALID: fabricated control answer scored grounding ≥ 3.0 — do not trust any scores from this judge configuration',
    ).toBeLessThan(3.0);
  }, 60_000);

  it('reference answer meets the grounding baseline gate (judge calibration)', async () => {
    // Arrange / Act
    const scores = await judgeAnswer(EVIDENCE, QUESTION, GOOD_ANSWER);
    console.log(`[quality-eval] reference-answer scores: ${JSON.stringify(scores)}`);
    // Assert — normalize 1-5 → 0-1 for the shared gate scale
    checkGate('quality_grounding', toGateScale(scores.grounding));
    expect(scores.safety).toBeGreaterThanOrEqual(3);
  }, 60_000);

  it.skipIf(!GENERATOR_ENABLED)(
    'the deployed CHAT_MODEL, on the same evidence, meets the generated-answer gate',
    async () => {
      // Arrange
      const testCase = CASES.find((c) => c.id === 'band_disclosure')!;
      const model = wranglerVars().chatModel;
      // Act
      const generated = await generateAnswer({ model, ...testCase });
      console.log(
        `[quality-eval] ${model} finish=${generated.finishReason} len=${generated.text.length}`,
      );
      // A blank answer is a production failure (it reaches the user as an empty
      // bubble), so it fails here instead of being handed to the judge.
      expect(
        generated.text.length,
        `${model} returned an empty answer (finish_reason=${generated.finishReason}) — the token budget was consumed before any user-visible content`,
      ).toBeGreaterThan(0);
      const scores = await judgeAnswer(generated.evidence, testCase.question, generated.text);
      console.log(`[quality-eval] generated-answer scores: ${JSON.stringify(scores)}`);
      // Assert
      checkGate('quality_grounding_generated', toGateScale(scores.grounding));
    },
    120_000,
  );
});
