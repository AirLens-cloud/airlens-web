import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { handleRequest, type Env } from './index';
import { fieldsetTag, handleOpenMeteoProxy } from './proxy';

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

const weatherUpstreamBody = {
  latitude: 37.5,
  longitude: 127.0,
  hourly: { temperature_2m: [22], relative_humidity_2m: [55], wind_speed_10m: [3], weather_code: [1] },
};
const aqUpstreamBody = {
  latitude: 37.5,
  longitude: 127.0,
  hourly: { pm2_5: [10], pm10: [20], ozone: [30], nitrogen_dioxide: [5] },
};

describe('handleOpenMeteoProxy (unit)', () => {
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
    const req = makeRequest('/api/proxy/open-meteo-weather');

    // Act
    const res = await handleOpenMeteoProxy('open-meteo-weather', req, env, undefined, null);

    // Assert
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an out-of-range lat with 400', async () => {
    // Arrange
    const env = stubEnv();
    const req = makeRequest('/api/proxy/open-meteo-weather', { lat: '999', lon: '127' });

    // Act
    const res = await handleOpenMeteoProxy('open-meteo-weather', req, env, undefined, null);

    // Assert
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('proxies weather to api.open-meteo.com with the Instrument Sheet hourly param set, and passes the body through', async () => {
    // Arrange
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(weatherUpstreamBody), { status: 200 }));
    const env = stubEnv();
    const req = makeRequest('/api/proxy/open-meteo-weather', { lat: '37.5', lon: '127.0' });

    // Act
    const res = await handleOpenMeteoProxy('open-meteo-weather', req, env, undefined, null);

    // Assert
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(weatherUpstreamBody);
    const calledUrl = new URL(fetchMock.mock.calls[0]?.[0] as string);
    expect(calledUrl.hostname).toBe('api.open-meteo.com');
    expect(calledUrl.searchParams.get('hourly')).toBe(
      'temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code,apparent_temperature,precipitation_probability,cloud_cover,uv_index',
    );
    expect(calledUrl.searchParams.get('timezone')).toBe('auto');
  });

  it('proxies AQ to air-quality-api.open-meteo.com with the Instrument Sheet hourly param set (allowlist)', async () => {
    // Arrange
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(aqUpstreamBody), { status: 200 }));
    const env = stubEnv();
    const req = makeRequest('/api/proxy/open-meteo-aq', { lat: '37.5', lon: '127.0' });

    // Act
    const res = await handleOpenMeteoProxy('open-meteo-aq', req, env, undefined, null);

    // Assert
    expect(res.status).toBe(200);
    const calledUrl = new URL(fetchMock.mock.calls[0]?.[0] as string);
    expect(calledUrl.hostname).toBe('air-quality-api.open-meteo.com');
    expect(calledUrl.searchParams.get('hourly')).toBe(
      'pm2_5,pm10,ozone,nitrogen_dioxide,carbon_monoxide,dust,grass_pollen',
    );
  });

  it('caps forecast_hours at 168 like the retired data-proxy handler', async () => {
    // Arrange
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(weatherUpstreamBody), { status: 200 }));
    const env = stubEnv();
    const req = makeRequest('/api/proxy/open-meteo-weather', { lat: '37.5', lon: '127.0', hours: '9999' });

    // Act
    await handleOpenMeteoProxy('open-meteo-weather', req, env, undefined, null);

    // Assert
    const calledUrl = new URL(fetchMock.mock.calls[0]?.[0] as string);
    expect(calledUrl.searchParams.get('forecast_hours')).toBe('168');
  });

  it('propagates an upstream non-2xx as a fail-loud 502, never a silent 200', async () => {
    // Arrange
    fetchMock.mockResolvedValueOnce(new Response('server error', { status: 500 }));
    const env = stubEnv();
    const req = makeRequest('/api/proxy/open-meteo-weather', { lat: '37.5', lon: '127.0' });

    // Act
    const res = await handleOpenMeteoProxy('open-meteo-weather', req, env, undefined, null);

    // Assert
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string; upstream_status: number };
    expect(body.upstream_status).toBe(500);
  });

  it('rejects an upstream shape with an out-of-range latitude as 502 (schema check)', async () => {
    // Arrange
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ latitude: 999, longitude: 127 }), { status: 200 }));
    const env = stubEnv();
    const req = makeRequest('/api/proxy/open-meteo-weather', { lat: '37.5', lon: '127.0' });

    // Act
    const res = await handleOpenMeteoProxy('open-meteo-weather', req, env, undefined, null);

    // Assert
    expect(res.status).toBe(502);
  });

  it('turns a thrown network exception into a 502, not an unhandled rejection', async () => {
    // Arrange
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    const env = stubEnv();
    const req = makeRequest('/api/proxy/open-meteo-weather', { lat: '37.5', lon: '127.0' });

    // Act
    const res = await handleOpenMeteoProxy('open-meteo-weather', req, env, undefined, null);

    // Assert
    expect(res.status).toBe(502);
  });

  it('rate-limits a single IP past the 30/min proxy budget', async () => {
    // Arrange
    fetchMock.mockResolvedValue(new Response(JSON.stringify(weatherUpstreamBody), { status: 200 }));
    const env = stubEnv();

    // Act
    let last: Response | undefined;
    for (let i = 0; i < 31; i++) {
      last = await handleOpenMeteoProxy(
        'open-meteo-weather',
        makeRequest('/api/proxy/open-meteo-weather', { lat: '37.5', lon: '127.0' }),
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
    fetchMock.mockResolvedValue(new Response(JSON.stringify(weatherUpstreamBody), { status: 200 }));
    const store = new Map<string, Response>();
    const cacheMock = {
      match: vi.fn(async (req: Request) => store.get(req.url)?.clone()),
      put: vi.fn(async (req: Request, res: Response) => {
        store.set(req.url, res);
      }),
    };
    vi.stubGlobal('caches', { default: cacheMock });
    const env = stubEnv();
    const req = () => makeRequest('/api/proxy/open-meteo-weather', { lat: '37.5', lon: '127.0' });

    // Act
    const first = await handleOpenMeteoProxy('open-meteo-weather', req(), env, undefined, null);
    const second = await handleOpenMeteoProxy('open-meteo-weather', req(), env, undefined, null);

    // Assert
    expect(first.headers.get('X-Cache')).toBe('MISS');
    expect(second.headers.get('X-Cache')).toBe('HIT');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keys the cache on the requested fieldset so a field-list change self-invalidates', async () => {
    // Arrange — the two routes request different `hourly` field lists, so their
    // cache keys must differ by more than the route path. Regression guard for
    // 2026-08-26: the Instrument Sheet field expansion kept hitting entries
    // stored under the pre-expansion field list, serving stale short responses.
    fetchMock.mockResolvedValue(new Response(JSON.stringify(weatherUpstreamBody), { status: 200 }));
    const keys: string[] = [];
    const cacheMock = {
      match: vi.fn(async (req: Request) => {
        keys.push(req.url);
        return undefined;
      }),
      put: vi.fn(async () => undefined),
    };
    vi.stubGlobal('caches', { default: cacheMock });
    const env = stubEnv();

    // Act
    await handleOpenMeteoProxy(
      'open-meteo-weather',
      makeRequest('/api/proxy/open-meteo-weather', { lat: '37.5', lon: '127.0' }),
      env,
      undefined,
      null,
    );

    // Assert
    expect(keys).toHaveLength(1);
    const fields = new URL(keys[0]).searchParams.get('fields');
    expect(fields).toBeTruthy();
    // The tag must track the field list, not be a constant.
    expect(fieldsetTag('a,b')).not.toBe(fieldsetTag('a,b,c'));
    expect(fieldsetTag('a,b')).toBe(fieldsetTag('a,b'));
  });

  it('does not cache a failed upstream response', async () => {
    // Arrange
    fetchMock.mockResolvedValueOnce(new Response('err', { status: 500 }));
    const cacheMock = {
      match: vi.fn(async () => undefined),
      put: vi.fn(async () => {}),
    };
    vi.stubGlobal('caches', { default: cacheMock });
    const env = stubEnv();

    // Act
    await handleOpenMeteoProxy(
      'open-meteo-weather',
      makeRequest('/api/proxy/open-meteo-weather', { lat: '37.5', lon: '127.0' }),
      env,
      undefined,
      null,
    );

    // Assert
    expect(cacheMock.put).not.toHaveBeenCalled();
  });

  it('attaches CORS headers resolved by the caller', async () => {
    // Arrange
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(weatherUpstreamBody), { status: 200 }));
    const env = stubEnv();
    const cors = { 'Access-Control-Allow-Origin': 'https://airlens.cloud' };

    // Act
    const res = await handleOpenMeteoProxy(
      'open-meteo-weather',
      makeRequest('/api/proxy/open-meteo-weather', { lat: '37.5', lon: '127.0' }),
      env,
      undefined,
      cors,
    );

    // Assert
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://airlens.cloud');
  });
});

describe('handleRequest — /api/proxy/* routing', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(JSON.stringify(weatherUpstreamBody), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('routes GET /api/proxy/open-meteo-weather to the proxy handler', async () => {
    // Arrange
    const env = stubEnv();
    const req = makeRequest('/api/proxy/open-meteo-weather', { lat: '37.5', lon: '127.0' });

    // Act
    const res = await handleRequest(req, env);

    // Assert
    expect(res.status).toBe(200);
  });

  it('OPTIONS preflight on a proxy route returns 204', async () => {
    // Arrange
    const env = stubEnv();
    const req = makeRequest('/api/proxy/open-meteo-weather', {}, { method: 'OPTIONS', headers: { Origin: 'https://airlens.cloud' } });

    // Act
    const res = await handleRequest(req, env);

    // Assert
    expect(res.status).toBe(204);
  });

  it('rejects a disallowed Origin with 403 origin_forbidden', async () => {
    // Arrange
    const env = stubEnv();
    const req = makeRequest(
      '/api/proxy/open-meteo-weather',
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
    const req = makeRequest('/api/proxy/open-meteo-weather', {}, { method: 'POST' });

    // Act
    const res = await handleRequest(req, env);

    // Assert
    expect(res.status).toBe(405);
  });

  it('an unknown /api/proxy/* path falls through to 404', async () => {
    // Arrange
    const env = stubEnv();
    const req = makeRequest('/api/proxy/unknown-route');

    // Act
    const res = await handleRequest(req, env);

    // Assert
    expect(res.status).toBe(404);
  });
});
