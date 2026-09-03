// eval/routing.eval.test.ts — intent routing accuracy sweep.
//
// CI-always: fully deterministic (classifyIntent is regex-only, zero LLM
// calls). Ported verbatim from the retired chatbot worker's
// eval/routing.eval.test.ts (design §1 D-1: guardrails.ts classifyIntent
// "그대로") — labeled ko/en fixture set, aggregate accuracy vs the ABSOLUTE
// floor (0.9) and the committed baseline gate (eval/gate.ts).
import { describe, it, expect } from 'vitest';
import { classifyIntent } from '../src/guardrails';
import type { ChatIntent } from '../src/types';
import { checkGate } from './gate';

interface RoutingCase {
  q: string;
  expected: ChatIntent;
}

const CASES: RoutingCase[] = [
  // ── causal (ko) ──
  { q: '왜 오늘 미세먼지가 심한가요?', expected: 'causal' },
  { q: '서울 공기가 나쁜 원인이 뭐야', expected: 'causal' },
  { q: '어제보다 대기질이 나빠진 이유가 궁금해요', expected: 'causal' },
  { q: '초미세먼지가 갑자기 높아진 게 중국 때문인가요?', expected: 'causal' },
  { q: '어째서 부산은 서울보다 공기가 좋은가요?', expected: 'causal' },
  // ── causal (en) ──
  { q: 'why is PM2.5 so high in Seoul today?', expected: 'causal' },
  { q: 'what is causing the haze right now', expected: 'causal' },
  { q: 'What caused the spike in air pollution yesterday?', expected: 'causal' },
  { q: 'Is there a reason the AQI jumped this morning?', expected: 'causal' },
  { q: 'why does air quality get worse in winter', expected: 'causal' },
  // ── causal wins over policy (mixed cue) ──
  { q: '왜 그 정책이 미세먼지를 줄였나요?', expected: 'causal' },
  { q: 'why did the emission standard fail to help?', expected: 'causal' },
  // ── policy (ko) ──
  { q: '한국 대기 정책이 실제로 효과가 있었나요?', expected: 'policy' },
  { q: '중국의 배출 기준 강화가 한국에 영향을 줬어?', expected: 'policy' },
  { q: '미세먼지 저감 조치 성과를 알려줘', expected: 'policy' },
  { q: '경유차 규제 이후 뭐가 달라졌지', expected: 'policy' },
  // ── policy (en) ──
  { q: 'did the clean air policy actually work in Korea?', expected: 'policy' },
  { q: 'did the emission standard change anything?', expected: 'policy' },
  { q: 'show me the SDID analysis for China', expected: 'policy' },
  { q: 'what regulations exist for PM2.5?', expected: 'policy' },
  // ── data_lookup (ko) ──
  { q: '지금 서울 미세먼지 얼마야?', expected: 'data_lookup' },
  { q: '오늘 부산 대기질 어때', expected: 'data_lookup' },
  { q: '현재 오존 농도 알려줘', expected: 'data_lookup' },
  { q: '실시간 PM2.5 수치 보여줘', expected: 'data_lookup' },
  // ── data_lookup (en) ──
  { q: 'what is the current air quality in Busan?', expected: 'data_lookup' },
  { q: 'PM2.5 level right now please', expected: 'data_lookup' },
  { q: 'how bad is the air quality today', expected: 'data_lookup' },
  { q: 'current AQI for Tokyo', expected: 'data_lookup' },
  // ── general (ko) ──
  { q: 'Globe 페이지 사용법 알려줘', expected: 'general' },
  { q: 'PM2.5가 건강에 어떤 영향을 주나요? 알려줘', expected: 'general' },
  { q: '카메라 기능은 뭐하는 거야', expected: 'general' },
  { q: 'DQSS 점수가 뭔가요', expected: 'general' },
  // ── general (en) ──
  { q: 'how do I use the camera feature?', expected: 'general' },
  { q: 'what can I do today?', expected: 'general' },
  { q: 'tell me about the AirLens platform', expected: 'general' },
  { q: 'what does the DQSS badge mean?', expected: 'general' },
];

describe('routing accuracy sweep (deterministic — CI always)', () => {
  it(`classifies ${CASES.length} labeled ko/en cases with accuracy ≥ 0.9 and above baseline gate`, () => {
    // Arrange / Act
    const failures: string[] = [];
    for (const { q, expected } of CASES) {
      const got = classifyIntent(q);
      if (got !== expected) failures.push(`"${q}" → ${got} (expected ${expected})`);
    }
    const accuracy = (CASES.length - failures.length) / CASES.length;
    if (failures.length > 0) {
      console.log(`[routing-eval] misroutes (${failures.length}):\n  ${failures.join('\n  ')}`);
    }

    // Assert — absolute floor first, then baseline regression gate
    expect(accuracy, failures.join('; ')).toBeGreaterThanOrEqual(0.9);
    checkGate('routing_accuracy', accuracy);
  });
});
