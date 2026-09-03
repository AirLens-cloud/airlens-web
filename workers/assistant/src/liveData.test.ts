// liveData.test.ts — cityMentionedInMessage/countryCodeFromPage matching,
// formatPrediction/formatPolicyImpact Glass-box formatting, and
// fetchLiveDataContext's fail-open fetch contract. AAA pattern; global
// `fetch` is stubbed per test (no live HF Hub network call).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildStructuredContext,
  cityMentionedInMessage,
  clearSnapshotMemo,
  countryCodeFromPage,
  fetchLiveDataContext,
  formatPolicyImpact,
  formatPrediction,
  type CityPredictionRow,
} from './liveData';
import type { Env } from './types';

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    SESSION_TTL_SECONDS: '3600',
    RATE_LIMIT_PER_MINUTE: '5',
    DAILY_MESSAGE_LIMIT: '30',
    DAILY_REQUEST_BUDGET: '10000',
    REQUEST_COST_ESTIMATE: '25',
    MAX_MESSAGE_LENGTH: '2000',
    MAX_HISTORY_TURNS: '10',
    ALLOWED_ORIGINS: 'https://airlens.cloud',
    CHAT_MODEL: '@cf/google/gemma-4-26b-a4b-it',
    EMBEDDING_MODEL: '@cf/baai/bge-m3',
    MAX_TOKENS: '512',
    TEMPERATURE: '0.3',
    RAG_TOP_K: '5',
    HF_LIVE_BASE: '',
    ...overrides,
  } as Env;
}

const SEOUL: CityPredictionRow = {
  name: 'Seoul',
  lat: 37.5,
  lon: 127.0,
  predicted_p10: 18,
  predicted_p50: 25,
  predicted_p90: 32,
  observed_pm25: 24,
  model_version: 'v2',
  confidence_grade: 'B',
};

describe('cityMentionedInMessage', () => {
  it('matches a city name mentioned in the message, case-insensitively', () => {
    const rows: CityPredictionRow[] = [SEOUL, { ...SEOUL, name: 'Busan' }];
    expect(cityMentionedInMessage(rows, 'how is the air in SEOUL today')?.name).toBe('Seoul');
  });

  it('prefers the longest matching name when multiple names are substrings of the message', () => {
    const rows: CityPredictionRow[] = [
      { ...SEOUL, name: 'York' },
      { ...SEOUL, name: 'New York' },
    ];
    expect(cityMentionedInMessage(rows, 'air quality in new york city')?.name).toBe('New York');
  });

  it('returns null when no city name appears in the message', () => {
    const rows: CityPredictionRow[] = [SEOUL];
    expect(cityMentionedInMessage(rows, 'how does AirLens compute DQSS')).toBeNull();
  });
});

describe('countryCodeFromPage', () => {
  it('extracts and uppercases a 2-letter country code', () => {
    expect(countryCodeFromPage('/country/kr')).toBe('KR');
  });

  it('extracts a 3-letter country code with a trailing path segment', () => {
    expect(countryCodeFromPage('/country/KOR/details')).toBe('KOR');
  });

  it('returns null for a non-country page', () => {
    expect(countryCodeFromPage('/globe')).toBeNull();
  });

  it('returns null when page is undefined', () => {
    expect(countryCodeFromPage(undefined)).toBeNull();
  });
});

describe('formatPrediction', () => {
  it('labels the retrieved band as ESTIMATED and a co-located reading as MEASURED', () => {
    const text = formatPrediction(SEOUL, new Date().toISOString());
    expect(text).toContain('ESTIMATED prediction');
    expect(text).toContain('MEASURED observation: 24');
  });

  it('says "none" for the measured observation when the row has no co-located reading', () => {
    const text = formatPrediction({ ...SEOUL, observed_pm25: null }, new Date().toISOString());
    expect(text).toContain('measured observation: none');
  });

  it('says "not computed" instead of inventing a confidence grade when absent', () => {
    const text = formatPrediction({ ...SEOUL, confidence_grade: null }, new Date().toISOString());
    expect(text).toContain('not computed');
  });

  it('reports a snapshot age in hours instead of "real-time" language', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 3_600_000).toISOString();
    const text = formatPrediction(SEOUL, twoHoursAgo);
    expect(text).toContain('generated 2h ago');
    expect(text.toLowerCase()).not.toContain('real-time');
    expect(text).not.toContain('실시간');
  });

  it('includes the band-uncertainty disclosure without citing an unverified coverage number', () => {
    const text = formatPrediction(SEOUL, new Date().toISOString());
    expect(text).toContain('epistemic-only');
    expect(text).not.toMatch(/coverage is \d/i);
  });
});

describe('formatPolicyImpact', () => {
  it('states the honesty-gate reason instead of fabricating an effect when att is null', () => {
    const text = formatPolicyImpact({
      country: 'KR',
      method: 'sdid',
      att: null,
      ci_95: null,
      p_value: null,
      significant: null,
      status: 'insufficient_controls',
      treatment_year: null,
    });
    expect(text).toContain('no ESTIMATE available');
    expect(text).toContain('insufficient_controls');
    expect(text).toContain('Do NOT fabricate');
  });

  it('pairs the ATT with its CI and p-value, framed as an estimate under assumptions', () => {
    const text = formatPolicyImpact({
      country: 'KR',
      method: 'sdid',
      att: -3.2,
      ci_95: [-5.1, -1.3],
      p_value: 0.02,
      significant: true,
      treatment_year: 2019,
      data_quality: { dqss_score: 72 },
    });
    expect(text).toContain('ESTIMATED ATT -3.2');
    expect(text).toContain('95% CI [-5.1, -1.3]');
    expect(text).toContain('p=0.02');
    expect(text).toContain('statistically significant');
    expect(text).toContain('never as a proven fact');
  });
});

describe('buildStructuredContext', () => {
  it('returns an empty string for no blocks (no "we looked but found nothing" noise)', () => {
    expect(buildStructuredContext([])).toBe('');
  });

  it('wraps non-empty blocks in the <structured_context> boundary tag', () => {
    const text = buildStructuredContext(['[P] block one']);
    expect(text.startsWith('<structured_context>')).toBe(true);
    expect(text.endsWith('</structured_context>')).toBe(true);
    expect(text).toContain('[P] block one');
  });
});

describe('fetchLiveDataContext', () => {
  beforeEach(() => {
    clearSnapshotMemo();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns no blocks and makes no fetch call when HF_LIVE_BASE is unset', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const env = makeEnv({ HF_LIVE_BASE: '' });
    const ctx = await fetchLiveDataContext(env, 'seoul air quality', undefined);
    expect(ctx.blocks).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('includes a prediction block when the message mentions a city in the fetched grid', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ generated_at: new Date().toISOString(), model_version: 'v2', predictions: [SEOUL] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const env = makeEnv({ HF_LIVE_BASE: 'https://example.invalid/live' });
    const ctx = await fetchLiveDataContext(env, 'how is seoul today', undefined);
    expect(ctx.blocks).toHaveLength(1);
    expect(ctx.blocks[0]).toContain('Seoul');
  });

  it('includes a policy block when `page` names a country, alongside the prediction fetch', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('predictions')) {
        return { ok: true, json: async () => ({ generated_at: new Date().toISOString(), predictions: [] }) };
      }
      return {
        ok: true,
        json: async () => ({ country: 'KR', method: 'sdid', att: -1.5, ci_95: [-2, -1], p_value: 0.01, significant: true, treatment_year: 2020 }),
      };
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
    const env = makeEnv({ HF_LIVE_BASE: 'https://example.invalid/live' });
    const ctx = await fetchLiveDataContext(env, 'why did the policy work', '/country/KR');
    expect(ctx.blocks).toHaveLength(1);
    expect(ctx.blocks[0]).toContain('KR');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('fails open to no blocks when the fetch throws (never fails the chat request)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const env = makeEnv({ HF_LIVE_BASE: 'https://example.invalid/live' });
    const ctx = await fetchLiveDataContext(env, 'seoul air quality', undefined);
    expect(ctx.blocks).toEqual([]);
  });
});
