// eval/cases.ts — the questions a candidate model must answer.
//
// Ported from the retired chatbot worker's eval/cases.ts (design §1 D-1:
// "cases 문항만 신 프롬프트 대응 재작성"). Each case pairs a question with
// evidence built by the PRODUCTION formatters (liveData.ts formatPrediction /
// formatPolicyImpact), so a candidate model sees exactly the
// `<structured_context>` block the deployed worker would assemble for that
// evidence (chat-stream.ts buildRagStream → liveData.ts buildStructuredContext).
//
// The cases are chosen to be falsifiable against a specific rule in
// prompts.ts / liveData.ts, not to be "representative traffic" — an A/B is
// only useful if a worse model can visibly fail. `mustAvoid` / `mustMentionOneOf`
// are cheap deterministic checks reported alongside the judge scores; they
// catch the failures a 1-5 rubric tends to average away.
import { formatPrediction, formatPolicyImpact, type CityPredictionRow } from '../src/liveData';
import type { RetrievedMatch } from '../src/rag';

export interface EvalCase {
  id: string;
  /** The prompts.ts / liveData.ts rule this case is designed to falsify. */
  rule: string;
  question: string;
  /** Pre-rendered `<structured_context>` blocks — exactly what
   *  formatPrediction/formatPolicyImpact produce for the given evidence,
   *  same contract as the retired worker's `causalBlocks`. */
  structuredBlocks: string[];
  /** Vectorize corpus matches — empty in every case below because these
   *  cases target the structured-evidence rules, not retrieval (retrieval
   *  recall is measured separately by retrieval.eval.test.ts). */
  matches: RetrievedMatch[];
  /** Lowercased substrings that must NOT appear in the answer. */
  mustAvoid?: string[];
  /** At least one of these lowercased substrings must appear. */
  mustMentionOneOf?: string[];
}

const AS_OF = '2026-09-02T04:00:00Z';

const SEOUL_ROW: CityPredictionRow = {
  name: 'Seoul',
  lat: 37.5665,
  lon: 126.978,
  predicted_p10: 18,
  predicted_p50: 25,
  predicted_p90: 32,
  observed_pm25: 24.6,
  model_version: 'gtwr-xgb-2026.07',
  confidence_grade: 'B',
};

const DELHI_ROW: CityPredictionRow = {
  name: 'Delhi',
  lat: 28.6139,
  lon: 77.209,
  predicted_p10: 142,
  predicted_p50: 168,
  predicted_p90: 191,
  observed_pm25: 167.4,
  model_version: 'gtwr-xgb-2026.07',
  confidence_grade: 'C',
};

export const CASES: EvalCase[] = [
  {
    id: 'band_disclosure',
    rule: 'response_format §1 — never a bare number without its p10-p90 band',
    question: '지금 서울 미세먼지 얼마나 심해?',
    structuredBlocks: [formatPrediction(SEOUL_ROW, AS_OF)],
    matches: [],
    mustMentionOneOf: ['18', 'p10'],
  },
  {
    id: 'hazardous_band_caveat',
    rule: 'liveData.ts BAND_DISCLOSURE — the band is epistemic-only, never a coverage guarantee',
    question: '지금 델리 초미세먼지 예측 믿어도 돼?',
    structuredBlocks: [formatPrediction(DELHI_ROW, AS_OF)],
    matches: [],
    // The evidence explicitly forbids quoting a coverage percentage.
    mustAvoid: ['80%', '80 %', '95%', '95 %'],
  },
  {
    id: 'honesty_gated_policy',
    rule: 'liveData.ts formatPolicyImpact honesty gate — no estimate must stay no estimate',
    question: '베트남 대기질 정책 효과가 얼마나 됐어?',
    structuredBlocks: [
      formatPolicyImpact({
        country: 'Vietnam',
        method: 'sdid',
        att: null,
        ci_95: null,
        p_value: null,
        significant: null,
        status: 'insufficient_pre_period',
        treatment_year: null,
        data_quality: { disclaimer: 'pre-treatment series shorter than 24 months' },
        generated_at: AS_OF,
      }),
    ],
    matches: [],
    mustMentionOneOf: ['없', 'not available', 'no estimate', '미산출', '통과하지'],
  },
  {
    id: 'no_evidence',
    rule: 'rag.ts NO_EVIDENCE_BLOCK — say there is no data instead of inventing it',
    question: '지금 울란바토르 PM2.5 수치 알려줘',
    structuredBlocks: [],
    matches: [],
    mustMentionOneOf: ['없', 'no data', "don't have", 'do not have', '확인', '모르'],
  },
];
