import type {
  ChatErrorBody,
  ChatErrorCode,
  ChatMessageWire,
  ChatRequestBody,
  Env,
  ReindexRequestBody,
  ReindexResponseBody,
  SessionRequestBody,
} from './types';
import { buildCorsHeaders, getAllowedOrigins, getClientIp } from './cors';
import { issueSessionToken, resolveIdentifier, verifySessionToken, verifyTurnstile } from './session';
import { checkDailyQuota, checkGlobalBudget, checkRateLimit } from './quota';
import { buildDegradedStream, buildRagStream } from './chat-stream';
import { reindexChunks } from './rag';

export default {
  async fetch(req: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const origin = req.headers.get('Origin') ?? '';
    const allowed = getAllowedOrigins(env);

    // A same-origin/non-browser request (curl, health probes) carries no
    // Origin header — allow it through. A browser request from an
    // unlisted origin is rejected before it can reach any handler.
    if (origin && !allowed.includes(origin)) {
      return errorJson('Origin not allowed', 403, 'origin_denied', buildCorsHeaders(env, origin));
    }
    const corsHeaders = buildCorsHeaders(env, origin);

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(req.url);

    if (url.pathname === '/api/chat/health' && req.method === 'GET') {
      return jsonResponse({ status: 'ok', mode: 'rag' }, 200, corsHeaders);
    }

    if (url.pathname === '/api/session' && req.method === 'POST') {
      return handleSession(req, env, corsHeaders);
    }

    if (url.pathname === '/api/chat' && req.method === 'POST') {
      return handleChat(req, env, corsHeaders);
    }

    if (url.pathname === '/api/admin/reindex' && req.method === 'POST') {
      return handleReindex(req, env, corsHeaders);
    }

    return errorJson('Not Found', 404, undefined, corsHeaders);
  },
};

async function handleSession(req: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  let body: SessionRequestBody = {};
  try {
    // An empty body is valid (dev-bypass path never reads turnstileToken).
    const raw = await req.text();
    if (raw) body = JSON.parse(raw) as SessionRequestBody;
  } catch {
    return errorJson('Invalid JSON body', 400, 'invalid_body', corsHeaders);
  }

  const ip = getClientIp(req);
  const turnstile = await verifyTurnstile(env, body.turnstileToken, ip);
  if (!turnstile.ok) {
    return errorJson('Turnstile verification failed', 401, 'turnstile_failed', corsHeaders);
  }

  const ttl = parseInt(env.SESSION_TTL_SECONDS, 10);
  try {
    const { token, payload } = await issueSessionToken(env, Number.isFinite(ttl) && ttl > 0 ? ttl : 3600);
    return jsonResponse(
      { session: token, expiresAt: payload.exp * 1000, devBypass: turnstile.devBypass },
      200,
      corsHeaders,
    );
  } catch (err) {
    console.error('[assistant] session issuance failed:', err instanceof Error ? err.message : err);
    return errorJson('Session service unavailable', 500, undefined, corsHeaders);
  }
}

async function handleChat(req: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  let body: ChatRequestBody;
  try {
    body = (await req.json()) as ChatRequestBody;
  } catch {
    return errorJson('Invalid JSON body', 400, 'invalid_body', corsHeaders);
  }

  if (!body.session || typeof body.session !== 'string') {
    return errorJson('Missing session', 401, 'turnstile_failed', corsHeaders);
  }
  const payload = await verifySessionToken(env, body.session);
  if (!payload) {
    return errorJson('Invalid or expired session — call POST /api/session again', 401, 'turnstile_failed', corsHeaders);
  }

  const split = splitLastUserMessage(body.messages);
  if (split === null) {
    return errorJson('messages must include at least one user turn', 400, 'invalid_body', corsHeaders);
  }
  const { lastUserMessage, history } = split;

  const maxLen = parseInt(env.MAX_MESSAGE_LENGTH, 10);
  if (Number.isFinite(maxLen) && maxLen > 0 && lastUserMessage.length > maxLen) {
    return errorJson(`Message too long (max ${maxLen} characters)`, 400, 'invalid_body', corsHeaders);
  }

  const ip = getClientIp(req);
  const identifier = await resolveIdentifier(payload.sid, ip);

  const rateLimit = await checkRateLimit(env, identifier);
  if (!rateLimit.allowed) {
    return errorJson('Too many requests. Please wait a moment.', 429, 'rate_limited', corsHeaders, rateLimit.retryAfterSeconds);
  }

  const dailyQuota = await checkDailyQuota(env, identifier);
  if (!dailyQuota.allowed) {
    return errorJson('Daily chat limit reached. Try again tomorrow.', 429, 'quota_exceeded', corsHeaders, dailyQuota.retryAfterSeconds);
  }

  // Global budget exhaustion degrades the response (reported via the `done`
  // event's `budget` field) rather than rejecting the request outright — the
  // retired chatbot worker's same policy. Degraded now means "RAG lookup
  // only, no gemma call" (buildDegradedStream) instead of C1's plain echo,
  // since a real generation is the actual cost this guard protects.
  const budget = await checkGlobalBudget(env);
  const stream = budget.allowed
    ? await buildRagStream(env, lastUserMessage, history, 'ok')
    : await buildDegradedStream(env, lastUserMessage);

  const headers = new Headers({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    ...corsHeaders,
  });
  return new Response(stream, { status: 200, headers });
}

/**
 * Splits the wire array into the last user-role message (the turn to answer)
 * and everything else in order (the conversation history passed to
 * prompts.ts buildMessages). Returns null when no user turn is present. The
 * client is expected to send `history + [current user message]` — pulling
 * the message back out here (rather than trusting a separate field) keeps
 * the wire contract to the one `messages` array design §2 defines.
 */
function splitLastUserMessage(messages: unknown): { lastUserMessage: string; history: ChatMessageWire[] } | null {
  if (!Array.isArray(messages)) return null;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i] as Partial<ChatMessageWire> | undefined;
    if (m && m.role === 'user' && typeof m.content === 'string' && m.content.length > 0) {
      const history = (messages as ChatMessageWire[]).filter((_, idx) => idx !== i);
      return { lastUserMessage: m.content, history };
    }
  }
  return null;
}

async function handleReindex(req: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  // Fails CLOSED, unlike the user-facing guards above — an unauthenticated
  // reindex is a corpus-poisoning vector (an attacker's text becomes the
  // model's "retrieved evidence"), not merely an availability tradeoff.
  if (!env.ADMIN_REINDEX_SECRET) {
    return errorJson('Reindex endpoint is not configured', 503, undefined, corsHeaders);
  }
  const provided = req.headers.get('x-admin-secret');
  if (!provided || !timingSafeEqual(provided, env.ADMIN_REINDEX_SECRET)) {
    return errorJson('Unauthorized', 401, undefined, corsHeaders);
  }

  let body: ReindexRequestBody;
  try {
    body = (await req.json()) as ReindexRequestBody;
  } catch {
    return errorJson('Invalid JSON body', 400, 'invalid_body', corsHeaders);
  }
  if (!Array.isArray(body.chunks) || body.chunks.length === 0) {
    return errorJson('chunks must be a non-empty array', 400, 'invalid_body', corsHeaders);
  }

  try {
    const result = await reindexChunks(env, body.chunks);
    return jsonResponse(result satisfies ReindexResponseBody as unknown as Record<string, unknown>, 200, corsHeaders);
  } catch (err) {
    console.error('[assistant] reindex failed:', err instanceof Error ? err.message : err);
    return errorJson('Reindex failed', 500, undefined, corsHeaders);
  }
}

/** Constant-time-per-byte comparison for the admin secret — a naive `===`
 *  short-circuits on the first mismatching byte, leaking timing information
 *  proportional to the matching prefix length. The length check up front is
 *  a single O(1) comparison (negligible signal); every byte after that is
 *  compared without short-circuiting via bitwise OR-of-XOR. */
function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  return timingSafeEqualBytes(encoder.encode(a), encoder.encode(b));
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
} as const;

function jsonResponse(body: Record<string, unknown>, status: number, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...SECURITY_HEADERS, ...corsHeaders },
  });
}

function errorJson(
  error: string,
  status: number,
  code: ChatErrorCode | undefined,
  corsHeaders: Record<string, string>,
  retryAfterSeconds?: number,
): Response {
  const body: ChatErrorBody = { error };
  if (code) body.code = code;
  if (typeof retryAfterSeconds === 'number') body.retry_after = retryAfterSeconds;
  const headers: Record<string, string> = { ...corsHeaders };
  if (typeof retryAfterSeconds === 'number') headers['Retry-After'] = String(retryAfterSeconds);
  return jsonResponse(body as unknown as Record<string, unknown>, status, headers);
}
