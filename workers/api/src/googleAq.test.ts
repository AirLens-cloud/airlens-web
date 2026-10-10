import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { handleRequest, type Env } from './index';
import { handleGoogleAqProxy } from './googleAq';

function mockKv(): KVNamespace {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => {
      store.set(key, value);
    },
  } as unknown as KVNamespace;
}

function stubEnv(overrides: Partial<Env> = {}): Env {
  return {
    airlens_db: {} as D1Database,
    TURNSTILE_SECRET_KEY: 'secret',
    SUBMITTER_HASH_SECRET: 'secret',
    ALLOWED_ORIGINS: 'https://airlens.cloud',
    OBS_RATE_PER_MIN: '3',
    OBS_RATE_PER_DAY: '20',
    RL_KV: mockKv(),
    Google_AQ_API: 'test-google-key',
    ...overrides,
  };
}

function makeRequest(
  path: string,
  query: Record<string, string> = {},
  init: { method?: string; headers?: Record<string, string | undefined> } = {},
): Request {
  const url = new URL(`https://airlens.cloud${path}`);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const headers: Record<string, string> = { 'CF-Connecting-IP': '203.0.113.7' };
  for (const [k, v] of Object.entries(init.headers ?? {})) {
    if (v === undefined) delete headers[k];
    else headers[k] = v;
  }
  return new Request(url.toString(), { method: init.method ?? 'GET', headers });
}

const googleUpstreamBody = {
  indexes: [
    { code: 'uaqi', aqi: 42, dominantPollutant: 'pm25' },
    { code: 'ind_kr', aqi: 33, displayName: 'GOOD', dominantPollutant: 'pm25' },
  ],
  pollutants: [
    { code: 'pm25', concentration: { value: 9.1 } },
    { code: 'pm10', concentration: { value: 21 } },
  ],
  healthRecommendations: {
    generalPopulation: 'Enjoy outdoor activities.',
    elderly: 'No precautions needed.',
    children: 'No precautions needed.',
    athletes: 'No precautions needed.',
  },
  regionCode: 'KR',
};

describe('handleGoogleAqProxy (unit)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects a missing lat/lon with 400 before touching upstream', async () => {
    // Arrange
    const env = stubEnv();
    const req = makeRequest('/api/proxy/google-aq');

    // Act
    const res = await handleGoogleAqProxy(req, env, undefined, null);

    // Assert
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an out-of-range lat with 400', async () => {
    // Arrange
    const env = stubEnv();
    const req = makeRequest('/api/proxy/google-aq', { lat: '999', lon: '127' });

    // Act
    const res = await handleGoogleAqProxy(req, env, undefined, null);

    // Assert
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails closed with 503 when Google_AQ_API is unconfigured, never a silent empty 200', async () => {
    // Arrange
    const env = stubEnv({ Google_AQ_API: undefined });
    const req = makeRequest('/api/proxy/google-aq', { lat: '37.5', lon: '127.0' });

    // Act
    const res = await handleGoogleAqProxy(req, env, undefined, null);

    // Assert
    expect(res.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs to the currentConditions:lookup upstream with the key in the query string, and never echoes it back', async () => {
    // Arrange
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(googleUpstreamBody), { status: 200 }));
    const env = stubEnv();
    const req = makeRequest('/api/proxy/google-aq', { lat: '37.5', lon: '127.0' });

    // Act
    const res = await handleGoogleAqProxy(req, env, undefined, null);
    const bodyText = await res.text();

    // Assert
    expect(res.status).toBe(200);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain('airquality.googleapis.com/v1/currentConditions:lookup');
    expect(calledUrl).toContain('key=test-google-key');
    expect(calledInit.method).toBe('POST');
    expect(bodyText).not.toContain('test-google-key');
  });

  it('maps the raw Google response onto the flat client GoogleAqSnapshot shape', async () => {
    // Arrange
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(googleUpstreamBody), { status: 200 }));
    const env = stubEnv();
    const req = makeRequest('/api/proxy/google-aq', { lat: '37.5', lon: '127.0' });

    // Act
    const res = await handleGoogleAqProxy(req, env, undefined, null);
    const body = (await res.json()) as Record<string, unknown>;

    // Assert
    expect(body.source).toBe('google-aq-ondemand');
    expect(body.uaqi).toBe(42);
    expect(body.localAqi).toBe(33);
    expect(body.localAqiName).toBe('GOOD');
    expect(body.dominantPollutant).toBe('pm25');
    expect(body.pm25).toBe(9.1);
    expect(body.pm10).toBe(21);
    expect(body.o3).toBeNull(); // upstream omitted it — honest null, not fabricated
    expect((body.healthRecommendations as Record<string, unknown>).generalPopulation).toBe(
      'Enjoy outdoor activities.',
    );
  });

  it('propagates an upstream non-2xx as a fail-loud 502, never a silent 200', async () => {
    // Arrange
    fetchMock.mockResolvedValueOnce(new Response('server error', { status: 500 }));
    const env = stubEnv();
    const req = makeRequest('/api/proxy/google-aq', { lat: '37.5', lon: '127.0' });

    // Act
    const res = await handleGoogleAqProxy(req, env, undefined, null);

    // Assert
    expect(res.status).toBe(502);
  });

  it('turns a thrown network exception into a 502, not an unhandled rejection', async () => {
    // Arrange
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    const env = stubEnv();
    const req = makeRequest('/api/proxy/google-aq', { lat: '37.5', lon: '127.0' });

    // Act
    const res = await handleGoogleAqProxy(req, env, undefined, null);

    // Assert
    expect(res.status).toBe(502);
  });

  it('rate-limits a single IP past the 15/min google-aq budget', async () => {
    // Arrange
    fetchMock.mockResolvedValue(new Response(JSON.stringify(googleUpstreamBody), { status: 200 }));
    const env = stubEnv();

    // Act
    let last: Response | undefined;
    for (let i = 0; i < 16; i++) {
      last = await handleGoogleAqProxy(
        makeRequest('/api/proxy/google-aq', { lat: '37.5', lon: '127.0' }),
        env,
        undefined,
        null,
      );
    }

    // Assert
    expect(last?.status).toBe(429);
  });

  it('caches a successful response and serves the second identical request from cache', async () => {
    // Arrange
    fetchMock.mockResolvedValue(new Response(JSON.stringify(googleUpstreamBody), { status: 200 }));
    const store = new Map<string, Response>();
    const cacheMock = {
      match: vi.fn(async (req: Request) => store.get(req.url)?.clone()),
      put: vi.fn(async (req: Request, res: Response) => {
        store.set(req.url, res);
      }),
    };
    vi.stubGlobal('caches', { default: cacheMock });
    const env = stubEnv();
    const req = () => makeRequest('/api/proxy/google-aq', { lat: '37.5', lon: '127.0' });

    // Act
    const first = await handleGoogleAqProxy(req(), env, undefined, null);
    const second = await handleGoogleAqProxy(req(), env, undefined, null);

    // Assert
    expect(first.headers.get('X-Cache')).toBe('MISS');
    expect(second.headers.get('X-Cache')).toBe('HIT');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('handleRequest — /api/proxy/google-aq routing', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(JSON.stringify(googleUpstreamBody), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('routes GET /api/proxy/google-aq to the handler', async () => {
    // Arrange
    const env = stubEnv();
    const req = makeRequest('/api/proxy/google-aq', { lat: '37.5', lon: '127.0' });

    // Act
    const res = await handleRequest(req, env);

    // Assert
    expect(res.status).toBe(200);
  });

  it('OPTIONS preflight returns 204', async () => {
    // Arrange
    const env = stubEnv();
    const req = makeRequest('/api/proxy/google-aq', {}, { method: 'OPTIONS', headers: { Origin: 'https://airlens.cloud' } });

    // Act
    const res = await handleRequest(req, env);

    // Assert
    expect(res.status).toBe(204);
  });

  it('rejects a disallowed Origin with 403 origin_forbidden', async () => {
    // Arrange
    const env = stubEnv();
    const req = makeRequest(
      '/api/proxy/google-aq',
      { lat: '37.5', lon: '127.0' },
      { headers: { Origin: 'https://evil.example' } },
    );

    // Act
    const res = await handleRequest(req, env);

    // Assert
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a non-GET method with 405', async () => {
    // Arrange
    const env = stubEnv();
    const req = makeRequest('/api/proxy/google-aq', {}, { method: 'POST' });

    // Act
    const res = await handleRequest(req, env);

    // Assert
    expect(res.status).toBe(405);
  });
});
