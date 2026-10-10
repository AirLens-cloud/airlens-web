import type { Env } from './index';
import type { AccessIdentity } from './access';
import { authenticateAccessRequest } from './access';
import type { AdminRateLimitSurface } from './ratelimit';
import { checkAdminRateLimit } from './ratelimit';

const OBSERVATION_STATUSES = ['pending_review', 'approved', 'rejected'] as const;
type ObservationStatus = (typeof OBSERVATION_STATUSES)[number];

const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 100;
const MAX_REJECTION_REASON_LEN = 500;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MODERATE_OBSERVATION_KEYS = new Set(['observation_id', 'new_status', 'rejection_reason']);

/** Mirrors zod's `.strict()` — an admin decision body carrying an unrecognized key is rejected outright rather than silently ignored. */
function hasUnknownKeys(body: Record<string, unknown>, allowed: Set<string>): boolean {
  return Object.keys(body).some((key) => !allowed.has(key));
}

function jsonError(status: number, body: Record<string, unknown>, headers?: HeadersInit): Response {
  return Response.json(body, { status, headers });
}

/**
 * Shared gate for every `/api/admin/*` handler: verify the Cloudflare
 * Access JWT, then apply the per-admin rate limit keyed on the verified
 * identity's `sub`. Handlers must call this before touching D1/PostgREST —
 * an unauthenticated or rate-limited request must never reach a query.
 */
async function requireAccessAndRateLimit(
  request: Request,
  env: Env,
  surface: AdminRateLimitSurface,
): Promise<{ ok: true; identity: AccessIdentity } | { ok: false; response: Response }> {
  const auth = await authenticateAccessRequest(request, env);
  if (!auth.ok) {
    return { ok: false, response: jsonError(auth.status, { error: auth.error }) };
  }

  const rateLimit = await checkAdminRateLimit(env, auth.identity.sub, surface);
  if (!rateLimit.allowed) {
    return {
      ok: false,
      response: jsonError(
        429,
        { error: 'rate_limited', retry_after_seconds: rateLimit.retryAfterSeconds },
        { 'Retry-After': String(rateLimit.retryAfterSeconds) },
      ),
    };
  }

  return { ok: true, identity: auth.identity };
}

async function parseJsonBody(request: Request): Promise<{ ok: true; body: unknown } | { ok: false }> {
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return { ok: false };
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

interface ObservationRow {
  id: string;
  created_at: string;
  latitude: number;
  longitude: number;
  pm25_estimate: number | null;
  sky_condition: string;
  memo: string | null;
  status: string;
  moderated_at: string | null;
  rejection_reason: string | null;
}

/**
 * `GET /api/admin/observations?status=&limit=` — the queue read that the
 * Supabase original served via a `community_obs_admin_read` RLS policy.
 * Here the D1 table has no row-level security, so the Access gate above is
 * the entire authorization boundary for this read.
 */
export async function handleAdminObservationsList(request: Request, env: Env): Promise<Response> {
  const auth = await requireAccessAndRateLimit(request, env, 'obs');
  if (!auth.ok) {
    return auth.response;
  }

  const url = new URL(request.url);
  const statusParam = url.searchParams.get('status') ?? 'pending_review';
  if (!OBSERVATION_STATUSES.includes(statusParam as ObservationStatus)) {
    return jsonError(400, { error: 'validation', field: 'status' });
  }
  const status = statusParam as ObservationStatus;

  let limit = DEFAULT_LIST_LIMIT;
  const limitParam = url.searchParams.get('limit');
  if (limitParam !== null) {
    const parsedLimit = Number(limitParam);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1) {
      return jsonError(400, { error: 'validation', field: 'limit' });
    }
    limit = Math.min(parsedLimit, MAX_LIST_LIMIT);
  }

  try {
    const { results } = await env.airlens_db
      .prepare(
        `SELECT id, created_at, latitude, longitude, pm25_estimate, sky_condition, memo, status, moderated_at, rejection_reason
         FROM community_observations
         WHERE status = ?1
         ORDER BY created_at DESC
         LIMIT ?2`,
      )
      .bind(status, limit)
      .all<ObservationRow>();
    return Response.json({ observations: results ?? [] });
  } catch (err) {
    console.error('handleAdminObservationsList: D1 query failed:', err instanceof Error ? err.message : err);
    return jsonError(500, { error: 'db_error' });
  }
}

interface ModerateObservationInput {
  observation_id: string;
  new_status: 'approved' | 'rejected';
  rejection_reason: string | null;
}

/** Mirrors moderate-observation/schema.ts: reason required iff rejecting, forbidden on approve. */
function parseModerateObservationBody(
  body: unknown,
): { ok: true; data: ModerateObservationInput } | { ok: false; field: string } {
  if (!isPlainObject(body)) {
    return { ok: false, field: 'body' };
  }
  if (hasUnknownKeys(body, MODERATE_OBSERVATION_KEYS)) {
    return { ok: false, field: 'body' };
  }

  if (typeof body.observation_id !== 'string' || !UUID_RE.test(body.observation_id)) {
    return { ok: false, field: 'observation_id' };
  }

  if (body.new_status !== 'approved' && body.new_status !== 'rejected') {
    return { ok: false, field: 'new_status' };
  }

  let rejection_reason: string | null = null;
  if (body.new_status === 'rejected') {
    if (typeof body.rejection_reason !== 'string') {
      return { ok: false, field: 'rejection_reason' };
    }
    const trimmed = body.rejection_reason.trim();
    if (trimmed.length === 0 || body.rejection_reason.length > MAX_REJECTION_REASON_LEN) {
      return { ok: false, field: 'rejection_reason' };
    }
    rejection_reason = trimmed;
  } else if (
    // Mirrors moderate-observation/schema.ts's superRefine: on approve, an
    // absent, null, OR empty-string rejection_reason all pass — only a
    // non-empty value is rejected as "must be absent when approving".
    body.rejection_reason !== undefined &&
    body.rejection_reason !== null &&
    body.rejection_reason !== ''
  ) {
    return { ok: false, field: 'rejection_reason' };
  }

  return { ok: true, data: { observation_id: body.observation_id, new_status: body.new_status, rejection_reason } };
}

/**
 * `POST /api/admin/observations/moderate` — D1 port of moderate-observation.
 * The Supabase original's `reviewed_by`/`reviewed_at` columns don't exist on
 * the D1 table (see migrations/0001_community_submissions.sql); the actor
 * identity instead lands in the `moderation_queue` audit row, keyed by the
 * verified Access email.
 *
 * `.eq/AND status='pending_review'` is the same guarded conditional UPDATE
 * as the original — a race between two admins moderating the same row
 * leaves the loser with 0 changed rows, disambiguated below into 404 (row
 * never existed) vs 409 (already moderated).
 */
export async function handleAdminObservationModerate(request: Request, env: Env): Promise<Response> {
  const auth = await requireAccessAndRateLimit(request, env, 'obs');
  if (!auth.ok) {
    return auth.response;
  }

  const parsedBody = await parseJsonBody(request);
  if (!parsedBody.ok) {
    return jsonError(400, { error: 'invalid_json' });
  }

  const parsed = parseModerateObservationBody(parsedBody.body);
  if (!parsed.ok) {
    return jsonError(400, { error: 'validation', field: parsed.field });
  }
  const { observation_id, new_status, rejection_reason } = parsed.data;
  const moderatedAt = new Date().toISOString();

  let changes = 0;
  try {
    const result = await env.airlens_db
      .prepare(
        `UPDATE community_observations
         SET status = ?1, moderated_at = ?2, rejection_reason = ?3
         WHERE id = ?4 AND status = 'pending_review'`,
      )
      .bind(new_status, moderatedAt, rejection_reason, observation_id)
      .run();
    changes = result.meta.changes ?? 0;
  } catch (err) {
    console.error('handleAdminObservationModerate: D1 update failed:', err instanceof Error ? err.message : err);
    return jsonError(500, { error: 'db_error' });
  }

  if (changes === 0) {
    let existingStatus: string | null = null;
    try {
      const existing = await env.airlens_db
        .prepare('SELECT status FROM community_observations WHERE id = ?1')
        .bind(observation_id)
        .first<{ status: string }>();
      existingStatus = existing?.status ?? null;
    } catch (err) {
      console.error('handleAdminObservationModerate: D1 lookup failed:', err instanceof Error ? err.message : err);
      return jsonError(500, { error: 'db_error' });
    }
    if (existingStatus === null) {
      return jsonError(404, { error: 'not_found' });
    }
    return jsonError(409, { error: 'already_moderated', current_status: existingStatus });
  }

  // Best-effort audit write — mirrors the Supabase original's log_event RPC:
  // the state transition already committed, so a moderation_queue failure
  // is logged, not surfaced as a 500 for an already-successful decision.
  // `audit` in the response tells the caller whether that write landed, so
  // a UI/operator can tell an under-audited decision apart from a fully
  // clean one instead of it being silently swallowed server-side.
  let audit: 'ok' | 'degraded' = 'ok';
  try {
    await env.airlens_db
      .prepare(`INSERT INTO moderation_queue (id, observation_id, action, reason, actor) VALUES (?1, ?2, ?3, ?4, ?5)`)
      .bind(crypto.randomUUID(), observation_id, new_status, rejection_reason, auth.identity.email)
      .run();
  } catch (err) {
    audit = 'degraded';
    console.error('handleAdminObservationModerate: moderation_queue insert failed:', {
      observation_id,
      actor: auth.identity.email,
      error: err instanceof Error ? err.message : err,
    });
  }

  return Response.json({
    id: observation_id,
    status: new_status,
    moderated_at: moderatedAt,
    rejection_reason,
    actor: auth.identity.email,
    audit,
  });
}
