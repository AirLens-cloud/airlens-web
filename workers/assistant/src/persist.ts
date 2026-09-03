/**
 * persist.ts — the only code path in this worker that writes a conversation
 * anywhere (plan zazzy-herding-nautilus §2-4/§2-6).
 *
 * Shape of the pipeline: the worker sanitizes at the edge and drops one JSON
 * object into an R2 buffer; a timer on airlens-e2 pulls those objects into
 * SQLite and deletes them. The worker never opens an inbound connection to
 * that box and the box never accepts one — the transfer is pull-only.
 *
 * Three properties this module is built around:
 *
 * 1. **Off by default.** Storage stays dark until `CHATLOG_ENABLED === 'true'`.
 *    /legal/privacy has to describe the storage before the storage exists, and
 *    a flag is what lets the binding ship and be verified first.
 *
 * 2. **Failure is invisible to the user, not to us.** Every failure path here
 *    is caught: losing a log line must never turn a working answer into an
 *    error. But it is never silent either — each one emits a greppable token
 *    (Workers Logs is queryable; a prose-only warning is not).
 *
 * 3. **Nothing user-typed reaches `console`.** Redaction covers the R2 path
 *    only. `[observability]` collects every invocation, so one debugging
 *    `console.log(message)` would ship unsanitized text to a second store that
 *    has none of these rules. persist.test.ts pins this.
 */
import { redactPII, SANITIZER_VERSION } from './redact';
import { sha256Base64Url } from './session';
import type { ChatTurnRecord, Env, TurnContext, TurnOutcome } from './types';

const DEFAULT_HOURLY_MAX = 120;

/** Single source for "is storage on?", so the call site can skip the work
 *  entirely and this module can still refuse independently. */
export function chatlogEnabled(env: Env): boolean {
  return Boolean(env.CHATLOG) && env.CHATLOG_ENABLED === 'true';
}

/**
 * Stored-turns ceiling for the current UTC hour.
 *
 * Why per hour and not per day: the check is one `list` call, and a list is
 * bounded by its `limit`, so an hourly window keeps the listing small (≤ a few
 * hundred keys) where a daily one would grow to thousands. The daily ceiling
 * falls out as `max × 24`.
 *
 * What this is NOT: exact. Concurrent requests read the same count before
 * either writes, and the pull job deletes objects out from under it, which
 * lowers the count mid-hour and loosens the ceiling. It is a backstop for the
 * day the abuse guards are outrun (the native rate limiter counts per
 * Cloudflare location, so a distributed caller gets more through than the
 * per-minute number suggests) — accumulation is prevented by the pull job, not
 * by this number.
 */
async function hourIsFull(bucket: R2Bucket, prefix: string, max: number): Promise<boolean> {
  try {
    const listed = await bucket.list({ prefix, limit: max });
    return listed.objects.length >= max;
  } catch (err) {
    // The ceiling protects the bucket, not the chat. If the check itself is
    // broken, write anyway — R2's own free tier is three orders of magnitude
    // above expected volume, so the failure mode of writing is far cheaper
    // than the failure mode of silently logging nothing.
    console.warn(
      'ASSISTANT_CHATLOG_CAP_CHECK_FAILED [assistant] could not count this hour, writing anyway:',
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}

/**
 * Sanitize one turn and buffer it for pickup. Resolves (never rejects) in
 * every case, so it is safe to hand straight to `ctx.waitUntil`.
 */
export async function persistTurn(env: Env, context: TurnContext, outcome: TurnOutcome): Promise<void> {
  const bucket = env.CHATLOG;
  if (!bucket || !chatlogEnabled(env)) return;

  try {
    const now = new Date();
    const day = now.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
    const hour = now.toISOString().slice(11, 13); // HH (UTC)
    const prefix = `turn/${day}/${hour}/`;

    const parsedMax = parseInt(env.CHATLOG_HOURLY_MAX ?? '', 10);
    const hourlyMax = Number.isFinite(parsedMax) && parsedMax > 0 ? parsedMax : DEFAULT_HOURLY_MAX;
    if (await hourIsFull(bucket, prefix, hourlyMax)) {
      console.warn(`ASSISTANT_CHATLOG_HOURLY_CAP [assistant] ${hourlyMax}/hour reached — turn not stored`);
      return;
    }

    const question = redactPII(context.question);
    const answer = outcome.answer ? redactPII(outcome.answer) : null;

    // A question that was refused as off-topic AND carried personal data has
    // no analytical value that would justify keeping its text — the label
    // alone answers "what is being refused". Sanitized text of every other
    // refusal is kept: that is the only evidence of over-blocking.
    const dropQuestionText = context.guardrailReason === 'out_of_scope' && question.count > 0;

    const id = crypto.randomUUID();
    const record: ChatTurnRecord = {
      id,
      // One-way, and the input is itself a random UUID with no link to a
      // person — this exists to group the turns of one conversation, nothing
      // more.
      conversation_id: (await sha256Base64Url(context.sid)).slice(0, 16),
      turn_index: context.turnIndex,
      ts: now.toISOString(),
      locale: context.locale ?? null,
      page: context.page ?? null,
      question: dropQuestionText ? null : question.text,
      answer: answer ? answer.text : null,
      intent: outcome.intent,
      guardrail_reason: context.guardrailReason,
      // Titles and relevance only. The excerpt is a copy of corpus text we
      // already publish, so storing it again buys nothing and grows every row.
      citations_json:
        outcome.citations.length > 0
          ? JSON.stringify(outcome.citations.map((c) => ({ source_title: c.source_title, relevance: c.relevance })))
          : null,
      retrieval_top_score: outcome.topScore,
      finish_reason: outcome.finishReason,
      answer_chars: answer ? answer.text.length : null,
      degraded: outcome.degraded ? 1 : 0,
      // No generation happens on the degraded path, so naming a model there
      // would attribute an answer to a model that never ran.
      model: outcome.degraded ? null : (env.CHAT_MODEL ?? null),
      latency_ms: Math.max(0, now.getTime() - context.startedAtMs),
      redacted_count: question.count + (answer?.count ?? 0),
      coords_truncated: question.coordsTruncated + (answer?.coordsTruncated ?? 0),
      sanitizer_version: SANITIZER_VERSION,
      completion_status: outcome.status,
    };

    await bucket.put(`${prefix}${now.getTime()}-${id}.json`, JSON.stringify(record), {
      httpMetadata: { contentType: 'application/json' },
    });
  } catch (err) {
    // Note what failed, never what the user typed.
    console.error(
      'ASSISTANT_CHATLOG_WRITE_FAILED [assistant] turn not stored:',
      err instanceof Error ? err.message : err,
    );
  }
}
