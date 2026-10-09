# airlens-api

Track 2 (Supabase → Cloudflare Workers + D1) application API worker.
Plan: `~/.claude/plans/supabase-tidy-coral.md` §Track 2.

## Phase status

- **Phase 0**: D1 `airlens-db` + KV `RL_KV` provisioned and bound;
  `GET /api/health` reports a D1 `SELECT 1` probe.
- **Phase 2 (this revision)**: anonymous submission pipeline — see below.
  Route bound to `airlens.cloud/api/*`; `workers_dev` is off so the zone
  route is the only public surface (see `wrangler.toml`).
- **Phase 3 (this revision)**: `/api/admin/*` moderation endpoints — see
  below. **Dormant by design**: the Cloudflare Access application hasn't
  been created yet, so `ACCESS_TEAM_DOMAIN`/`ACCESS_AUD`/`ACCESS_ALLOWED_EMAILS`
  are unset in `wrangler.toml`, and every `/api/admin/*` request fails closed
  with `503 access_not_configured` until all three are set (no code change
  to activate — see the Phase 3 comment block in `wrangler.toml`).

## Endpoints

- `POST /api/observations` — community sky/PM2.5 observation. Body:
  `turnstile_token`, `latitude`, `longitude`, `pm25_estimate` (nullable),
  `sky_condition` (`clear`/`partly_cloudy`/`overcast`/`hazy`/`dusty`/`rainy`),
  `memo` (nullable, ≤500 chars). Success: `201 { id, status: 'pending_review', created_at }`.
- `POST /api/training-samples` — anonymous ML training contribution. Body:
  `turnstile_token`, `location_lat`, `location_lon`, `local_taken_at` (ISO 8601),
  `emotion_score` (1–5), `weather` (object), `aqi` (object), `sensory_tags`
  (`Record<string, boolean>`). `sky_crop_key` is **not accepted** — any
  present, non-null value is a `400 validation` error. There is no R2 upload
  endpoint yet (Phase 2b), so no key a client could send would resolve to a
  real object; the column exists in the schema for when that lands. Success:
  `201 { ok: true, sample_id }`.

Both endpoints: check `Content-Length` (missing, non-finite, or over 16KB →
`413 payload_too_large`, before the body is parsed) → parse + validate the
body → resolve the client IP from `CF-Connecting-IP` (missing → `400
client_ip_unavailable` — production traffic always arrives via Cloudflare, so
a missing header means the request didn't come through the expected path) →
check the per-endpoint, per-IP rate limit (`RL_KV`, fails open — observations
and training-samples are counted independently; IPv6 addresses are
normalized to their /64 prefix so rotating within it can't bypass the limit)
→ verify `turnstile_token` against Cloudflare Turnstile siteverify (fails
closed) → derive `submitter_hash` (HMAC of UTC-day:ip:user-agent, rotates
daily) → insert into D1. Rate limit runs before Turnstile deliberately: a
forged-token flood doesn't spend rate-limit budget on its own, so checking
the limit first bounds how many siteverify calls a single IP can trigger
regardless of token validity — otherwise a flood of bad tokens could both
never trip the limiter and drive the fail-closed siteverify call into a
self-inflicted 403 storm under a provider outage/throttle.

Turnstile error `codes` returned to the client are sanitized to an allowlist
(`invalid-input-response`, `timeout-or-duplicate`) — anything else (secret
misconfiguration, `internal-error`, our own `verify_unavailable`) is logged
server-side via `console.warn` and generalized to `verification_failed` in
the response, so a caller can't fingerprint server-side conditions from the
error code.

Failure responses: `400` (`invalid_json`, `validation` + `field`, or
`client_ip_unavailable`), `403` (`turnstile_failed` + `codes`, or
`origin_forbidden` for a disallowed browser `Origin`), `413`
(`payload_too_large`), `429` (`rate_limited` + `retry_after_seconds`, with a
`Retry-After` header), `500` (`db_error`).

CORS is allowlist-based (`ALLOWED_ORIGINS` wrangler var — production origins
only, no localhost; inject a local origin via `.dev.vars` or `wrangler dev
--var` instead); a request with no `Origin` header (e.g. curl) is allowed
through without CORS headers — Turnstile is the actual abuse gate for
non-browser clients. Turnstile site creation needs the
`challenge-widgets.write` OAuth scope (`wrangler login` re-run) or the
dashboard. Secrets `TURNSTILE_SECRET_KEY` and `SUBMITTER_HASH_SECRET` are set
via `wrangler secret put <name>` — never committed.

Two caveats worth knowing before relying on this pipeline operationally:

- The `RL_KV` rate limit is a non-atomic get-then-put over an eventually
  consistent store — it's a best-effort secondary throttle, not a hard cap
  (Turnstile is the primary abuse gate). Same convention as
  `workers/chatbot/src/quota.ts`; making it atomic is backlog, not done here.
- `submitter_hash` is pseudonymization, not anonymization: it's a keyed HMAC,
  so anyone holding `SUBMITTER_HASH_SECRET` could brute-force it back to
  `(day, ip, user-agent)` for a target — the secret is PII-grade and should
  be handled/rotated accordingly. Rotating it severs correlation with all
  past hashes.

## Admin endpoints (Phase 3)

All three require a valid `Cf-Access-Jwt-Assertion` header (verified in-Worker
against the team's JWKS — `src/access.ts`, RS256/WebCrypto, no jose/jsonwebtoken
dependency), then a second, independent authorization check — the verified
token's email must appear in `ACCESS_ALLOWED_EMAILS` (comma-separated,
trimmed, case-insensitive repo var) — since a verified Access token only
proves *who* the caller is, not that the Access application's policy is
scoped tightly enough to admins alone. Missing header → `401
access_jwt_missing`; any other verification failure (bad signature, expired,
not-yet-valid `nbf`, wrong issuer/audience, unknown kid, missing/empty
email, email not in the allowlist) → `403 access_denied` (the specific
reason is logged server-side only). Access env unset (`ACCESS_TEAM_DOMAIN`/
`ACCESS_AUD`) or `ACCESS_ALLOWED_EMAILS` unset/empty → `503
access_not_configured`, checked before the header so a dormant deploy always
fails closed the same way.

Once authenticated, each surface has its own per-admin (`sub`) rate limit —
observations (`GET`/`POST` list+moderate) share a 60 req/min budget
(`src/ratelimit.ts`'s `checkAdminRateLimit`,
`rl:admin:<surface>:` key space, fails open on a KV outage same as the
submission limiter).

Every state-changing request (`POST`, i.e. everything but the `GET` list
route) also has to clear a CSRF gate before it reaches a handler: browser-set
`Sec-Fetch-Site` must be `same-origin` when present, `Origin` must be
present at all (unlike the anonymous submission routes, this surface has no
curl/server-to-server use case to protect), and `Content-Type` must be
`application/json` (forcing a CORS preflight on any cross-origin attempt) —
`403 cross_site_forbidden` / `403 origin_required` / `415
unsupported_media_type` respectively. This rebuilds the CSRF immunity the
Supabase originals got for free from a Bearer `Authorization` header (which
browsers never attach to a cross-site request without an explicit opt-in);
here Access rides on a same-origin cookie a browser attaches automatically,
so that immunity doesn't exist unless it's rebuilt explicitly. Every
`/api/admin/*` response, success or error, also carries `Cache-Control:
no-store` — moderation queue contents and decisions are never cacheable.

- `GET /api/admin/observations?status=&limit=` — review queue read. `status`
  defaults to `pending_review` (allowlist: `pending_review`/`approved`/`rejected`);
  `limit` defaults to 50, capped at 100. Success: `200 { observations: [...] }`.
- `POST /api/admin/observations/moderate` — body `{ observation_id, new_status:
  'approved'|'rejected', rejection_reason? }` (unrecognized keys → `400`;
  mirrors the Supabase `moderate-observation` Edge Function's `.strict()`
  contract — `rejection_reason` required iff rejecting; on approve, absent,
  `null`, or `''` all pass, any other value is `400`). Guarded conditional
  `UPDATE ... WHERE id = ? AND status = 'pending_review'`; 0 rows changed
  disambiguates into `404 not_found` or `409 already_moderated`. The D1 table
  has no `reviewed_by`/`reviewed_at` columns, so the acting admin's Access
  email lands in a best-effort `moderation_queue` audit insert instead — its
  outcome is reported back as `audit: 'ok'|'degraded'` rather than silently
  swallowed. Success: `200 { id, status, moderated_at, rejection_reason,
  actor, audit }`.

## Frontend integration

`apps/web` switches to this worker when `VITE_ANON_SUBMISSIONS=true` and
`VITE_TURNSTILE_SITE_KEY` are set — see `src/api/augmentation.ts`
(`ANON_SUBMISSIONS_ENABLED` gate) and `ContributeModal`'s Turnstile widget.
Photo upload stays on the legacy Supabase path until Phase 2b ships an
anon-compatible upload endpoint.

Admin moderation switches independently when `VITE_ADMIN_WORKER_API=true` —
see `src/api/observations.ts` and `src/api/blog.ts` (`ADMIN_WORKER_API_ENABLED`
gate). Same-origin fetch carries the Cloudflare Access cookie automatically,
so no auth header is added client-side; the Worker's own JWT check above is
the real boundary either way. There's no `apps/web/.env.example` file in this
repo to add a placeholder to (checked — none exists at the web app or repo
root); this README is the reference until one is introduced.

## Commands

```bash
npm ci
npm run type-check
npm test
npm run deploy   # local OAuth deploy; CI path is .github/workflows/deploy-api.yml
```
