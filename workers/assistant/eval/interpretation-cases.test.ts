import { describe, expect, it } from 'vitest';
import {
  INTERPRETATION_CASES,
  INTERPRETATION_CATEGORIES,
  INTERPRETATION_SUITE_SUMMARY,
} from './interpretation-cases';

describe('PM2.5 interpretation evaluation inventory', () => {
  it('contains 72 cases split 48 Korean / 24 English across 12 categories', () => {
    expect(INTERPRETATION_SUITE_SUMMARY).toEqual({ total: 72, ko: 48, en: 24, categories: 12, liveRun: 'pending' });
    for (const category of INTERPRETATION_CATEGORIES) {
      expect(INTERPRETATION_CASES.filter((item) => item.category === category)).toHaveLength(6);
    }
  });

  it('has unique ids and explicit positive and negative assertions', () => {
    expect(new Set(INTERPRETATION_CASES.map((item) => item.id)).size).toBe(72);
    expect(INTERPRETATION_CASES.every((item) => item.question.trim().length > 0)).toBe(true);
    expect(INTERPRETATION_CASES.every((item) => item.expectation.mustMentionOneOf.length > 0)).toBe(true);
    expect(INTERPRETATION_CASES.every((item) => item.expectation.mustAvoid.length > 0)).toBe(true);
  });

  it('does not turn the fixture inventory into a fabricated model pass', () => {
    expect(INTERPRETATION_SUITE_SUMMARY.liveRun).toBe('pending');
  });
});
