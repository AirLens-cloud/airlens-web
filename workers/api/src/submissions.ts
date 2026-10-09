import type { Env } from './index';
import { checkSubmissionRateLimit, type RateLimitKind } from './ratelimit';
import { submitterHash } from './submitter';
import { sanitizeTurnstileErrorCodes, verifyTurnstile } from './turnstile';
import { parseObservation, parseTrainingSample } from './validate';

// Normal payloads top out around ~11KB (training-sample weather/aqi/sensory_tags
// caps in validate.ts sum to well under this) — 16KB leaves headroom without
// letting an oversized body reach JSON.parse.
const MAX_BODY_BYTES = 16_384;

function jsonError(status: number, body: Record<string, unknown>, headers?: HeadersInit): Response {
  return Response.json(body, { status, headers });
}

/**
 * Rejects the request before it is parsed if Content-Length is missing,
 * non-finite, or over the cap. A missing header is rejected too, not just
 * an oversized one — a client that can omit Content-Length can also lie
 * about it, so "trust the header only when it's small" isn't a real check;
 * requiring a valid, in-range header is.
 */
function checkBodySize(request: Request): Response | null {
  const raw = request.headers.get('Content-Length');
  const size = raw === null ? NaN : Number(raw);
  if (!Number.isFinite(size) || size > MAX_BODY_BYTES) {
    return jsonError(413, { error: 'payload_too_large' });
  }
  return null;
}

async function parseJsonBody(request: Request): Promise<{ ok: true; body: unknown } | { ok: false }> {
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return { ok: false };
  }
}

interface PreflightSuccess {
  id: string;
  created_at: string;
  hash: string;
}

/**
 * Shared work between both submission handlers, after body validation:
 * resolve the client IP, check the per-IP rate limit, then verify the
 * Turnstile token, then derive the submitter hash and row identity.
 *
 * Rate limit before Turnstile (deliberately, and opposite of an earlier
 * draft of this file): a Turnstile failure doesn't consume the rate-limit
 * budget, so a flood of forged tokens would otherwise never trip the
 * limiter while still hammering the external siteverify call on every
 * request — and since verifyTurnstile fails CLOSED, a siteverify outage or
 * account-level throttle under that flood would turn into a self-inflicted
 * 403 storm for legitimate users. Checking the rate limit first bounds the
 * siteverify call volume per IP regardless of token validity.
 */
async function runSubmissionPreflight(
  request: Request,
  env: Env,
  turnstileToken: string,
  kind: RateLimitKind,
): Promise<{ ok: true; result: PreflightSuccess } | { ok: false; response: Response }> {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const userAgent = request.headers.get('User-Agent') ?? '';

  // Production traffic always arrives via Cloudflare, which always sets
  // this header — a missing value means the request didn't come through
  // the expected path, so reject rather than rate-limiting/hashing under a
  // shared 'unknown' bucket.
  if (ip === 'unknown') {
    return { ok: false, response: jsonError(400, { error: 'client_ip_unavailable' }) };
  }

  const rateLimit = await checkSubmissionRateLimit(env, ip, kind);
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

  const turnstile = await verifyTurnstile(env.TURNSTILE_SECRET_KEY, turnstileToken, ip);
  if (!turnstile.success) {
    return {
      ok: false,
      response: jsonError(403, {
        error: 'turnstile_failed',
        codes: sanitizeTurnstileErrorCodes(turnstile.errorCodes),
      }),
    };
  }

  const now = new Date();
  const hash = await submitterHash(env.SUBMITTER_HASH_SECRET, ip, userAgent, now);
  return { ok: true, result: { id: crypto.randomUUID(), created_at: now.toISOString(), hash } };
}

export async function handleObservationSubmit(request: Request, env: Env): Promise<Response> {
  const sizeError = checkBodySize(request);
  if (sizeError) {
    return sizeError;
  }

  const parsedBody = await parseJsonBody(request);
  if (!parsedBody.ok) {
    return jsonError(400, { error: 'invalid_json' });
  }

  const parsed = parseObservation(parsedBody.body);
  if (!parsed.ok) {
    return jsonError(400, { error: 'validation', field: parsed.field });
  }

  const preflight = await runSubmissionPreflight(request, env, parsed.data.turnstile_token, 'obs');
  if (!preflight.ok) {
    return preflight.response;
  }
  const { id, created_at, hash } = preflight.result;

  try {
    await env.airlens_db
      .prepare(
        `INSERT INTO community_observations
           (id, created_at, latitude, longitude, pm25_estimate, sky_condition, memo, photo_key, submitter_hash, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_review')`,
      )
      .bind(
        id,
        created_at,
        parsed.data.latitude,
        parsed.data.longitude,
        parsed.data.pm25_estimate,
        parsed.data.sky_condition,
        parsed.data.memo,
        null, // photo_key — unused until Phase 2b
        hash,
      )
      .run();
  } catch (err) {
    console.error('handleObservationSubmit: D1 insert failed:', err instanceof Error ? err.message : err);
    return jsonError(500, { error: 'db_error' });
  }

  return Response.json({ id, status: 'pending_review', created_at }, { status: 201 });
}

export async function handleTrainingSampleSubmit(request: Request, env: Env): Promise<Response> {
  const sizeError = checkBodySize(request);
  if (sizeError) {
    return sizeError;
  }

  const parsedBody = await parseJsonBody(request);
  if (!parsedBody.ok) {
    return jsonError(400, { error: 'invalid_json' });
  }

  const parsed = parseTrainingSample(parsedBody.body);
  if (!parsed.ok) {
    return jsonError(400, { error: 'validation', field: parsed.field });
  }

  const preflight = await runSubmissionPreflight(request, env, parsed.data.turnstile_token, 'ts');
  if (!preflight.ok) {
    return preflight.response;
  }
  const { id, created_at, hash } = preflight.result;

  try {
    await env.airlens_db
      .prepare(
        `INSERT INTO community_training_samples
           (id, created_at, location_lat, location_lon, local_taken_at, emotion_score, weather, aqi, sensory_tags, sky_crop_key, submitter_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        created_at,
        parsed.data.location_lat,
        parsed.data.location_lon,
        parsed.data.local_taken_at,
        parsed.data.emotion_score,
        JSON.stringify(parsed.data.weather),
        JSON.stringify(parsed.data.aqi),
        JSON.stringify(parsed.data.sensory_tags),
        // sky_crop_key — hardcoded null, symmetric with photo_key above.
        // parseTrainingSample already rejects any non-null value (Phase 2b
        // R2 upload endpoint hasn't shipped), so this is never anything else.
        null,
        hash,
      )
      .run();
  } catch (err) {
    console.error('handleTrainingSampleSubmit: D1 insert failed:', err instanceof Error ? err.message : err);
    return jsonError(500, { error: 'db_error' });
  }

  return Response.json({ ok: true, sample_id: id }, { status: 201 });
}
