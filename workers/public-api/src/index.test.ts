import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from './index';
import type { Env } from './types';

// Transport-level tests read dynamically-shaped JSON; one loosely-typed reader
// keeps the assertions terse without annotating `any` at every call site.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const readBody = (res: Response): Promise<any> => res.json();

// ── Snapshot fixtures (shapes verified against the HF dataset's aq-data/**) ──
const GRID_PM25 = {
  variable: 'pm2_5',
  resolution: 1.0,
  timestamp: 1784829600000,
  nLat: 2,
  nLon: 2,
  latMin: -90.0,
  lonMin: -180.0,
  dLat: 1.0,
  dLon: 1.0,
  points: [
    { lat: -90.0, lon: -180.0, value: 0.74 },
    { lat: 37.5, lon: 127.0, value: 35.2 },
    { lat: 13.75, lon: 100.5, value: 11.6 },
  ],
  source: 'NOAA GEFS-Aerosols',
};
const PREDICTIONS = {
  generated_at: '2026-07-22T04:57:44Z',
  model_version: 'v2.0',
  model_available: true,
  count: 2,
  predictions: [
    {
      name: 'Seoul',
      lat: 37.5665,
      lon: 126.978,
      timestamp: '2026-07-22T04:00:00Z',
      predicted_p10: 19.12,
      predicted_p50: 39.28,
      predicted_p90: 41.3,
      uncertainty: 22.17,
      observed_pm25: 38.0,
      model_version: 'v2.0',
      source: 'ML-AODtoPM25Model',
      confidence_grade: 'B',
    },
    {
      name: 'Bangkok',
      lat: 13.7563,
      lon: 100.5018,
      timestamp: '2026-07-22T04:00:00Z',
      predicted_p10: 10.8,
      predicted_p50: 11.6,
      predicted_p90: 11.7,
      uncertainty: 0.9,
      observed_pm25: null,
      model_version: 'v2.0',
      source: 'ML-AODtoPM25Model',
      confidence_grade: 'A',
    },
  ],
};
const STATIONS = {
  meta: { source: 'partial', generated_at: '2026-07-22T00:00:00Z', note: 'demo' },
  stations: [
    {
      station_id: 'KR-SEOUL-001',
      lat: 37.5665,
      lon: 126.978,
      final_score: 82,
      measured_weight: 100,
      badge: 'High',
      freshness: 18,
      completeness: 17,
      consistency: null,
      stability: 16,
      model_residual: 15,
      reasons: { consistency: 'no_cross_source_pair' },
    },
    {
      station_id: 'XX-LOW-002',
      lat: 1,
      lon: 1,
      final_score: 66.7,
      measured_weight: 40,
      badge: null,
      freshness: 16,
      completeness: null,
      consistency: null,
      stability: null,
      model_residual: 10.7,
      reasons: {
        completeness: 'no_reading_count_over_window',
        consistency: 'no_cross_source_pair',
        stability: 'no_rolling_history',
        grade: 'insufficient_measured_weight',
      },
    },
  ],
};
const STATIONS_WITHHELD = {
  meta: { source: 'withheld', reason: 'gate failed', generated_at: '2026-07-22T00:00:00Z' },
  stations: [],
};

const SNAPSHOTS: Record<string, unknown> = {
  '/aq-data/current-pm25-grid.json': GRID_PM25,
  '/aq-data/predictions/grid_latest.json': PREDICTIONS,
  '/aq-data/data_quality.json': STATIONS,
};

function stubFetch(map: Record<string, unknown> = SNAPSHOTS) {
  vi.stubGlobal('fetch', (input: string | URL | Request) => {
    // DATA_ORIGIN itself carries a path prefix (HF's /datasets/.../resolve/main),
    // so match by suffix against the appended /aq-data/... path, not full equality.
    const pathname = new URL(String(input)).pathname;
    const key = Object.keys(map).find((k) => pathname.endsWith(k));
    if (key !== undefined) {
      return Promise.resolve(new Response(JSON.stringify(map[key]), { status: 200 }));
    }
    return Promise.resolve(new Response('not found', { status: 404 }));
  });
}

function makeEnv(over: Partial<Env> = {}): Env {
  return {
    DATA_ORIGIN: 'https://huggingface.co/datasets/Robeedau/airlens-live/resolve/main',
    RATE_LIMIT_MAX: '120',
    RATE_LIMIT_WINDOW_SECONDS: '60',
    ALLOWED_ORIGINS: '*',
    ...over,
  };
}

const get = (path: string, init?: RequestInit) =>
  worker.fetch(new Request(`https://api.airlens.cloud${path}`, init), makeEnv());

afterEach(() => vi.unstubAllGlobals());

describe('REST routing', () => {
  it('GET /v1/health → ok + dataset index', async () => {
    stubFetch();
    const res = await get('/v1/health');
    expect(res.status).toBe(200);
    const body = await readBody(res);
    expect(body.status).toBe('ok');
    expect(body.datasets).toContain('/v1/predictions/cities');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('GET /v1/grid/latest?variable=pm25 → labeled model-forecast, not ML', async () => {
    stubFetch();
    const res = await get('/v1/grid/latest?variable=pm25');
    expect(res.status).toBe(200);
    const body = await readBody(res);
    expect(body.provenance).toBe('model-forecast');
    expect(body.source).toBe('NOAA GEFS-Aerosols');
    expect(body.disclaimer).toMatch(/not AirLens ML/i);
    expect(body.count).toBe(3);
    expect(body.as_of).toBe(new Date(1784829600000).toISOString());
    expect(res.headers.get('Cache-Control')).toBe('public, s-maxage=600');
  });

  it('GET /v1/grid/latest with unknown variable → 400', async () => {
    stubFetch();
    const res = await get('/v1/grid/latest?variable=lead');
    expect(res.status).toBe(400);
  });

  it('GET /v1/predictions/cities → coverage disclosure attached', async () => {
    stubFetch();
    const res = await get('/v1/predictions/cities');
    expect(res.status).toBe(200);
    const body = await readBody(res);
    expect(body.provenance).toBe('inferred');
    expect(body.count).toBe(2);
    expect(body.coverage.nominal_interval_pct).toBe(80);
    // A real, sourced number now — not null. n/date/source travel alongside it so
    // consumers never see a bare percentage without knowing how much to trust it.
    expect(body.coverage.empirical_picp_pct).toBe(77.1);
    expect(body.coverage.empirical_picp_n).toBe(5283);
    expect(body.coverage.empirical_picp_measured_at).toBe('2026-09-03');
    expect(body.coverage.note).toMatch(/PICP/);
    expect(body.cities[0].pm25).toEqual({ p10: 19.12, p50: 39.28, p90: 41.3, unit: 'µg/m³' });
    expect(body.cities[0].confidence_grade).toBe('B');
  });

  it('GET /v1/predictions/cities/Seoul → single city (case-insensitive)', async () => {
    stubFetch();
    const res = await get('/v1/predictions/cities/seoul');
    expect(res.status).toBe(200);
    const body = await readBody(res);
    expect(body.city.name).toBe('Seoul');
    // A real, sourced number now — see the coverage-disclosure test above for the
    // full assertion; here just check it is not the retracted-null shape.
    expect(body.coverage.empirical_picp_pct).toBe(77.1);
  });

  it('GET /v1/predictions/cities/Atlantis → 404', async () => {
    stubFetch();
    const res = await get('/v1/predictions/cities/Atlantis');
    expect(res.status).toBe(404);
  });

  it('GET /v1/stations → components + grade sourced from the engine badge, not re-derived', async () => {
    stubFetch();
    const res = await get('/v1/stations');
    expect(res.status).toBe(200);
    const body = await readBody(res);
    expect(body.provenance).toBe('inferred');
    expect(body.subject_provenance).toBe('observed');
    expect(body.status).toBe('ok');
    expect(body.stations[0]).toEqual({
      station_id: 'KR-SEOUL-001',
      lat: 37.5665,
      lon: 126.978,
      final_score: 82,
      measured_weight: 100,
      dqss_grade: 'High',
      components: { freshness: 18, completeness: 17, consistency: null, stability: 16, model_residual: 15 },
      reason: { consistency: 'no_cross_source_pair' },
    });
    // measured_weight 40 < 60 suppression threshold → badge null, NOT re-derived from
    // final_score (66.7 would read as a real grade under the old dqssScoreToGrade path).
    expect(body.stations[1].dqss_grade).toBeNull();
    expect(body.stations[1].measured_weight).toBe(40);
    expect(body.stations[1].reason.grade).toBe('insufficient_measured_weight');
  });

  it('GET /v1/stations with a withheld snapshot → empty array + status withheld, still 200', async () => {
    stubFetch({ '/aq-data/data_quality.json': STATIONS_WITHHELD });
    const res = await get('/v1/stations');
    expect(res.status).toBe(200);
    const body = await readBody(res);
    expect(body.status).toBe('withheld');
    expect(body.count).toBe(0);
    expect(body.stations).toEqual([]);
  });

  it('GET /v1/stations → withheld status forces an empty array even if upstream ships stations anyway', async () => {
    // Producer-side contract slip: meta.source says withheld but stations[] is
    // non-empty. The handler must not trust that invariant and leak scores.
    stubFetch({ '/aq-data/data_quality.json': { ...STATIONS_WITHHELD, stations: STATIONS.stations } });
    const res = await get('/v1/stations');
    expect(res.status).toBe(200);
    const body = await readBody(res);
    expect(body.status).toBe('withheld');
    expect(body.count).toBe(0);
    expect(body.stations).toEqual([]);
  });

  it('GET /v1/ontology/summary → catalog with provenance per dataset', async () => {
    stubFetch();
    const res = await get('/v1/ontology/summary');
    expect(res.status).toBe(200);
    const body = await readBody(res);
    expect(body.datasets.map((d: { id: string }) => d.id)).toEqual([
      'pollutant-grid',
      'city-predictions',
      'station-quality',
    ]);
    // Badge vocabulary (High/Medium/Low/Unreliable), matching QualityBadge.from_score
    // (models/models/dqss/rule_based_dqss.py:76-83) — NOT the old A-F letter grades,
    // which would collide with stations[].dqss_grade's real badge values.
    expect(body.dqss_grade_cutoffs).toEqual({
      High: '>=80',
      Medium: '>=50',
      Low: '>=20',
      Unreliable: '<20',
    });
    expect(body.provenance_kinds['model-forecast']).toMatch(/forecast/i);
  });

  it('GET /v1/openapi.json → 3.1 spec with all paths', async () => {
    stubFetch();
    const res = await get('/v1/openapi.json');
    expect(res.status).toBe(200);
    const body = await readBody(res);
    expect(body.openapi).toBe('3.1.0');
    expect(Object.keys(body.paths)).toContain('/predictions/cities/{name}');
    expect(body.info.license.name).toBe('AGPL-3.0-or-later');
  });

  it('unknown route → 404', async () => {
    stubFetch();
    const res = await get('/v1/nope');
    expect(res.status).toBe(404);
  });

  it('POST to a REST route → 405', async () => {
    stubFetch();
    const res = await get('/v1/health', { method: 'POST' });
    expect(res.status).toBe(405);
  });
});

describe('upstream failures', () => {
  it('missing snapshot → 502', async () => {
    stubFetch({}); // every path 404s
    const res = await get('/v1/predictions/cities');
    expect(res.status).toBe(502);
  });

  it('grid snapshot missing → 502 (fixed path, not a user 404)', async () => {
    stubFetch({}); // current-pm25-grid.json absent → upstream unavailable
    const res = await get('/v1/grid/latest?variable=pm25');
    expect(res.status).toBe(502);
  });

  it('empty points grid → count 0, points [] (no contradiction)', async () => {
    stubFetch({ '/aq-data/current-pm25-grid.json': { ...GRID_PM25, points: null } });
    const res = await get('/v1/grid/latest?variable=pm25');
    expect(res.status).toBe(200);
    const body = await readBody(res);
    expect(body.count).toBe(0);
    expect(body.points).toEqual([]);
  });

  it('malformed city-name encoding → 400, not 500', async () => {
    stubFetch();
    const res = await get('/v1/predictions/cities/%zz');
    expect(res.status).toBe(400);
  });
});

describe('DATA_ORIGIN handling', () => {
  it('trailing slash on DATA_ORIGIN does not double the slash', async () => {
    let captured = '';
    vi.stubGlobal('fetch', (input: string | URL | Request) => {
      captured = String(input);
      return Promise.resolve(new Response(JSON.stringify(STATIONS), { status: 200 }));
    });
    const env: Env = {
      DATA_ORIGIN: 'https://huggingface.co/datasets/Robeedau/airlens-live/resolve/main/',
      RATE_LIMIT_MAX: '120',
      RATE_LIMIT_WINDOW_SECONDS: '60',
      ALLOWED_ORIGINS: '*',
    };
    const res = await worker.fetch(new Request('https://api.airlens.cloud/v1/stations'), env);
    expect(res.status).toBe(200);
    expect(captured).toBe(
      'https://huggingface.co/datasets/Robeedau/airlens-live/resolve/main/aq-data/data_quality.json',
    );
  });
});

describe('CORS + rate limit', () => {
  it('OPTIONS preflight → 204 with CORS', async () => {
    const res = await get('/v1/health', { method: 'OPTIONS' });
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('KV counter returns 429 past the budget', async () => {
    const store = new Map<string, string>();
    const kv = {
      get: (k: string) => Promise.resolve(store.get(k) ?? null),
      put: (k: string, v: string) => {
        store.set(k, v);
        return Promise.resolve();
      },
    } as unknown as KVNamespace;
    const env = makeEnv({ RATE_LIMIT_MAX: '2', RL_KV: kv });
    stubFetch();
    const call = () =>
      worker.fetch(
        new Request('https://api.airlens.cloud/v1/health', {
          headers: { 'CF-Connecting-IP': '9.9.9.9' },
        }),
        env,
      );
    expect((await call()).status).toBe(200);
    expect((await call()).status).toBe(200);
    const third = await call();
    expect(third.status).toBe(429);
    expect(third.headers.get('Retry-After')).toBeTruthy();
  });
});
