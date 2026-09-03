// Unit tests for the judge's pure logic. No credentials, no network — the
// paid paths are exercised by quality.eval.test.ts / model-ab.eval.test.ts,
// which skip unless their env is set. Ported verbatim from the retired
// chatbot worker's eval/judge.test.ts — judge.ts is stack-agnostic.
import { describe, it, expect, vi } from 'vitest';
import {
  parseJudgeReply,
  parsePairwiseReply,
  flipVerdict,
  comparePair,
  tallyVerdicts,
  toGateScale,
  type PairwiseVerdict,
} from './judge';

describe('parseJudgeReply', () => {
  it('reads the three axes out of a fenced reply', () => {
    const reply = 'Sure:\n```json\n{"grounding": 5, "usefulness": 4, "safety": 3}\n```';
    expect(parseJudgeReply(reply)).toEqual({ grounding: 5, usefulness: 4, safety: 3 });
  });

  it('throws on a missing or non-numeric axis rather than scoring it zero', () => {
    expect(() => parseJudgeReply('{"grounding": 5, "usefulness": 4}')).toThrow(/safety/);
    expect(() => parseJudgeReply('{"grounding": "high", "usefulness": 4, "safety": 3}')).toThrow(
      /grounding/,
    );
    expect(() => parseJudgeReply('no json here')).toThrow(/no JSON/);
  });
});

describe('parsePairwiseReply', () => {
  it('accepts A / B / tie in any case', () => {
    expect(parsePairwiseReply('{"winner": "A", "why": "x"}')).toBe('A');
    expect(parsePairwiseReply('{"winner": "b"}')).toBe('B');
    expect(parsePairwiseReply('{"winner": "TIE"}')).toBe('tie');
  });

  it('throws on an unreadable winner instead of guessing', () => {
    expect(() => parsePairwiseReply('{"winner": "both"}')).toThrow(/unreadable/);
    expect(() => parsePairwiseReply('{"why": "no winner field"}')).toThrow(/unreadable/);
  });
});

describe('flipVerdict', () => {
  it('swaps sides and leaves a tie alone', () => {
    expect(flipVerdict('A')).toBe('B');
    expect(flipVerdict('B')).toBe('A');
    expect(flipVerdict('tie')).toBe('tie');
  });
});

/** A judge stub that returns the given winners in call order. */
function stubJudge(winners: string[]): typeof fetch {
  let call = 0;
  return vi.fn(async () => {
    const winner = winners[call++];
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: `{"winner": "${winner}"}` } }] }),
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

describe('comparePair', () => {
  it('keeps a preference that survives the order swap', async () => {
    // Arrange — forward says A wins; reversed says B wins, which un-swaps to A
    const fetchImpl = stubJudge(['A', 'B']);
    // Act / Assert
    await expect(comparePair('E', 'Q', 'answerA', 'answerB', fetchImpl)).resolves.toBe('A');
  });

  it('reports position bias as a tie, not as a winner', async () => {
    // Arrange — the judge picks whichever answer it sees first
    const fetchImpl = stubJudge(['A', 'A']);
    // Act / Assert — un-swapped that is A then B: a disagreement
    await expect(comparePair('E', 'Q', 'answerA', 'answerB', fetchImpl)).resolves.toBe('tie');
  });

  it('reports a genuine tie', async () => {
    const fetchImpl = stubJudge(['tie', 'tie']);
    await expect(comparePair('E', 'Q', 'answerA', 'answerB', fetchImpl)).resolves.toBe('tie');
  });
});

describe('tallyVerdicts', () => {
  it("counts from the challenger's side (the incumbent is always A)", () => {
    const verdicts: PairwiseVerdict[] = ['B', 'B', 'A', 'tie'];
    expect(tallyVerdicts(verdicts)).toEqual({ win: 2, loss: 1, tie: 1 });
  });
});

describe('toGateScale', () => {
  it('maps the 1-5 rubric onto 0-1', () => {
    expect(toGateScale(1)).toBe(0);
    expect(toGateScale(3)).toBe(0.5);
    expect(toGateScale(5)).toBe(1);
  });
});
