import { afterEach, describe, expect, it, vi } from 'vitest';

import { handleAdminBlogModerate, handleAdminObservationModerate, handleAdminObservationsList } from './admin';
import type { Env } from './index';

const VALID_ACCESS_TOKEN = 'valid-token';
const OBSERVATION_ID = '11111111-1111-1111-1111-111111111111';
const POST_ID = '22222222-2222-2222-2222-222222222222';

vi.mock('./access', () => ({
  authenticateAccessRequest: vi.fn(async (request: Request) => {
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

function authedRequest(url: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  headers.set('Cf-Access-Jwt-Assertion', VALID_ACCESS_TOKEN);
  return new Request(url, { ...init, headers });
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

/**
 * Minimal D1 stub covering `.all()`, `.first()`, and `.run()` — configurable
 * per test via the `impl` overrides, since admin.ts's handlers each need a
 * different query behavior (list vs. conditional UPDATE vs. lookup).
 */
function stubD1(impl: {
  all?: () => Promise<{ results: unknown[] }>;
  first?: () => Promise<unknown>;
  run?: () => Promise<{ meta: { changes: number } }>;
} = {}): D1Database {
  return {
    prepare: () => ({
      bind: (..._args: unknown[]) => ({
        all: impl.all ?? (async () => ({ results: [] })),
        first: impl.first ?? (async () => null),
        run: impl.run ?? (async () => ({ meta: { changes: 1 } })),
      }),
    }),
  } as unknown as D1Database;
}

function stubEnv(overrides: Partial<Env> = {}): Env {
  return {
    airlens_db: stubD1(),
    TURNSTILE_SECRET_KEY: 'secret',
    SUBMITTER_HASH_SECRET: 'secret',
    ALLOWED_ORIGINS: 'https://airlens.cloud',
    OBS_RATE_PER_MIN: '3',
    OBS_RATE_PER_DAY: '20',
    ACCESS_TEAM_DOMAIN: 'test-team',
    ACCESS_AUD: 'test-aud',
    ...overrides,
  };
}

describe('handleAdminObservationsList', () => {
  it('returns 401 when the Access header is missing', async () => {
    // Arrange
    const env = stubEnv();
    const request = new Request('https://airlens.cloud/api/admin/observations');

    // Act
    const response = await handleAdminObservationsList(request, env);

    // Assert
    expect(response.status).toBe(401);
  });

  it('returns 403 when the Access token is invalid', async () => {
    // Arrange
    const env = stubEnv();
    const request = new Request('https://airlens.cloud/api/admin/observations', {
      headers: { 'Cf-Access-Jwt-Assertion': 'garbage' },
    });

    // Act
    const response = await handleAdminObservationsList(request, env);

    // Assert
    expect(response.status).toBe(403);
  });

  it('returns 200 with the pending_review default when authenticated', async () => {
    // Arrange
    const rows = [{ id: OBSERVATION_ID, status: 'pending_review' }];
    const env = stubEnv({ airlens_db: stubD1({ all: async () => ({ results: rows }) }) });
    const request = authedRequest('https://airlens.cloud/api/admin/observations');

    // Act
    const response = await handleAdminObservationsList(request, env);
    const body = (await response.json()) as { observations: unknown[] };

    // Assert
    expect(response.status).toBe(200);
    expect(body.observations).toEqual(rows);
  });

  it('rejects an out-of-allowlist status with 400', async () => {
    // Arrange
    const env = stubEnv();
    const request = authedRequest('https://airlens.cloud/api/admin/observations?status=deleted');

    // Act
    const response = await handleAdminObservationsList(request, env);
    const body = (await response.json()) as { error: string; field: string };

    // Assert
    expect(response.status).toBe(400);
    expect(body.field).toBe('status');
  });

  it('rejects a non-positive-integer limit with 400', async () => {
    // Arrange
    const env = stubEnv();
    const request = authedRequest('https://airlens.cloud/api/admin/observations?limit=0');

    // Act
    const response = await handleAdminObservationsList(request, env);

    // Assert
    expect(response.status).toBe(400);
  });

  it('clamps a limit above 100 down to the max', async () => {
    // Arrange
    let boundLimit: unknown;
    const env = stubEnv({
      airlens_db: {
        prepare: () => ({
          bind: (_status: unknown, limit: unknown) => {
            boundLimit = limit;
            return { all: async () => ({ results: [] }) };
          },
        }),
      } as unknown as Env['airlens_db'],
    });
    const request = authedRequest('https://airlens.cloud/api/admin/observations?limit=500');

    // Act
    const response = await handleAdminObservationsList(request, env);

    // Assert
    expect(response.status).toBe(200);
    expect(boundLimit).toBe(100);
  });

  it('returns 429 with Retry-After when the per-admin rate limit trips', async () => {
    // Arrange
    const kv = mockKv();
    await kv.put('rl:admin:obs:access-sub-123:' + new Date().toISOString().slice(0, 16), '60');
    const env = stubEnv({ RL_KV: kv });
    const request = authedRequest('https://airlens.cloud/api/admin/observations');

    // Act
    const response = await handleAdminObservationsList(request, env);

    // Assert
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).not.toBeNull();
  });

  it('returns 500 db_error when the D1 query throws', async () => {
    // Arrange
    const env = stubEnv({
      airlens_db: stubD1({
        all: async () => {
          throw new Error('boom');
        },
      }),
    });
    const request = authedRequest('https://airlens.cloud/api/admin/observations');

    // Act
    const response = await handleAdminObservationsList(request, env);

    // Assert
    expect(response.status).toBe(500);
  });
});

describe('handleAdminObservationModerate', () => {
  function moderateRequest(body: unknown): Request {
    return authedRequest('https://airlens.cloud/api/admin/observations/moderate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('approves a pending row and returns the actor identity', async () => {
    // Arrange
    const env = stubEnv();
    const request = moderateRequest({ observation_id: OBSERVATION_ID, new_status: 'approved' });

    // Act
    const response = await handleAdminObservationModerate(request, env);
    const body = (await response.json()) as Record<string, unknown>;

    // Assert
    expect(response.status).toBe(200);
    expect(body.id).toBe(OBSERVATION_ID);
    expect(body.status).toBe('approved');
    expect(body.rejection_reason).toBeNull();
    expect(body.actor).toBe('admin@airlens.cloud');
    expect(body.audit).toBe('ok');
  });

  it('approves with an empty-string rejection_reason (C1 — matches the Supabase original\'s superRefine, which allows null or "" on approve)', async () => {
    // Arrange
    const env = stubEnv();
    const request = moderateRequest({ observation_id: OBSERVATION_ID, new_status: 'approved', rejection_reason: '' });

    // Act
    const response = await handleAdminObservationModerate(request, env);
    const body = (await response.json()) as Record<string, unknown>;

    // Assert
    expect(response.status).toBe(200);
    expect(body.rejection_reason).toBeNull();
  });

  it('400s on a body with an unrecognized key (S7)', async () => {
    // Arrange
    const env = stubEnv();
    const request = moderateRequest({ observation_id: OBSERVATION_ID, new_status: 'approved', extra_field: 'nope' });

    // Act
    const response = await handleAdminObservationModerate(request, env);
    const body = (await response.json()) as { field: string };

    // Assert
    expect(response.status).toBe(400);
    expect(body.field).toBe('body');
  });

  it('rejects with a reason and echoes it back', async () => {
    // Arrange
    const env = stubEnv();
    const request = moderateRequest({
      observation_id: OBSERVATION_ID,
      new_status: 'rejected',
      rejection_reason: 'blurry photo',
    });

    // Act
    const response = await handleAdminObservationModerate(request, env);
    const body = (await response.json()) as Record<string, unknown>;

    // Assert
    expect(response.status).toBe(200);
    expect(body.status).toBe('rejected');
    expect(body.rejection_reason).toBe('blurry photo');
  });

  it('400s when rejecting without a rejection_reason', async () => {
    // Arrange
    const env = stubEnv();
    const request = moderateRequest({ observation_id: OBSERVATION_ID, new_status: 'rejected' });

    // Act
    const response = await handleAdminObservationModerate(request, env);
    const body = (await response.json()) as { field: string };

    // Assert
    expect(response.status).toBe(400);
    expect(body.field).toBe('rejection_reason');
  });

  it('400s when approving with a rejection_reason present', async () => {
    // Arrange
    const env = stubEnv();
    const request = moderateRequest({
      observation_id: OBSERVATION_ID,
      new_status: 'approved',
      rejection_reason: 'should not be here',
    });

    // Act
    const response = await handleAdminObservationModerate(request, env);
    const body = (await response.json()) as { field: string };

    // Assert
    expect(response.status).toBe(400);
    expect(body.field).toBe('rejection_reason');
  });

  it('400s on a non-UUID observation_id', async () => {
    // Arrange
    const env = stubEnv();
    const request = moderateRequest({ observation_id: 'not-a-uuid', new_status: 'approved' });

    // Act
    const response = await handleAdminObservationModerate(request, env);

    // Assert
    expect(response.status).toBe(400);
  });

  it('404s when the row does not exist', async () => {
    // Arrange
    const env = stubEnv({
      airlens_db: stubD1({
        run: async () => ({ meta: { changes: 0 } }),
        first: async () => null,
      }),
    });
    const request = moderateRequest({ observation_id: OBSERVATION_ID, new_status: 'approved' });

    // Act
    const response = await handleAdminObservationModerate(request, env);
    const body = (await response.json()) as { error: string };

    // Assert
    expect(response.status).toBe(404);
    expect(body.error).toBe('not_found');
  });

  it('409s when the row already left pending_review', async () => {
    // Arrange
    const env = stubEnv({
      airlens_db: stubD1({
        run: async () => ({ meta: { changes: 0 } }),
        first: async () => ({ status: 'approved' }),
      }),
    });
    const request = moderateRequest({ observation_id: OBSERVATION_ID, new_status: 'rejected', rejection_reason: 'x' });

    // Act
    const response = await handleAdminObservationModerate(request, env);
    const body = (await response.json()) as { error: string; current_status: string };

    // Assert
    expect(response.status).toBe(409);
    expect(body.error).toBe('already_moderated');
    expect(body.current_status).toBe('approved');
  });

  it('still returns 200 when the best-effort moderation_queue insert fails', async () => {
    // Arrange
    let runCalls = 0;
    const env = stubEnv({
      airlens_db: {
        prepare: () => ({
          bind: () => ({
            run: async () => {
              runCalls += 1;
              if (runCalls === 1) {
                return { meta: { changes: 1 } }; // the UPDATE succeeds
              }
              throw new Error('moderation_queue insert failed'); // the audit INSERT fails
            },
            first: async () => null,
          }),
        }),
      } as unknown as Env['airlens_db'],
    });
    const request = moderateRequest({ observation_id: OBSERVATION_ID, new_status: 'approved' });

    // Act
    const response = await handleAdminObservationModerate(request, env);
    const body = (await response.json()) as Record<string, unknown>;

    // Assert
    expect(response.status).toBe(200);
    expect(body.audit).toBe('degraded');
  });

  it('returns 500 db_error when the UPDATE throws', async () => {
    // Arrange
    const env = stubEnv({
      airlens_db: stubD1({
        run: async () => {
          throw new Error('boom');
        },
      }),
    });
    const request = moderateRequest({ observation_id: OBSERVATION_ID, new_status: 'approved' });

    // Act
    const response = await handleAdminObservationModerate(request, env);

    // Assert
    expect(response.status).toBe(500);
  });
});

describe('handleAdminBlogModerate', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function moderateRequest(body: unknown): Request {
    return authedRequest('https://airlens.cloud/api/admin/blog/moderate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('returns 503 when Supabase secrets are unset', async () => {
    // Arrange
    const env = stubEnv({ SUPABASE_URL: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined });
    const request = moderateRequest({ post_id: POST_ID, action: 'publish' });

    // Act
    const response = await handleAdminBlogModerate(request, env);
    const body = (await response.json()) as { error: string };

    // Assert
    expect(response.status).toBe(503);
    expect(body.error).toBe('blog_moderation_not_configured');
  });

  it('publishes a draft and returns the original-contract shape', async () => {
    // Arrange
    const updatedRow = { id: POST_ID, slug: 'my-post', status: 'published', published_at: '2026-08-25T00:00:00.000Z' };
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify([updatedRow]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const env = stubEnv({ SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-key' });
    const request = moderateRequest({ post_id: POST_ID, action: 'publish' });

    // Act
    const response = await handleAdminBlogModerate(request, env);
    const body = (await response.json()) as Record<string, unknown>;

    // Assert
    expect(response.status).toBe(200);
    expect(body).toEqual(updatedRow);
    // S6 — updated_at parity with the Supabase original's patch, sent on
    // every moderation (not just publish).
    const [, patchInit] = fetchMock.mock.calls[0];
    const sentPatch = JSON.parse(patchInit!.body as string) as Record<string, unknown>;
    expect(typeof sentPatch.updated_at).toBe('string');
  });

  it('400s on a body with an unrecognized key (S7)', async () => {
    // Arrange
    const env = stubEnv({ SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-key' });
    const request = moderateRequest({ post_id: POST_ID, action: 'publish', extra_field: 'nope' });

    // Act
    const response = await handleAdminBlogModerate(request, env);
    const body = (await response.json()) as { field: string };

    // Assert
    expect(response.status).toBe(400);
    expect(body.field).toBe('body');
  });

  it('returns 503 before auth/rate-limit is even checked when Supabase secrets are unset (C3)', async () => {
    // Arrange — an invalid Access token would normally 403 via the mocked
    // authenticateAccessRequest in this file's ./access mock; getting 503
    // instead proves the config check runs first.
    const env = stubEnv({ SUPABASE_URL: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined });
    const request = new Request('https://airlens.cloud/api/admin/blog/moderate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' }, // no Cf-Access-Jwt-Assertion at all
      body: JSON.stringify({ post_id: POST_ID, action: 'publish' }),
    });

    // Act
    const response = await handleAdminBlogModerate(request, env);
    const body = (await response.json()) as { error: string };

    // Assert
    expect(response.status).toBe(503);
    expect(body.error).toBe('blog_moderation_not_configured');
  });

  it('returns 429 with Retry-After when the per-admin blog rate limit trips (30/min, C2)', async () => {
    // Arrange
    const kv = mockKv();
    await kv.put('rl:admin:blog:access-sub-123:' + new Date().toISOString().slice(0, 16), '30');
    const env = stubEnv({ RL_KV: kv, SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-key' });
    const request = moderateRequest({ post_id: POST_ID, action: 'publish' });

    // Act
    const response = await handleAdminBlogModerate(request, env);

    // Assert
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).not.toBeNull();
  });

  it('does not share its rate-limit bucket with the observations surface (C2)', async () => {
    // Arrange — the observations bucket (60/min) is fully exhausted; the
    // blog bucket (separate KV key prefix) must be unaffected.
    const kv = mockKv();
    await kv.put('rl:admin:obs:access-sub-123:' + new Date().toISOString().slice(0, 16), '60');
    const updatedRow = { id: POST_ID, slug: 'my-post', status: 'published', published_at: '2026-08-25T00:00:00.000Z' };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify([updatedRow]), { status: 200 })),
    );
    const env = stubEnv({ RL_KV: kv, SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-key' });
    const request = moderateRequest({ post_id: POST_ID, action: 'publish' });

    // Act
    const response = await handleAdminBlogModerate(request, env);

    // Assert
    expect(response.status).toBe(200);
  });

  it('404s when a follow-up GET finds no row', async () => {
    // Arrange
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 })) // PATCH: 0 rows
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 })); // GET: 0 rows
    vi.stubGlobal('fetch', fetchMock);
    const env = stubEnv({ SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-key' });
    const request = moderateRequest({ post_id: POST_ID, action: 'publish' });

    // Act
    const response = await handleAdminBlogModerate(request, env);
    const body = (await response.json()) as { error: string };

    // Assert
    expect(response.status).toBe(404);
    expect(body.error).toBe('not_found');
  });

  it('409s when the follow-up GET finds a row already out of draft', async () => {
    // Arrange
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 })) // PATCH: 0 rows
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: POST_ID, status: 'published' }]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const env = stubEnv({ SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-key' });
    const request = moderateRequest({ post_id: POST_ID, action: 'reject' });

    // Act
    const response = await handleAdminBlogModerate(request, env);
    const body = (await response.json()) as { error: string; current_status: string };

    // Assert
    expect(response.status).toBe(409);
    expect(body.error).toBe('already_reviewed');
    expect(body.current_status).toBe('published');
  });

  it('400s on a non-UUID post_id', async () => {
    // Arrange
    const env = stubEnv({ SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-key' });
    const request = moderateRequest({ post_id: 'not-a-uuid', action: 'publish' });

    // Act
    const response = await handleAdminBlogModerate(request, env);

    // Assert
    expect(response.status).toBe(400);
  });

  it('400s on an invalid action', async () => {
    // Arrange
    const env = stubEnv({ SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-key' });
    const request = moderateRequest({ post_id: POST_ID, action: 'delete' });

    // Act
    const response = await handleAdminBlogModerate(request, env);

    // Assert
    expect(response.status).toBe(400);
  });

  it('returns 500 db_error when the PATCH call fails', async () => {
    // Arrange
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('boom', { status: 500 })),
    );
    const env = stubEnv({ SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-key' });
    const request = moderateRequest({ post_id: POST_ID, action: 'publish' });

    // Act
    const response = await handleAdminBlogModerate(request, env);

    // Assert
    expect(response.status).toBe(500);
  });
});
