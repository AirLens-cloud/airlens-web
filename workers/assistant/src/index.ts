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
import { checkGuardrails } from './guardrails';

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

  // Session issuance is anonymous and free, and every session carries its own
  // DAILY_MESSAGE_LIMIT allowance — so an unmetered mint endpoint multiplies
  // the daily cap by however many sessions a script cares to request. The
  // per-caller identifier (session.ts resolveIdentifier) closes the budget
  // side of that; this closes the minting side. Native binding, not the KV
  // counter in quota.ts: this one is atomic, so it cannot be raced, and it
  // runs BEFORE verifyTurnstile so a flood cannot drive siteverify calls
  // either. Fails open when unbound (dev/test) — same convention as CHAT_QUOTA.
  const sessionRateLimitBlocked = await isRateLimited(env, `session:${ip || 'unknown'}`);
  if (sessionRateLimitBlocked) {
    return errorJson('Too many session requests. Please wait a moment.', 429, 'rate_limited', corsHeaders, 60);
  }

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

  // Per-message length is capped below, but without a cap on HOW MANY
  // messages a request may carry, a client can send hundreds of short ones
  // and still blow past what REQUEST_COST_ESTIMATE assumes a turn costs —
  // the budget ledger (quota.ts checkGlobalBudget) would then under-count
  // real spend. prompts.ts buildMessages already trims history to the last
  // MAX_HISTORY_TURNS*2 entries, so anything beyond that ceiling is payload
  // the model never sees: reject it explicitly rather than truncate
  // silently. The frontend trims to the same ceiling before sending
  // (src/api/assistant.ts), so a real conversation never reaches this.
  const maxTurns = parseInt(env.MAX_HISTORY_TURNS, 10);
  const maxMessages = (Number.isFinite(maxTurns) && maxTurns > 0 ? maxTurns : 10) * 2;
  if (history.length + 1 > maxMessages) {
    return errorJson(`Too many messages (max ${maxMessages} per request)`, 400, 'invalid_body', corsHeaders);
  }

  // Length cap applies to every message, not just the current turn — history
  // entries feed straight into the gemma prompt (prompts.ts buildMessages)
  // just as much as lastUserMessage does, so a client that stuffed one giant
  // message into history while keeping the current turn short would bypass
  // a check that only looked at lastUserMessage (denial-of-wallet vector).
  const maxLen = parseInt(env.MAX_MESSAGE_LENGTH, 10);
  if (Number.isFinite(maxLen) && maxLen > 0) {
    const tooLong = lastUserMessage.length > maxLen || history.some((m) => m.content.length > maxLen);
    if (tooLong) {
      return errorJson(`Message too long (max ${maxLen} characters)`, 400, 'invalid_body', corsHeaders);
    }
  }

  const ip = getClientIp(req);
  const identifier = await resolveIdentifier(env, payload.sid, ip);

  const rateLimit = await checkRateLimit(env, identifier);
  if (!rateLimit.allowed) {
    return errorJson('Too many requests. Please wait a moment.', 429, 'rate_limited', corsHeaders, rateLimit.retryAfterSeconds);
  }

  const dailyQuota = await checkDailyQuota(env, identifier);
  if (!dailyQuota.allowed) {
    return errorJson('Daily chat limit reached. Try again tomorrow.', 429, 'quota_exceeded', corsHeaders, dailyQuota.retryAfterSeconds);
  }

  // Domain gating (guardrails.ts checkGuardrails, ported from the retired
  // chatbot worker — design §1 D-1) runs on the current turn only, AFTER
  // the quota guards above (same order as the retired worker's index.ts) —
  // a request that would be rejected here still counted against the
  // caller's rate/daily budget, matching that precedent rather than giving
  // an unlimited-retry probe surface. A block is a plain JSON response, not
  // an SSE stream — no RAG/generation ever starts for it.
  const guardrail = checkGuardrails(lastUserMessage);
  if (!guardrail.passed) {
    console.warn('[assistant] guardrail blocked:', guardrail.reason);
    return errorJson(guardrail.fallback_message ?? 'Request blocked', 400, 'blocked', corsHeaders);
  }

  let stream: ReadableStream<Uint8Array>;
  try {
    // Global budget exhaustion degrades the response (reported via the
    // `done` event's `budget` field) rather than rejecting the request
    // outright — the retired chatbot worker's same policy. Degraded now
    // means "RAG lookup only, no gemma call" (buildDegradedStream) instead
    // of C1's plain echo, since a real generation is the actual cost this
    // guard protects.
    const budget = await checkGlobalBudget(env);
    stream = budget.allowed
      ? await buildRagStream(env, lastUserMessage, history, 'ok', body.page)
      : await buildDegradedStream(env, lastUserMessage, body.page);
  } catch (err) {
    // buildRagStream awaits env.AI.run(CHAT_MODEL, ...) before it ever
    // returns a stream — a Workers AI outage/error (quota, model down)
    // throws here, before any bytes reach the client, so a clean 500 is
    // still possible (unlike a mid-stream failure, which chat-stream.ts's
    // own try/catch already degrades gracefully into a `done` event).
    console.error('[assistant] chat stream setup failed:', err instanceof Error ? err.message : err);
    return errorJson('Chat service unavailable', 500, undefined, corsHeaders);
  }

  const headers = new Headers({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    ...corsHeaders,
  });
  return new Response(stream, { status: 200, headers });
}

const VALID_MESSAGE_ROLES = new Set(['user', 'assistant']);

/**
 * Splits the wire array into the last user-role message (the turn to
 * answer) and everything else in order (the conversation history passed to
 * prompts.ts buildMessages). Returns null when no user turn is present OR
 * when any entry fails validation — every entry's `role` must be in
 * VALID_MESSAGE_ROLES and `content` must be a string. Without this, a
 * client could forge `{role: "system", content: "..."}` (or any other
 * string) into `messages`; it would flow straight through into the
 * `history` array `buildMessages` folds into the chat call, and Workers
 * AI's chat schema accepts an arbitrary `role` string per message — so an
 * unvalidated entry is a second, attacker-controlled system prompt.
 *
 * The client is expected to send `history + [current user message]` —
 * pulling the message back out here (rather than trusting a separate field)
 * keeps the wire contract to the one `messages` array design §2 defines.
 */
function splitLastUserMessage(messages: unknown): { lastUserMessage: string; history: ChatMessageWire[] } | null {
  if (!Array.isArray(messages)) return null;
  for (const entry of messages) {
    const m = entry as Partial<ChatMessageWire> | undefined;
    if (!m || typeof m.role !== 'string' || !VALID_MESSAGE_ROLES.has(m.role) || typeof m.content !== 'string') {
      return null;
    }
  }
  const typed = messages as ChatMessageWire[];
  for (let i = typed.length - 1; i >= 0; i -= 1) {
    if (typed[i].role === 'user' && typed[i].content.length > 0) {
      const history = typed.filter((_, idx) => idx !== i);
      return { lastUserMessage: typed[i].content, history };
    }
  }
  return null;
}

/** Hard ceilings on one reindex request — an operator-triggered corpus of
 *  ~60 real chunks (scripts/build-corpus.mjs) sits nowhere near either
 *  limit; both exist to bound the blast radius of a compromised or
 *  misconfigured caller (embedding-cost abuse, oversized Vectorize
 *  metadata). MAX_CHUNK_TEXT_CHARS is well under bge-m3's own input-token
 *  ceiling so `text` is never silently truncated by the model. */
const MAX_CHUNKS_PER_REQUEST = 500;
const MAX_CHUNK_TEXT_CHARS = 4000;
const VALID_CHUNK_CATEGORIES = new Set(['methodology', 'faq', 'glossary', 'about', 'legal', 'static']);

/** Same resolve-and-compare-origin technique as the retired chatbot
 *  worker's grounding.ts citationUrl() (and this repo's CitationCard.tsx
 *  isSafeCitationHref, which trusts this function to have already run) —
 *  a prefix test like `startsWith('/') && !startsWith('//')` still lets
 *  `/\evil.com/pwn` through, since browsers fold `\` into `/` before
 *  resolving. Only http/https absolute or same-origin relative paths pass;
 *  everything else (`javascript:`, `data:`, protocol-relative `//...`) is
 *  rejected outright — a chunk's source_url becomes an `<a href>` in
 *  CitationCard, so this is the reindex-time half of that XSS boundary. */
const SOURCE_URL_RESOLVE_BASE = 'https://reindex-source-url-resolve.invalid';

function isValidSourceUrl(url: string): boolean {
  const trimmed = url.trim();
  if (trimmed === '') return false;
  if (trimmed.startsWith('/')) {
    try {
      const resolved = new URL(trimmed, SOURCE_URL_RESOLVE_BASE);
      return resolved.origin === SOURCE_URL_RESOLVE_BASE;
    } catch {
      return false;
    }
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Full per-chunk schema + content validation. A chunk failing any of these
 *  would otherwise reach reindexChunks (rag.ts) and either error opaquely
 *  (bge-m3 rejecting a malformed `text`) or, worse, succeed with a value
 *  that later reaches an LLM prompt or an `<a href>` unchecked. */
function isValidChunk(chunk: unknown): chunk is { id: string; text: string; source_title: string; source_url: string; category: string } {
  if (!chunk || typeof chunk !== 'object') return false;
  const c = chunk as Record<string, unknown>;
  return (
    typeof c.id === 'string' &&
    c.id.length > 0 &&
    typeof c.text === 'string' &&
    c.text.length > 0 &&
    c.text.length <= MAX_CHUNK_TEXT_CHARS &&
    typeof c.source_title === 'string' &&
    c.source_title.length > 0 &&
    typeof c.source_url === 'string' &&
    isValidSourceUrl(c.source_url) &&
    typeof c.category === 'string' &&
    VALID_CHUNK_CATEGORIES.has(c.category)
  );
}

async function handleReindex(req: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  // Fails CLOSED, unlike the user-facing guards above — an unauthenticated
  // reindex is a corpus-poisoning vector (an attacker's text becomes the
  // model's "retrieved evidence"), not merely an availability tradeoff. An
  // unset secret is folded into the same 401 as a wrong one (rather than a
  // distinguishable 503) so an unauthenticated caller can't probe whether
  // this endpoint has been provisioned yet.
  // Throttled BEFORE the comparison below: ADMIN_REINDEX_SECRET is the
  // corpus-poisoning key (an attacker's text becomes the model's "retrieved
  // evidence"), and an unthrottled endpoint is an unlimited guessing oracle —
  // timing-safe comparison only removes the timing side channel, not the
  // guessing rate. A real operator reindex is a handful of calls, so a
  // per-minute cap costs legitimate use nothing.
  if (await isRateLimited(env, `reindex:${getClientIp(req) || 'unknown'}`)) {
    return errorJson('Too many requests. Please wait a moment.', 429, 'rate_limited', corsHeaders, 60);
  }

  const provided = req.headers.get('x-admin-secret');
  const configured = env.ADMIN_REINDEX_SECRET;
  if (!configured || !provided || !timingSafeEqual(provided, configured)) {
    console.warn('[assistant] reindex auth failed:', configured ? 'bad or missing x-admin-secret' : 'ADMIN_REINDEX_SECRET not configured');
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
  if (body.chunks.length > MAX_CHUNKS_PER_REQUEST) {
    return errorJson(`chunks exceeds the ${MAX_CHUNKS_PER_REQUEST}-per-request limit`, 400, 'invalid_body', corsHeaders);
  }
  if (!body.chunks.every(isValidChunk)) {
    return errorJson(
      `every chunk needs a non-empty id/text/source_title, source_url must be http(s) or a same-origin path, text must be ≤${MAX_CHUNK_TEXT_CHARS} chars, and category must be one of ${[...VALID_CHUNK_CATEGORIES].join('/')}`,
      400,
      'invalid_body',
      corsHeaders,
    );
  }

  try {
    const result = await reindexChunks(env, body.chunks);
    return jsonResponse(result satisfies ReindexResponseBody as unknown as Record<string, unknown>, 200, corsHeaders);
  } catch (err) {
    console.error('[assistant] reindex failed:', err instanceof Error ? err.message : err);
    return errorJson('Reindex failed', 500, undefined, corsHeaders);
  }
}

/**
 * Native Rate Limiting binding check (wrangler.toml [[ratelimits]]). Returns
 * true when the caller is over the limit. Fails OPEN on an absent binding
 * (dev/test) and on a thrown call — an availability blip in the limiter must
 * not take chat down, same policy as quota.ts's KV guards. The raw IP is fine
 * in `key`: this counter is in-memory and edge-local (never persisted, never
 * enumerable), unlike the KV quota keys, which is why those are hashed.
 */
async function isRateLimited(env: Env, key: string): Promise<boolean> {
  const limiter = env.SESSION_RATE_LIMIT;
  if (!limiter) return false;
  try {
    const { success } = await limiter.limit({ key });
    return !success;
  } catch (err) {
    console.warn('[assistant] rate limiter unavailable, failing open:', err instanceof Error ? err.message : err);
    return false;
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
