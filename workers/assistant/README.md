# airlens-assistant

The air-quality interpretation assistant behind the chat panel on [airlens.cloud](https://airlens.cloud) (`src/components/chat/`). It is a Cloudflare Worker that answers questions about air quality and about AirLens itself with Workers AI, grounds each reply in documents retrieved from a Vectorize index, and returns those documents as citations. For questions whose intent is not `general`, it also reads the public live-data snapshots the site renders. There are no accounts: a visitor gets an anonymous, short-lived session.

This README is the single reference for the Worker, including how chat turns are stored (see [Chat logs](#chat-logs)).

## Endpoints

All routes are in `src/index.ts`. Any other path returns 404. A browser request whose `Origin` is not in `ALLOWED_ORIGINS` is rejected with 403 `origin_denied`; a request with no `Origin` header (curl, health probes) is let through.

| Method and path | What it does |
|---|---|
| `GET /api/chat/health` | Liveness probe. Returns `{"status":"ok","mode":"rag"}`. |
| `POST /api/session` | Checks a Cloudflare Turnstile token and issues a signed session token (`SESSION_TTL_SECONDS`, 3600 in `wrangler.toml`). Throttled per IP by `SESSION_RATE_LIMIT`. |
| `POST /api/chat` | Body `{ session, messages, locale?, page? }`. Streams the reply as server-sent events (`text/event-stream`). Requires a valid session. |
| `POST /api/admin/reindex` | Operator only. Embeds corpus chunks and upserts them into Vectorize. Requires the `x-admin-secret` header. |

`POST /api/chat` works through these steps in order and stops at the first one that refuses:

1. Session token: 401 if it is missing, invalid or expired.
2. Message array: 400 if an entry is malformed (a role other than `user` or `assistant`), there is no user turn, there are more than `MAX_HISTORY_TURNS` x 2 messages, or a message is longer than `MAX_MESSAGE_LENGTH` characters.
3. Per-minute and daily limits for the caller: 429 when exceeded, 503 `quota_unavailable` when the counter store cannot be read.
4. Guardrails (`src/guardrails.ts`): best-effort domain gating over the whole conversation, answered with 400 `blocked`. A request refused here has already counted against the limits in step 3.
5. Account-wide daily budget: while it lasts, `CHAT_MODEL` generates the reply from the retrieved sources and, for non-`general` intents, the live-data snapshots. Once it is spent, or its counter cannot be read, the reply is built from the retrieved sources alone, with no generation, and the closing `done` event reports `budget: "exhausted"`.

## Bindings and settings

Everything below is declared in `wrangler.toml`.

### Bindings

| Name | Kind | Use |
|---|---|---|
| `CHAT_QUOTA` | KV namespace | Counters for the per-minute limit, the per-caller daily limit and the account-wide daily budget (`src/quota.ts`). |
| `SESSION_RATE_LIMIT` | Rate Limiting, 10 requests per 60 s | Atomic throttle in front of `POST /api/session` (key `session:<ip>`) and `POST /api/admin/reindex` (key `reindex:<ip>`). Cloudflare counts per location, so it cannot express a daily cap; that stays in `CHAT_QUOTA`. |
| `CHATLOG` | R2 bucket `airlens-chatlog` | Buffer for sanitized chat turns. See [Chat logs](#chat-logs). |
| `AI` | Workers AI | Chat generation (`CHAT_MODEL`) and embeddings (`EMBEDDING_MODEL`). Always runs against the remote service, including under `wrangler dev`. |
| `VECTORIZE` | Vectorize index `airlens-assistant-corpus` | Retrieval corpus. See [Retrieval corpus](#retrieval-corpus). |

`CHAT_QUOTA`, `SESSION_RATE_LIMIT`, `CHATLOG` and `VECTORIZE` are optional in `Env` (`src/types.ts`), so the Worker boots without them. Unbound, the three quota guards let every request through, the rate-limit check passes, no turn is stored, and replies carry no citations. A binding dropped from a deployed Worker switches its guard off the same way, without an error.

When `CHAT_QUOTA` is bound but KV itself errors, the guards fail closed instead: the per-minute and daily guards answer 503 `quota_unavailable`, and the budget guard hands the request to the retrieval-only reply.

The `SESSION_RATE_LIMIT` check does not fail closed. `isRateLimited` in `src/index.ts` reports "not limited" when the binding is absent and also when the `limit()` call throws, and logs `rate limiter unavailable, failing open` in the second case. During a limiter outage, `POST /api/session` and `POST /api/admin/reindex` therefore run without the per-IP throttle; the Turnstile check and the admin secret check still run.

The caller key behind the counters is a hash of the client IP, salted with the UTC date and peppered with `SESSION_HMAC_SECRET` (`resolveIdentifier` in `src/session.ts`). A hash of the session id is used only when a request carries no IP.

### Variables

| Variable | Value in `wrangler.toml` | Meaning |
|---|---|---|
| `CHATLOG_ENABLED` | `"true"` | Master switch for storing chat turns. Anything but the exact string `"true"` is off. Read [Chat logs](#chat-logs) before changing it. |
| `CHATLOG_HOURLY_MAX` | `"120"` | Approximate ceiling on stored turns per UTC hour. The code default is also 120. |
| `RATE_LIMIT_PER_MINUTE` | `"5"` | Chat requests per caller per minute. |
| `DAILY_MESSAGE_LIMIT` | `"30"` | Chat requests per caller per UTC day. |
| `DAILY_REQUEST_BUDGET` | `"10000"` | Account-wide daily budget, set to the Workers AI free allowance of 10,000 neurons per day. Each allowed turn is charged `REQUEST_COST_ESTIMATE` (`"65"`) against it, so 153 turns fit (`floor(10000 / 65)`). After that, replies are retrieval-only. |
| `CHAT_MODEL` | `"@cf/google/gemma-4-26b-a4b-it"` | Generation model. |
| `EMBEDDING_MODEL` | `"@cf/baai/bge-m3"` | Embedding model, 1024 dimensions. |

Model ids are variables, not code, so a model swap is a configuration change. The other variables in `[vars]` are `SESSION_TTL_SECONDS`, `MAX_MESSAGE_LENGTH`, `MAX_HISTORY_TURNS`, `MAX_TOKENS`, `TEMPERATURE`, `REASONING_EFFORT`, `RAG_TOP_K`, `ALLOWED_ORIGINS` and `HF_LIVE_BASE` (the public dataset the live-data snapshots come from).

### Secrets

Set each one with `npx wrangler secret put <NAME>`. Only names are listed here.

| Name | Purpose | When it is missing |
|---|---|---|
| `SESSION_HMAC_SECRET` | Signs and verifies session tokens (HMAC-SHA256) and peppers the caller hash. | Required, with no development fallback. `POST /api/session` fails with 500 and no session token verifies, so `POST /api/chat` returns 401. For local development use `npx wrangler secret put SESSION_HMAC_SECRET --local` or a git-ignored `.dev.vars` file. |
| `TURNSTILE_SECRET` | Cloudflare Turnstile secret key. | Turnstile verification is skipped and a session is issued anyway (`devBypass: true` in the response). Every such issuance logs a warning containing `ASSISTANT_TURNSTILE_FAIL_OPEN`, so a bot gate that is off in production can be found in Workers Logs. It must be set before the Worker serves a real origin. |
| `ADMIN_REINDEX_SECRET` | Shared secret for `POST /api/admin/reindex`. | The endpoint refuses every request with 401, the same answer as for a wrong secret. It never defaults to open: an unauthenticated reindex would let anyone plant text that the model then treats as trusted AirLens documentation. |

## Chat logs

This section is the reference for how chat turns are stored. The sending half is in this folder. The receiving half is in another repository (see [Receiving side](#receiving-side)).

When logging is on, a turn that gets past the session and limit checks is recorded once it ends, whatever the outcome: answered, refused by a guardrail, failed, or abandoned by the visitor (`completion_status` is `complete`, `empty`, `stream_error`, `client_abort` or `blocked`). Requests refused earlier, by the session, message or limit checks, are not stored.

### Turning it on

A turn is stored only when the `CHATLOG` binding exists and `CHATLOG_ENABLED` is exactly `"true"` (`chatlogEnabled` in `src/persist.ts`). With no binding, or any other value, nothing is written. As committed, `wrangler.toml` has the flag at `"true"`.

Turning it on is a two-step change, in this order:

1. The `/legal/privacy` wording that says what is stored, for how long, and that a single conversation cannot be deleted must already be live on airlens.cloud. Check the deployed bundle, not just the merge.
2. Only then set `CHATLOG_ENABLED = "true"` and redeploy.

The reverse order collects data without notice. Shipping the binding while the flag is off is what makes that order possible to verify.

### Masking

`redactPII` in `src/redact.ts` sanitizes every question and every reply at the edge, in the same request and immediately before the only write. It is a pure function with no bindings, so it cannot be the reason a chat request fails.

| Matches | Replaced with |
|---|---|
| A link that has a query string | `[URL]` |
| Email address | `[이메일]` |
| Resident registration number | `[주민등록번호]` |
| Foreign registration number | `[외국인등록번호]` |
| Phone number | `[전화번호]` |
| Business registration number | `[사업자등록번호]` |
| Card number | `[카드번호]` |
| Bank account number | `[계좌번호]` |
| Passport number | `[여권번호]` |
| Vehicle plate number | `[차량번호]` |

Air-quality questions are made of numbers, so the registration-number, card and account rules have a second gate: a registration number needs a valid YYMMDD date, a card number needs a known issuer prefix and a passing Luhn checksum, and an account number needs an account-related keyword within 24 characters on either side. A measurement, a station id or a timestamp is therefore not mistaken for personal data.

Coordinates are coarsened, not masked. A latitude/longitude pair, or a value labelled `lat`, `lon`, `latitude`, `longitude`, `위도` or `경도`, is cut to two decimals (about 1.1 km) by truncating the string, so a question about a place stays answerable. These are counted separately in `coords_truncated`.

There is deliberately no name filter. Korean names collide with ordinary nouns and place names, so a name pattern would damage the stored text and still miss most names. Names typed into the chat are accepted as residual risk and handled by the retention limits (see [Receiving side](#receiving-side)).

If a question was refused as out of scope and also contained personal data, it is stored without its text (`question` is `null`); the refusal label stays. `SANITIZER_VERSION` (`redact-1`) is stored on every row, so a later re-sweep can be limited to rows written by an older sanitizer.

### Storage

One turn is one JSON object in the R2 bucket `airlens-chatlog` (`persistTurn` in `src/persist.ts`), under the key

```
turn/<YYYY-MM-DD>/<HH>/<epoch-ms>-<uuid>.json
```

where the date and hour are UTC, `<epoch-ms>` is the write time in milliseconds and `<uuid>` is the record id.

`CHATLOG_HOURLY_MAX` is an approximate ceiling on turns per UTC hour. Before writing, the Worker lists that hour's prefix with the ceiling as the list limit and skips the write when the listing is full, so the daily ceiling falls out as the hourly one times 24. It is a backstop for the day the abuse guards are outrun, not an exact counter: concurrent requests can read the same count, and the pull job deleting objects lowers the count mid-hour. If the check itself fails, the turn is written anyway.

### Failures

A logging problem never turns a working answer into an error. `persistTurn` catches everything and is handed to `ctx.waitUntil`, so it always resolves. Each failure leaves a greppable token in Workers Logs instead:

| Token | Meaning |
|---|---|
| `ASSISTANT_CHATLOG_HOURLY_CAP` | The hourly ceiling was reached; the turn was not stored. |
| `ASSISTANT_CHATLOG_CAP_CHECK_FAILED` | The ceiling check could not count the hour; the turn is written anyway. |
| `ASSISTANT_CHATLOG_WRITE_FAILED` | The R2 write failed; the turn is lost. |

These lines say what failed and never include user-typed text. Nothing a visitor typed reaches `console`: redaction covers the R2 path only, and `[observability]` collects every invocation, so a stray `console.log(message)` would copy unsanitized text into a second store. `src/persist.test.ts` pins this.

### Record shape

The fields of `ChatTurnRecord` in `src/types.ts`:

`id`, `conversation_id` (the first 16 characters of the base64url SHA-256 of the session id, used only to group the turns of one conversation), `turn_index`, `ts`, `locale`, `page`, `question`, `answer`, `intent`, `guardrail_reason`, `citations_json` (source titles and relevance only), `retrieval_top_score`, `finish_reason`, `answer_chars`, `degraded` (0 or 1), `model` (`null` on the retrieval-only path, where no model ran), `latency_ms`, `redacted_count`, `coords_truncated`, `sanitizer_version`, `completion_status`.

Deliberately not stored: the client IP, the User-Agent, the Turnstile token, the original session id and precise coordinates.

### Why R2 and not KV

KV's free limits are shared by the whole account, and `src/quota.ts` already writes three counters per turn, which `wrangler.toml` estimates at about 60% of the daily write allowance. Logging into KV would spend the same allowance the quota counters depend on, so a logging overrun would hit the guards instead of just costing log lines. R2's free tier (1 million class-A operations per month) is far above the expected volume and is not shared with the counters. How the guards react to a KV error is described under [Bindings](#bindings).

### Receiving side

The buffer is drained by a collector in the `airlens-data` repository; see [`e2-sidecar/README.md`](https://github.com/AirLens-cloud/airlens-data/blob/main/e2-sidecar/README.md). In short:

- The transfer is pull-only. Neither this Worker's origin nor the collector accepts inbound connections.
- A timer on the collector pulls each object into SQLite and deletes it from R2 only after the row has been inserted, committed and read back.
- Objects that are never picked up are removed by a bucket lifecycle rule after 7 days.
- Stored question and reply text is set to NULL after 90 days, followed by `VACUUM`. The technical metadata is kept.

### Notice to visitors

`/legal/privacy` tells visitors that AirLens keeps a copy of chat exchanges after masking, for how long, and that a specific conversation cannot be deleted on request because nothing ties it to a person. The wording is the `privacy` document in `LEGAL_DOCS` in `src/content/legal.ts`, rendered by `src/pages/Legal.tsx` at `/legal/:doc`.

## Retrieval corpus

- **Index.** Vectorize index `airlens-assistant-corpus`, 1024 dimensions, cosine metric (the native size of `bge-m3`). It is created once with `npx wrangler vectorize create airlens-assistant-corpus --dimensions=1024 --metric=cosine`.
- **Sources.** The content files the site itself renders (`src/content/methodologySections.ts`, `faq.ts`, `glossaryTerms.ts`, `aboutState.ts`, `legal.ts`) plus `literature.ts`. Chunk ids are stable (`<category>:<slug>`), so a re-run overwrites in place instead of accumulating duplicates.
- **Refresh.** From the repository root:

  ```bash
  ADMIN_REINDEX_SECRET=<secret> node --experimental-strip-types scripts/build-corpus.mjs [worker-url]
  ```

  This needs Node 22.6 or newer. `worker-url` defaults to `http://localhost:8787` (`wrangler dev`). The script refuses to run without the secret and posts the chunks in batches of 80. CI never runs it; an operator runs it against the deployed Worker.
- **Removed entries.** A refresh only upserts (`reindexChunks` in `src/rag.ts` calls `VECTORIZE.upsert`), and nothing in this Worker deletes vectors. When a content file drops an entry, its vector therefore stays in the index: the assistant can still retrieve and cite it, and the citation's `source_url` can point at an anchor that no longer exists. Delete such ids separately with Vectorize's delete-by-id command, `npx wrangler vectorize delete-vectors airlens-assistant-corpus --ids <id> [<id> ...]` (`npx wrangler vectorize delete-vectors --help` lists the options). It acts on the live index, so an operator runs it. The two Lab-related FAQ entries removed in 2026-10, `faq:what-is-lab` and `faq:open-bundle`, stay in an index built before that removal until their ids are deleted this way.
- **Endpoint.** `POST /api/admin/reindex` needs `ADMIN_REINDEX_SECRET` in the `x-admin-secret` header. It accepts at most 500 chunks per request. Each chunk needs a non-empty `id`, `text` (at most 4000 characters), `source_title`, a `source_url` that is http(s) or a same-origin path, and a `category` of `methodology`, `faq`, `glossary`, `about`, `legal` or `static`. The Worker embeds in batches of up to 100 and answers `{ "indexed": n, "batches": m }`. Without the `VECTORIZE` binding it fails with an error instead of indexing nothing.
- **Known gap.** `literature.ts` labels its chunks `category: 'literature'`, which is not in the list above (nor in `CorpusChunkCategory` in `src/types.ts`). The endpoint validates every chunk before it embeds anything, so a single such chunk fails the whole request with 400, not just that chunk. `scripts/build-corpus.mjs` stops at the first failed batch, and with the current content its first batch of 80 already contains literature chunks, so a run indexes nothing. Until the Worker accepts `literature` or the script leaves those chunks out, the script cannot refresh the corpus.
- **At query time.** The Worker embeds the question with `EMBEDDING_MODEL` and asks the index for the `RAG_TOP_K` nearest chunks. Each vector carries its chunk's `source_title`, `source_url`, `category` and an excerpt, which become the citation cards and the grounded-context block. Without `VECTORIZE`, or when the query fails, retrieval returns nothing and the assistant answers without citations.

## Evaluation

`eval/` is a vitest harness. The deterministic suites run in a plain `npm test`. The ones that call Cloudflare or a judge model are opt-in and skip loudly when their credentials are missing; a skip is never a pass.

| Suite | What it measures | Needs |
|---|---|---|
| `routing.eval.test.ts` | Intent classification accuracy on labelled Korean and English questions | Nothing |
| `adversarial.eval.test.ts` | Layer 1: how often the deterministic gate blocks hostile input. Layer 2: how often the real model refuses probes that the gate cannot catch | Layer 2: Workers AI credentials |
| `safety.eval.test.ts` | Pinned prompt rules (no bare causal claims, closing disclaimer, no system-prompt disclosure) | Nothing |
| `trajectory.eval.test.ts` | Per-intent prompt assembly, stage by stage | Nothing |
| `retrieval.eval.test.ts` | recall@3 against the live Vectorize corpus | Cloudflare account id and a Workers AI token with Vectorize read |
| `generation-smoke.eval.test.ts` | The reply is neither empty nor truncated with the real prompt and real retrieval | The same credentials |
| `quality.eval.test.ts` | LLM-judge scores for grounding, usefulness and safety, with a deliberately bad control answer that must score low | A judge endpoint |
| `model-ab.eval.test.ts` | Candidate models ranked against the current `CHAT_MODEL` | Workers AI credentials and a judge endpoint |
| `interpretation-cases.test.ts` | Inventory of the 72-question PM2.5 interpretation specification (12 categories of 6; 48 Korean, 24 English). The live run is still pending | Nothing |

**Baseline gate.** `eval/baseline.json` commits six metrics: routing accuracy, retrieval recall@3, two grounding scores, guardrail block rate and adversarial refusal rate. `eval/gate.ts` fails a run when a metric falls more than `MARGIN` (0.1) below its baseline. A baseline changes only after a human has reviewed a better run, never automatically. A `null` baseline means the metric has no measured run yet, and the gate is skipped. `eval/BASELINE.md` records where each number came from.

**Workflows.**

- `assistant-generation-smoke.yml` ("Assistant PR gates (live)") runs on push and pull request to `main` when `workers/assistant/**` or the workflow file changes. It makes live Cloudflare calls: the generation smoke, retrieval recall@3 and the adversarial refusal layer. It needs the repo secrets `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_WORKERS_AI_TOKEN` (the token needs Workers AI and Vectorize read permissions). A "secrets present" step fails the job when either is missing, so the gate cannot pass by skipping. It is skipped for pull requests from forks, which never receive the secrets.
- `assistant-model-ab.yml` ("Assistant model A/B") is manual (`workflow_dispatch`) because it costs money: each candidate model needs generation calls plus judge calls. Its inputs are `models` (comma-separated Workers AI ids; the current `CHAT_MODEL` is always included) and `include_quality`. It reports a ranking only. Changing `CHAT_MODEL` is a separate, human edit of `wrangler.toml`. It needs `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_WORKERS_AI_TOKEN` and the judge key (`OPENAI_API_KEY`).

## Develop and deploy

```bash
cd workers/assistant
npm ci
npm test          # vitest run: unit tests and the deterministic evals
npm run dev       # wrangler dev (Workers AI stays remote)
```

CI does not run `npm run type-check` (`tsc --noEmit`) for this Worker: it fails on test files today, as the comment on the `workers` job in `.github/workflows/ci.yml` records.

First-time resources, created once out of band (see the comments in `wrangler.toml`):

- `npx wrangler kv namespace create CHAT_QUOTA`
- `npx wrangler r2 bucket create airlens-chatlog`, plus a lifecycle rule that expires objects after 7 days
- `npx wrangler vectorize create airlens-assistant-corpus --dimensions=1024 --metric=cosine`
- the three secrets above

`wrangler.toml` declares no `routes`. Binding a hostname is left to the Cloudflare dashboard, because a `routes` entry for a hostname with no DNS record makes `wrangler deploy` fail. Until one is bound, a deploy is reachable at `airlens-assistant.<account>.workers.dev`, which is enough to check `GET /api/chat/health`.

**Deploy by hand.** Run `npm run deploy` (`wrangler deploy`) in this folder with Cloudflare credentials. No workflow deploys this Worker: `.github/workflows/` has `deploy.yml` (the Pages site), `deploy-api.yml` and `deploy-public-api.yml` (the two other Workers), and the assistant workflows above only run evaluations. A merge to `main` therefore does not change the running assistant; a change to `src/prompts.ts`, for example, takes effect only after a manual deploy.
