const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export interface TurnstileResult {
  success: boolean;
  errorCodes: string[];
}

interface SiteverifyResponse {
  success: boolean;
  'error-codes'?: string[];
}

/**
 * Verifies a Turnstile token against Cloudflare's siteverify endpoint.
 *
 * Fails CLOSED: any fetch failure, non-2xx response, or unparsable body
 * means the token could not be confirmed, so it is treated as invalid — an
 * unreachable siteverify endpoint must never be a bypass.
 */
export async function verifyTurnstile(
  secret: string,
  token: string,
  remoteIp: string | null,
): Promise<TurnstileResult> {
  const body: Record<string, string> = { secret, response: token };
  if (remoteIp) {
    body.remoteip = remoteIp;
  }

  let response: Response;
  try {
    response = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { success: false, errorCodes: ['verify_unavailable'] };
  }

  if (!response.ok) {
    return { success: false, errorCodes: ['verify_unavailable'] };
  }

  try {
    const data = (await response.json()) as SiteverifyResponse;
    return { success: data.success === true, errorCodes: data['error-codes'] ?? [] };
  } catch {
    return { success: false, errorCodes: ['verify_unavailable'] };
  }
}

// Codes safe to hand back to the client as-is — both are caused by the
// client's own token (bad/duplicate), not by our secret or siteverify
// health, so exposing them isn't an information leak.
const CLIENT_SAFE_ERROR_CODES = new Set(['invalid-input-response', 'timeout-or-duplicate']);

/**
 * Reduces raw Turnstile `error-codes` to a client-safe set. Codes outside
 * the allowlist (e.g. `*-input-secret`, `internal-error`, our own
 * `verify_unavailable`) can reveal server misconfiguration or siteverify
 * outages to an attacker, so they are logged server-side and generalized to
 * `verification_failed` in the response instead.
 */
export function sanitizeTurnstileErrorCodes(errorCodes: string[]): string[] {
  const sanitized = new Set<string>();
  for (const code of errorCodes) {
    if (CLIENT_SAFE_ERROR_CODES.has(code)) {
      sanitized.add(code);
    } else {
      console.warn('verifyTurnstile: non-client-safe error code suppressed:', code);
      sanitized.add('verification_failed');
    }
  }
  if (sanitized.size === 0) {
    sanitized.add('verification_failed');
  }
  return Array.from(sanitized);
}
