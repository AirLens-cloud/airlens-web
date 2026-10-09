/**
 * upstream.ts — fetch a static snapshot from DATA_ORIGIN with edge caching.
 *
 * The snapshots are already public JSON (DQSS W4, 2026-09-03: served from the HF
 * dataset `Robeedau/airlens-live` under `aq-data/**`, not the Cloudflare Pages
 * mirror), so this is a same-project facade, not a data source of its own.
 * `cf.cacheTtl` lets the Cloudflare edge cache the upstream body so repeat
 * requests don't re-hit HF; the response `s-maxage` (set by the caller) caches
 * the reshaped result.
 */

import type { Env } from './types';

const DEFAULT_ORIGIN = 'https://huggingface.co/datasets/Robeedau/airlens-live/resolve/main';

export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'UpstreamError';
  }
}

/**
 * Fetch and parse a JSON snapshot under DATA_ORIGIN.
 *
 * @param path  Absolute path beginning with "/aq-data/…".
 * @param cacheTtlSeconds  How long the Cloudflare edge may cache the upstream body.
 */
export async function fetchSnapshot<T = unknown>(
  env: Env,
  path: string,
  cacheTtlSeconds: number,
): Promise<T> {
  const origin = (env.DATA_ORIGIN || DEFAULT_ORIGIN).replace(/\/+$/, '');
  if (!path.startsWith('/aq-data/') || path.includes('..') || /%2e/i.test(path)) {
    // Hard guard: this facade only ever reads the public aq-data snapshots. No
    // path built from user input reaches here today, but reject anything that
    // isn't a plain /aq-data path (incl. traversal) so a future caller wiring in
    // user input can't turn this into an SSRF/traversal primitive.
    throw new UpstreamError('refusing to fetch non-/aq-data path', 500);
  }
  const url = `${origin}${path}`;

  let res: Response;
  try {
    res = await fetch(url, {
      cf: { cacheTtl: cacheTtlSeconds, cacheEverything: true },
      headers: { accept: 'application/json' },
    });
  } catch {
    throw new UpstreamError('snapshot origin unreachable', 502);
  }

  // A fixed snapshot path is never built from user input, so an upstream 404
  // means the data is unavailable, not that the caller's route was wrong —
  // surface it as 502 rather than leaking the origin's file layout as a 404.
  // (The only legitimate 404 is city-not-found, raised in the handler.)
  if (!res.ok) throw new UpstreamError(`snapshot origin returned ${res.status}`, 502);

  try {
    return (await res.json()) as T;
  } catch {
    throw new UpstreamError('snapshot is not valid JSON', 502);
  }
}
