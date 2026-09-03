import type { Env } from './types';

const RATE_LIMIT_TTL_SECONDS = 120;
// Outlives the UTC day it guards (24h) so the counter can't expire mid-day.
const DAILY_QUOTA_TTL_SECONDS = 90_000;
const BUDGET_TTL_SECONDS = 90_000;

export interface QuotaResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

function secondsToNextMinute(now: Date): number {
  return 60 - now.getSeconds();
}

function secondsToNextUtcMidnight(now: Date): number {
  const midnight = new Date(now);
  midnight.setUTCHours(24, 0, 0, 0);
  return Math.ceil((midnight.getTime() - now.getTime()) / 1000);
}

/**
 * KV-based per-minute rate limiting, keyed by an already-resolved identifier
 * (session hash or IP fallback — see session.ts resolveIdentifier).
 * Ported from the retired chatbot worker's src/quota.ts checkRateLimit.
 */
export async function checkRateLimit(env: Env, identifier: string): Promise<QuotaResult> {
  const limit = parseInt(env.RATE_LIMIT_PER_MINUTE, 10);
  if (!Number.isFinite(limit) || limit <= 0 || !env.CHAT_QUOTA) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const now = new Date();
  const minute = now.toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM
  const key = `rate:${identifier}:${minute}`;

  try {
    const raw = await env.CHAT_QUOTA.get(key);
    const count = raw ? parseInt(raw, 10) : 0;

    if (count >= limit) {
      return { allowed: false, retryAfterSeconds: secondsToNextMinute(now) };
    }

    await env.CHAT_QUOTA.put(key, String(count + 1), { expirationTtl: RATE_LIMIT_TTL_SECONDS });
    return { allowed: true, retryAfterSeconds: 0 };
  } catch {
    // A KV blip must not take chat down — fail OPEN.
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

/**
 * KV-based daily cost cap per identifier. A missing/invalid limit or an
 * absent CHAT_QUOTA binding fails OPEN (misconfig must not take chat down).
 * Ported from the retired chatbot worker's checkDailyQuota.
 */
export async function checkDailyQuota(env: Env, identifier: string): Promise<QuotaResult> {
  const limit = parseInt(env.DAILY_MESSAGE_LIMIT, 10);
  if (!Number.isFinite(limit) || limit <= 0 || !env.CHAT_QUOTA) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const now = new Date();
  const day = now.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  const key = `quota:day:${identifier}:${day}`;

  try {
    const raw = await env.CHAT_QUOTA.get(key);
    const count = raw ? parseInt(raw, 10) : 0;

    if (count >= limit) {
      return { allowed: false, retryAfterSeconds: secondsToNextUtcMidnight(now) };
    }

    await env.CHAT_QUOTA.put(key, String(count + 1), { expirationTtl: DAILY_QUOTA_TTL_SECONDS });
    return { allowed: true, retryAfterSeconds: 0 };
  } catch {
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

export interface BudgetResult extends QuotaResult {
  consumed: number;
  budget: number;
}

/**
 * Global (account-wide) daily request budget guard — generalized from the
 * retired chatbot worker's checkNeuronBudget. C1 had no LLM cost (SSE echo
 * only), so REQUEST_COST_ESTIMATE was a placeholder "1"; C2 wired a real
 * bge-m3 + gemma call behind this guard and recalibrated both
 * REQUEST_COST_ESTIMATE and DAILY_REQUEST_BUDGET to actual Workers AI
 * neuron pricing (wrangler.toml has the math) — this function itself is
 * unchanged, only its two env inputs moved.
 */
export async function checkGlobalBudget(env: Env): Promise<BudgetResult> {
  const budget = parseInt(env.DAILY_REQUEST_BUDGET, 10);
  const estimate = parseInt(env.REQUEST_COST_ESTIMATE, 10);

  if (!Number.isFinite(budget) || budget <= 0 || !Number.isFinite(estimate) || estimate <= 0 || !env.CHAT_QUOTA) {
    return { allowed: true, retryAfterSeconds: 0, consumed: 0, budget: 0 };
  }

  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const key = `quota:budget:${day}`;

  try {
    const raw = await env.CHAT_QUOTA.get(key);
    const consumed = raw ? parseInt(raw, 10) : 0;

    if (consumed + estimate > budget) {
      // Denied — do NOT advance the counter (same as checkDailyQuota).
      return { allowed: false, retryAfterSeconds: secondsToNextUtcMidnight(now), consumed, budget };
    }

    const next = consumed + estimate;
    await env.CHAT_QUOTA.put(key, String(next), { expirationTtl: BUDGET_TTL_SECONDS });
    return { allowed: true, retryAfterSeconds: 0, consumed: next, budget };
  } catch (err) {
    console.warn('checkGlobalBudget: KV read/write failed, failing open:', err instanceof Error ? err.message : err);
    return { allowed: true, retryAfterSeconds: 0, consumed: 0, budget };
  }
}
