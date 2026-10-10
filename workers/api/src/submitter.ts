/**
 * Derives the abuse-attribution hash for an anonymous submission:
 * HMAC-SHA256("{YYYY-MM-DD (UTC)}:{ip}:{userAgent}", key=secret), hex.
 *
 * The UTC-day component rotates the hash daily so it cannot be used to
 * track a submitter across days — it only lets moderation correlate
 * multiple submissions from the same source within one day.
 */
export async function submitterHash(
  secret: string,
  ip: string,
  userAgent: string,
  now: Date,
): Promise<string> {
  const day = now.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  const message = `${day}:${ip}:${userAgent}`;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));

  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
