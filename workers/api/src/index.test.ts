import { afterEach, describe, expect, it, vi } from 'vitest';

import { handleRequest, type Env } from './index';

const VALID_ACCESS_TOKEN = 'valid-token';

// The admin-route gate itself (JWKS/RS256 verification) is covered end-to-end
// in access.test.ts; here `./access` is mocked so this file's tests focus on
// handleRequest's routing/CORS wiring for /api/admin/* rather than
// re-deriving RSA key material per case.
vi.mock('./access', () => ({
  authenticateAccessRequest: vi.fn(async (request: Request, env: Env) => {
    if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) {
      return { ok: false, status: 503, error: 'access_not_configured' };
    }
    const token = request.headers.get('Cf-Access-Jwt-Assertion');
    if (!token) {
      return { ok: false, status: 401, error: 'access_jwt_missing' };
    }
    if (token !== VALID_ACCESS_TOKEN) {
      return { ok: false, status: 403, error: 'access_denied' };
    }
    return { ok: true, identity: { email: 'admin@airlens.cloud', sub: 'access-sub-123' } };
  }),
}));

function stubD1(runImpl?: () => Promise<unknown>): D1Database {
  return {
    prepare: () => ({
      first: async () => ({ '1': 1 }),
      bind: (..._args: unknown[]) => ({
        run: runImpl ?? (async () => ({ success: true })),
      }),
    }),
  } as unknown as D1Database;
}

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
    airlens_db: stubD1(),
    TURNSTILE_SECRET_KEY: 'secret',
    SUBMITTER_HASH_SECRET: 'secret',
    ALLOWED_ORIGINS: 'https://airlens.cloud',
    OBS_RATE_PER_MIN: '3',
    OBS_RATE_PER_DAY: '20',
    ...overrides,
  };
}

const DEFAULT_IP = '203.0.113.7';

/** POST request with a correct Content-Length (tests opt out of the default
 * CF-Connecting-IP by passing `{'CF-Connecting-IP': undefined}` — see rawRequest). */
function rawRequest(url: string, rawBody: string, extraHeaders: Record<string, string | undefined> = {}): Request {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'content-length': String(new TextEncoder().encode(rawBody).length),
    'CF-Connecting-IP': DEFAULT_IP,
  };
  for (const [key, value] of Object.entries(extraHeaders)) {
    if (value === undefined) {
      delete headers[key];
    } else {
      headers[key] = value;
    }
  }
  return new Request(url, { method: 'POST', headers, body: rawBody });
}

function jsonRequest(url: string, body: unknown, extraHeaders: Record<string, string | undefined> = {}): Request {
  return rawRequest(url, JSON.stringify(body), extraHeaders);
}

function validObservationBody(): Record<string, unknown> {
  return {
    turnstile_token: 'tok-123',
    latitude: 37.5,
    longitude: 127.0,
    pm25_estimate: 12.3,
    sky_condition: 'clear',
    memo: 'hazy today',
  };
}

function validTrainingSampleBody(): Record<string, unknown> {
  return {
    turnstile_token: 'tok-123',
    location_lat: 37.5,
    location_lon: 127.0,
    local_taken_at: '2026-08-20T09:00:00.000Z',
    emotion_score: 3,
    weather: { temp_c: 24 },
    aqi: { pm25: 12 },
    sensory_tags: { dusty: true },
  };
}

function stubTurnstilePass(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 })),
  );
}

function stubTurnstileFail(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }), {
          status: 200,
        }),
    ),
  );
}

describe('handleRequest — /api/health', () => {
  it('returns 200 with probe fields on GET /api/health', async () => {
    // Arrange
    const env = stubEnv();
    const request = new Request('https://airlens.cloud/api/health');

    // Act
    const response = await handleRequest(request, env);
    const body = (await response.json()) as Record<string, unknown>;

    // Assert
    expect(response.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.service).toBe('airlens-api');
    expect(body.d1).toBe('ok');
    expect(body.kv).toBe('unbound');
  });

  it('reports d1 error without failing the 200 when the probe throws', async () => {
    // Arrange
    const d1Broken = {
      prepare: () => ({
        first: async () => {
          throw new Error('no such binding');
        },
      }),
    } as unknown as D1Database;
    const env = stubEnv({ airlens_db: d1Broken });
    const request = new Request('https://airlens.cloud/api/health');

    // Act
    const response = await handleRequest(request, env);
    const body = (await response.json()) as Record<string, unknown>;

    // Assert
    expect(response.status).toBe(200);
    expect(body.d1).toBe('error');
  });

  it('returns 404 for unknown paths', async () => {
    // Arrange
    const env = stubEnv();
    const request = new Request('https://airlens.cloud/api/nope');

    // Act
    const response = await handleRequest(request, env);

    // Assert
    expect(response.status).toBe(404);
  });

  it('returns 404 for non-GET methods on /api/health', async () => {
    // Arrange
    const env = stubEnv();
    const request = new Request('https://airlens.cloud/api/health', { method: 'POST' });

    // Act
    const response = await handleRequest(request, env);

    // Assert
    expect(response.status).toBe(404);
  });
});

describe('handleRequest — POST /api/observations', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns 201 pending_review on a fully valid submission', async () => {
    // Arrange
    stubTurnstilePass();
    const env = stubEnv({ airlens_db: stubD1(), RL_KV: mockKv() });
    const request = jsonRequest('https://airlens.cloud/api/observations', validObservationBody(), {
      Origin: 'https://airlens.cloud',
    });

    // Act
    const response = await handleRequest(request, env);
    const body = (await response.json()) as Record<string, unknown>;

    // Assert
    expect(response.status).toBe(201);
    expect(body.status).toBe('pending_review');
    expect(typeof body.id).toBe('string');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://airlens.cloud');
  });

  it('returns 413 payload_too_large when Content-Length exceeds the cap', async () => {
    // Arrange
    stubTurnstilePass();
    const env = stubEnv();
    const request = new Request('https://airlens.cloud/api/observations', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': '20000', 'CF-Connecting-IP': DEFAULT_IP },
      body: JSON.stringify(validObservationBody()),
    });

    // Act
    const response = await handleRequest(request, env);
    const body = (await response.json()) as Record<string, unknown>;

    // Assert
    expect(response.status).toBe(413);
    expect(body.error).toBe('payload_too_large');
  });

  it('returns 413 payload_too_large when Content-Length is missing', async () => {
    // Arrange
    stubTurnstilePass();
    const env = stubEnv();
    const request = new Request('https://airlens.cloud/api/observations', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'CF-Connecting-IP': DEFAULT_IP },
      body: JSON.stringify(validObservationBody()),
    });

    // Act
    const response = await handleRequest(request, env);
    const body = (await response.json()) as Record<string, unknown>;

    // Assert
    expect(response.status).toBe(413);
    expect(body.error).toBe('payload_too_large');
  });

  it('returns 400 client_ip_unavailable when CF-Connecting-IP is missing', async () => {
    // Arrange
    stubTurnstilePass();
    const env = stubEnv();
    const request = jsonRequest('https://airlens.cloud/api/observations', validObservationBody(), {
      'CF-Connecting-IP': undefined,
    });

    // Act
    const response = await handleRequest(request, env);
    const body = (await response.json()) as Record<string, unknown>;

    // Assert
    expect(response.status).toBe(400);
    expect(body.error).toBe('client_ip_unavailable');
  });

  it('returns 400 on invalid JSON', async () => {
    // Arrange
    stubTurnstilePass();
    const env = stubEnv();
    const request = rawRequest('https://airlens.cloud/api/observations', '{not json');

    // Act
    const response = await handleRequest(request, env);
    const body = (await response.json()) as Record<string, unknown>;

    // Assert
    expect(response.status).toBe(400);
    expect(body.error).toBe('invalid_json');
  });

  it('returns 400 with the failing field on a missing turnstile_token', async () => {
    // Arrange
    stubTurnstilePass();
    const env = stubEnv();
    const { turnstile_token: _drop, ...rest } = validObservationBody();
    void _drop;
    const request = jsonRequest('https://airlens.cloud/api/observations', rest);

    // Act
    const response = await handleRequest(request, env);
    const body = (await response.json()) as Record<string, unknown>;

    // Assert
    expect(response.status).toBe(400);
    expect(body.field).toBe('turnstile_token');
  });

  it('returns 403 with sanitized codes when Turnstile verification fails', async () => {
    // Arrange
    stubTurnstileFail();
    const env = stubEnv();
    const request = jsonRequest('https://airlens.cloud/api/observations', validObservationBody());

    // Act
    const response = await handleRequest(request, env);
    const body = (await response.json()) as Record<string, unknown>;

    // Assert
    expect(response.status).toBe(403);
    expect(body.error).toBe('turnstile_failed');
    expect(body.codes).toEqual(['invalid-input-response']);
  });

  it('returns 403 for a disallowed Origin', async () => {
    // Arrange
    stubTurnstilePass();
    const env = stubEnv();
    const request = jsonRequest('https://airlens.cloud/api/observations', validObservationBody(), {
      Origin: 'https://evil.example',
    });

    // Act
    const response = await handleRequest(request, env);
    const body = (await response.json()) as Record<string, unknown>;

    // Assert
    expect(response.status).toBe(403);
    expect(body.error).toBe('origin_forbidden');
  });

  it('returns 429 with Retry-After once the per-IP rate limit is exceeded', async () => {
    // Arrange
    stubTurnstilePass();
    const env = stubEnv({ RL_KV: mockKv(), OBS_RATE_PER_MIN: '1' });
    const makeRequest = () => jsonRequest('https://airlens.cloud/api/observations', validObservationBody());

    // Act
    await handleRequest(makeRequest(), env);
    const second = await handleRequest(makeRequest(), env);
    const body = (await second.json()) as Record<string, unknown>;

    // Assert
    expect(second.status).toBe(429);
    expect(body.error).toBe('rate_limited');
    expect(second.headers.get('Retry-After')).not.toBeNull();
  });

  it('returns 204 with CORS headers on OPTIONS for an allowed origin', async () => {
    // Arrange
    const env = stubEnv();
    const request = new Request('https://airlens.cloud/api/observations', {
      method: 'OPTIONS',
      headers: { Origin: 'https://airlens.cloud' },
    });

    // Act
    const response = await handleRequest(request, env);

    // Assert
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://airlens.cloud');
  });

  it('returns 500 db_error when the D1 insert throws', async () => {
    // Arrange
    stubTurnstilePass();
    const failingD1 = stubD1(async () => {
      throw new Error('insert failed');
    });
    const env = stubEnv({ airlens_db: failingD1 });
    const request = jsonRequest('https://airlens.cloud/api/observations', validObservationBody());

    // Act
    const response = await handleRequest(request, env);
    const body = (await response.json()) as Record<string, unknown>;

    // Assert
    expect(response.status).toBe(500);
    expect(body.error).toBe('db_error');
  });
});

describe('handleRequest — POST /api/training-samples', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns 201 with a sample_id on a fully valid submission', async () => {
    // Arrange
    stubTurnstilePass();
    const env = stubEnv();
    const request = jsonRequest('https://airlens.cloud/api/training-samples', validTrainingSampleBody());

    // Act
    const response = await handleRequest(request, env);
    const body = (await response.json()) as Record<string, unknown>;

    // Assert
    expect(response.status).toBe(201);
    expect(body.ok).toBe(true);
    expect(typeof body.sample_id).toBe('string');
  });

  it('returns 400 with the failing field on an invalid emotion_score', async () => {
    // Arrange
    stubTurnstilePass();
    const env = stubEnv();
    const request = jsonRequest('https://airlens.cloud/api/training-samples', {
      ...validTrainingSampleBody(),
      emotion_score: 9,
    });

    // Act
    const response = await handleRequest(request, env);
    const body = (await response.json()) as Record<string, unknown>;

    // Assert
    expect(response.status).toBe(400);
    expect(body.error).toBe('validation');
    expect(body.field).toBe('emotion_score');
  });

  it('returns 400 validation when sky_crop_key is provided', async () => {
    // Arrange
    stubTurnstilePass();
    const env = stubEnv();
    const request = jsonRequest('https://airlens.cloud/api/training-samples', {
      ...validTrainingSampleBody(),
      sky_crop_key: 'crops/2026/08/20/abc.jpg',
    });

    // Act
    const response = await handleRequest(request, env);
    const body = (await response.json()) as Record<string, unknown>;

    // Assert
    expect(response.status).toBe(400);
    expect(body.error).toBe('validation');
    expect(body.field).toBe('sky_crop_key');
  });

  it('returns 403 when Turnstile verification fails', async () => {
    // Arrange
    stubTurnstileFail();
    const env = stubEnv();
    const request = jsonRequest('https://airlens.cloud/api/training-samples', validTrainingSampleBody());

    // Act
    const response = await handleRequest(request, env);
    const body = (await response.json()) as Record<string, unknown>;

    // Assert
    expect(response.status).toBe(403);
    expect(body.error).toBe('turnstile_failed');
  });

  it('returns 429 with Retry-After once the per-IP rate limit is exceeded', async () => {
    // Arrange
    stubTurnstilePass();
    const env = stubEnv({ RL_KV: mockKv(), OBS_RATE_PER_MIN: '1' });
    const makeRequest = () => jsonRequest('https://airlens.cloud/api/training-samples', validTrainingSampleBody());

    // Act
    await handleRequest(makeRequest(), env);
    const second = await handleRequest(makeRequest(), env);
    const body = (await second.json()) as Record<string, unknown>;

    // Assert
    expect(second.status).toBe(429);
    expect(body.error).toBe('rate_limited');
    expect(second.headers.get('Retry-After')).not.toBeNull();
  });

  it('returns 500 db_error when the D1 insert throws', async () => {
    // Arrange
    stubTurnstilePass();
    const failingD1 = stubD1(async () => {
      throw new Error('insert failed');
    });
    const env = stubEnv({ airlens_db: failingD1 });
    const request = jsonRequest('https://airlens.cloud/api/training-samples', validTrainingSampleBody());

    // Act
    const response = await handleRequest(request, env);
    const body = (await response.json()) as Record<string, unknown>;

    // Assert
    expect(response.status).toBe(500);
    expect(body.error).toBe('db_error');
  });
});

describe('handleRequest — /api/admin/* gate', () => {
  // The shared stubD1() above only implements .bind().run() (what the
  // submission handlers need); the admin handlers also call .all() (list)
  // and .first() (moderate's 404/409 lookup), so this block uses its own
  // richer D1 stub rather than widening the shared one for every other test.
  function adminStubD1(): D1Database {
    return {
      prepare: () => ({
        bind: (..._args: unknown[]) => ({
          all: async () => ({ results: [] }),
          first: async () => null,
          run: async () => ({ meta: { changes: 1 } }),
        }),
      }),
    } as unknown as D1Database;
  }

  function accessConfiguredEnv(overrides: Partial<Env> = {}): Env {
    return stubEnv({ ACCESS_TEAM_DOMAIN: 'test-team', ACCESS_AUD: 'test-aud', airlens_db: adminStubD1(), ...overrides });
  }

  it('returns 503 access_not_configured before touching auth when Access env is unset', async () => {
    // Arrange
    const env = stubEnv(); // no ACCESS_TEAM_DOMAIN/ACCESS_AUD
    const request = new Request('https://airlens.cloud/api/admin/observations');

    // Act
    const response = await handleRequest(request, env);
    const body = (await response.json()) as Record<string, unknown>;

    // Assert
    expect(response.status).toBe(503);
    expect(body.error).toBe('access_not_configured');
  });

  it('returns 401 when the Access header is missing (env configured)', async () => {
    // Arrange
    const env = accessConfiguredEnv();
    const request = new Request('https://airlens.cloud/api/admin/observations');

    // Act
    const response = await handleRequest(request, env);

    // Assert
    expect(response.status).toBe(401);
  });

  it('routes GET /api/admin/observations to the list handler once authenticated', async () => {
    // Arrange
    const env = accessConfiguredEnv();
    const request = new Request('https://airlens.cloud/api/admin/observations', {
      headers: { 'Cf-Access-Jwt-Assertion': VALID_ACCESS_TOKEN },
    });

    // Act
    const response = await handleRequest(request, env);
    const body = (await response.json()) as { observations: unknown[] };

    // Assert
    expect(response.status).toBe(200);
    expect(body.observations).toEqual([]);
    // S5 — every /api/admin/* response, success or error, is never cacheable.
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('routes POST /api/admin/observations/moderate to the moderation handler once authenticated', async () => {
    // Arrange — same-origin POST: Origin present + Content-Type: application/json
    // clears the S2 CSRF gate (see the dedicated describe block below for its cases).
    const env = accessConfiguredEnv();
    const request = new Request('https://airlens.cloud/api/admin/observations/moderate', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'Cf-Access-Jwt-Assertion': VALID_ACCESS_TOKEN,
        Origin: 'https://airlens.cloud',
      },
      body: JSON.stringify({ observation_id: '11111111-1111-1111-1111-111111111111', new_status: 'approved' }),
    });

    // Act
    const response = await handleRequest(request, env);
    const body = (await response.json()) as Record<string, unknown>;

    // Assert
    expect(response.status).toBe(200);
    expect(body.actor).toBe('admin@airlens.cloud');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('returns 404 for an unsupported method on an admin path', async () => {
    // Arrange — Origin + JSON content-type clear the CSRF gate first, so
    // this actually exercises route-dispatch's not_found fallthrough.
    const env = accessConfiguredEnv();
    const request = new Request('https://airlens.cloud/api/admin/observations', {
      method: 'DELETE',
      headers: {
        'Cf-Access-Jwt-Assertion': VALID_ACCESS_TOKEN,
        Origin: 'https://airlens.cloud',
        'content-type': 'application/json',
      },
    });

    // Act
    const response = await handleRequest(request, env);

    // Assert
    expect(response.status).toBe(404);
  });

  describe('CSRF gate on state-changing admin requests (S2)', () => {
    function moderateBody(): string {
      return JSON.stringify({ observation_id: '11111111-1111-1111-1111-111111111111', new_status: 'approved' });
    }

    it('returns 403 cross_site_forbidden when Sec-Fetch-Site is not same-origin', async () => {
      // Arrange
      const env = accessConfiguredEnv();
      const request = new Request('https://airlens.cloud/api/admin/observations/moderate', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'Cf-Access-Jwt-Assertion': VALID_ACCESS_TOKEN,
          Origin: 'https://airlens.cloud',
          'Sec-Fetch-Site': 'cross-site',
        },
        body: moderateBody(),
      });

      // Act
      const response = await handleRequest(request, env);
      const body = (await response.json()) as { error: string };

      // Assert
      expect(response.status).toBe(403);
      expect(body.error).toBe('cross_site_forbidden');
    });

    it('returns 403 origin_required when a state-changing request has no Origin header', async () => {
      // Arrange
      const env = accessConfiguredEnv();
      const request = new Request('https://airlens.cloud/api/admin/observations/moderate', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Cf-Access-Jwt-Assertion': VALID_ACCESS_TOKEN },
        body: moderateBody(),
      });

      // Act
      const response = await handleRequest(request, env);
      const body = (await response.json()) as { error: string };

      // Assert
      expect(response.status).toBe(403);
      expect(body.error).toBe('origin_required');
    });

    it('returns 415 unsupported_media_type for a non-JSON Content-Type', async () => {
      // Arrange
      const env = accessConfiguredEnv();
      const request = new Request('https://airlens.cloud/api/admin/observations/moderate', {
        method: 'POST',
        headers: {
          'content-type': 'text/plain',
          'Cf-Access-Jwt-Assertion': VALID_ACCESS_TOKEN,
          Origin: 'https://airlens.cloud',
        },
        body: moderateBody(),
      });

      // Act
      const response = await handleRequest(request, env);
      const body = (await response.json()) as { error: string };

      // Assert
      expect(response.status).toBe(415);
      expect(body.error).toBe('unsupported_media_type');
    });

    it('does not apply the CSRF gate to the GET list route', async () => {
      // Arrange — no Origin/Sec-Fetch-Site/Content-Type at all; GET is exempt.
      const env = accessConfiguredEnv();
      const request = new Request('https://airlens.cloud/api/admin/observations', {
        headers: { 'Cf-Access-Jwt-Assertion': VALID_ACCESS_TOKEN },
      });

      // Act
      const response = await handleRequest(request, env);

      // Assert
      expect(response.status).toBe(200);
    });
  });

  it('returns 403 origin_forbidden for a disallowed browser Origin on an admin route', async () => {
    // Arrange
    const env = accessConfiguredEnv();
    const request = new Request('https://airlens.cloud/api/admin/observations', {
      headers: { 'Cf-Access-Jwt-Assertion': VALID_ACCESS_TOKEN, Origin: 'https://evil.example' },
    });

    // Act
    const response = await handleRequest(request, env);
    const body = (await response.json()) as { error: string };

    // Assert
    expect(response.status).toBe(403);
    expect(body.error).toBe('origin_forbidden');
  });

  it('returns 204 with CORS headers on OPTIONS for an admin route from an allowed origin', async () => {
    // Arrange
    const env = accessConfiguredEnv();
    const request = new Request('https://airlens.cloud/api/admin/observations/moderate', {
      method: 'OPTIONS',
      headers: { Origin: 'https://airlens.cloud' },
    });

    // Act
    const response = await handleRequest(request, env);

    // Assert
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://airlens.cloud');
  });
});
