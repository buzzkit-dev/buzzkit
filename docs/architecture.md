# Architecture

System architecture for buzzkit. See [overview.md](overview.md) for the product vision and [roadmap.md](roadmap.md) for the build plan.

## Runtime

Everything runs on Cloudflare Workers:

- **`apps/api`** — Elysia with `CloudflareAdapter` (never a Node server). Entry compiles the app and exports a `fetch` handler.
- **`apps/web`** — React Router 8 SSR via `@cloudflare/vite-plugin`.
- **PostgreSQL** via Drizzle ORM, connected through Hyperdrive (`HYPERDRIVE` binding; self-hosters point `localConnectionString`/Hyperdrive config at their own Postgres). Local dev: `bun db:up` (docker compose, port 5460).
- **Cloudflare Queues** — the `buzzkit-deliveries` queue carries two job types: `fanout { messageId, afterId }` (one page of targets per job, self-chaining with a persisted cursor) and `deliver { deliveryId, attempt }` (one provider call; retries are persisted as `next_attempt_at` AND re-enqueued with a delay; duplicates are no-ops via the unique attempt ledger). The consumer processes deliveries with bounded concurrency and applies message counters once per message per batch. A dead-letter queue catches crashing jobs. A **5-minute cron** (`scheduled()` → `src/queue/reconcile.ts`) re-drives due retries, lost enqueues, and stalled fan-outs and expires overdue deliveries — the DB, not the queue, is the source of truth. Producer, consumer, and cron are the same Worker; local `wrangler dev` runs all three (`/__scheduled` triggers the cron). **KV** — `AUTH_CACHE` (dashboard sessions for 5 min, purged on sign-out; resolved API keys for 60s, purged on revoke and tenant/workspace deletion) and `PROVIDER_CACHE` (APNs JWTs ~50 min, FCM OAuth tokens). Nothing is cached in isolate memory — Workers isolates are ephemeral and unshared, so KV is the only cache tier. **Workflows or Durable Objects** (Phase 8) for durable workflow runs.

## API layers

```
modules/   file-based routes — thin handlers: authorize → domain functions → Response
api/       domain logic per resource (queries, invariants, schemas)
providers/ provider registry — one module per provider with an identical shape ({ name, channel, validate(), send() }; a private classify() maps native reasons into the shared DeliveryErrorCode taxonomy); shared/ holds encoding, JWT signing, timeout-guarded fetch with response capture, token caching; types derive from the database enums
queue/     queue consumers (deliveries)
libs/      infrastructure plugins: response envelope, errors, sqids, logger, database
```

Every response uses the envelope `{ success, data, error, metadata }`. Errors are typed classes mapped by a global handler (`libs/error.ts` + `utils/errorCodes.ts`, including PostgreSQL error-code mapping). All emitted IDs are Stripe-style prefixed Sqids (`ws_…`, `tnt_…`, `sub_…`; catalog in `libs/sqids.ts`); numeric IDs never leak.

## APNs egress (Phase 0 spike — resolved)

APNs only accepts HTTP/2. Findings (2026-08-19):

- **Production Workers: works.** Workers' `fetch` negotiates HTTP/2 at the Cloudflare edge; the ecosystem relies on this (e.g. `cloudflare-apns2`, Cloudflare's own Agents docs sending APNs via `fetch`).
- **Local workerd on macOS: broken.** The probe (`POST /v1/spike/apns` with an empty body) fails with `Network connection lost` — known issue [cloudflare/workerd#4841](https://github.com/cloudflare/workerd/issues/4841). The same request from the host machine over HTTP/2 gets APNs' proper `403 MissingProviderToken`, so this is workerd-specific.

**Decision:** the APNs provider is plain `fetch` (no sidecar needed). Consequence for development: real APNs delivery cannot be exercised through `wrangler dev` on macOS — delivery testing runs against a deployed Worker (workers.dev preview is fine). The Phase 0 probe endpoint was retired when the real provider landed (Phase 4); credential validation (`POST /v1/credentials/:id/validate`) is the self-diagnosis tool now. Final end-to-end verification (real p8 → ES256 JWT → sandbox APNs → physical iPhone) happens on the first deploy with real credentials.

ES256 provider-token signing via WebCrypto lives in `providers/apns` (raw `r||s` ECDSA output is exactly JOSE ES256 — no DER conversion needed). Apple accepts tokens up to 1h old; Phase 4 caches them ~50 min in KV. FCM (HTTP v1) is plain HTTPS + OAuth2 (RS256 service-account JWT) — no transport concerns.

## Built for scale (the hot paths)

- **Auth resolution is cached in KV** (`AUTH_CACHE`): dashboard sessions for 5 minutes (purged on sign-out) and resolved API keys (key + workspace + tenant) for 60s, purged on revoke and on tenant/workspace deletion (purge is immediate in-region; KV propagation bounds worst-case global staleness at ~60s). Without the key cache every API-key request was a 3-table join. `lastUsedAt` writes are throttled to once per minute and refresh the cache entry.
- **Registration is read-first, write-on-change**: identify/register do a point lookup on the unique index and return without writing when nothing changed — same attributes, same subscriber↔endpoint binding, same platform, still active, `lastSeenAt` fresher than 5 minutes (identity re-verification is throttled the same way). Only a real change runs the `INSERT … ON CONFLICT DO UPDATE … RETURNING` upsert (race-safe for concurrent first registrations). An app relaunch storm is two index reads and zero row versions; a PostgreSQL `UPDATE` always writes a new tuple (WAL + every index + vacuum debt) even when the values are identical, so skipping no-op writes is the single biggest lever on this path. Ledger events are written only on creation or actual change.
- **Fan-out** pages use a partial composite index `(tenant_id, channel, id) where enabled and active and not deleted` — the exact shape of the page query; `to`-targeting hits the `(tenant_id, external_id)` unique index.
- **Delivery processing** decrypts each credential once per batch (a batch-local promise map per tenant×provider×environment — plaintext secrets never leave the invocation) and reads provider tokens from `PROVIDER_CACHE`; counters are applied once per message per batch.
- **Completion is derived, counters are a projection.** A message completes when an index-backed existence check finds no unsettled delivery; counters are then recounted from `delivery` (Svix keeps no aggregates at all and derives state from the latest attempt; OneSignal keeps counters — we keep counters for the product and derive the state transitions that matter). The cron heals any message left `processing` with nothing unsettled.
- **Reconciliation** runs on partial indexes only (`next_attempt_at` for due/stale deliveries, `expires_at` for expiries, `updated_at` for stalled fan-outs and unfinalized messages) — sweeps never scan.
- **Caches are best-effort by construction.** KV allows one write per second per key and is eventually consistent (~60s); every KV read/write/delete goes through `libs/cache.ts`, which logs and continues on failure — a cache miss or a 429 can cost a DB read, never a request.
- **Platform limits are encoded, not discovered.** A Worker invocation holds at most six concurrent outbound connections, so the queue consumer sends six deliveries at a time; Cloudflare Queues deliver at-least-once (hence the `(delivery, attempt)` unique ledger) and cap a queue at 5,000 msg/s — the official scale-out is multiple queues, which is deliberately deferred until the numbers demand it.
- Everything else is keyset pagination, indexed unique lookups, and append-only ledgers (events, delivery attempts).

## Observability

`packages/observability` (`@buzzkit/observability`, the monoroll/feedbase pattern) owns tracing and logging; `apps/api/src/libs/telemetry.ts` and `libs/logger.ts` are thin bindings.

- **One Worker, three services.** `instrument()` (`@microlabs/otel-cf-workers`) wraps the exported handler and resolves its config per invocation from the trigger, so traces are reported as **`buzzkit-api`** (fetch), **`buzzkit-queue`** (queue batches), and **`buzzkit-scheduler`** (cron) — separate services in Axiom without separate deployables. The root span per invocation is created by the library (`fetchHandler`, `queueHandler buzzkit-deliveries`, `scheduledHandler`), which also auto-instruments outbound `fetch` (every APNs/FCM/Resend call), KV, Queue sends, and the cache API.
- **Spans.** `trace(name, attrs?, fn)` opens a child span; `t.set()` adds attributes, `t.trace()` nests. Every DB query is a span via `@kubiks/otel-drizzle`; BetterAuth via `@kubiks/otel-better-auth`. Named spans cover auth resolution (`auth.*`), domain operations (`subscribers.upsert`, `subscriptions.register`, `messages.fanoutPage`, `deliveries.process`, `deliveries.applyAttempt`, `credentials.*`, `event.write`, …), each queue job (`queue.job.fanout`, `queue.job.deliver` with `delivery.outcome`), the batch (`queue.deliveries.batch` with per-outcome counts), and the sweep (`scheduler.reconcile` with per-bucket counts). The Elysia `telemetry` plugin stamps `http.method`, `http.route`, `http.status_code`, `request.id` (cf-ray), and the auth macros stamp `auth.method`, `user.id`, `workspace.id`, `tenant.id`, `api_key.id`, `membership.role` on the root span.
- **Logs.** `log.{debug,info,warn,error}(message, fields)` buffers per invocation (an `AsyncLocalStorage` store, so concurrent invocations in one isolate never interleave) and is flushed by the instrument wrapper via `waitUntil` — never on the response path. Every entry carries `service.name`, `trace_id`, and `span_id` so logs pivot to traces. Sinks: pretty console in development; structured JSON to console (Workers Logs indexes the fields) plus Axiom ingest in production when `AXIOM_API_TOKEN` + `AXIOM_LOGS_DATASET` are set. `debug` is dropped outside development.
- **Sinks & sampling.** Traces go to `OTEL_EXPORTER_OTLP_ENDPOINT` when set (any OTLP/HTTP collector; locally `bun jaeger` + `http://localhost:4318` → UI at http://localhost:16686), else to Axiom when `AXIOM_API_TOKEN` + `AXIOM_TRACES_DATASET` are set, else nowhere (no-op processor — instrumentation stays on, nothing is exported). `TRACE_SAMPLE_RATIO` (wrangler var, default `1`) head-samples; the tail sampler always keeps error traces.

## Testing

Integration over HTTP: vitest in the plain Node pool making real requests against a running dev server (`bun dev`, port 8790), seeding via direct Drizzle access. The `test/` tree mirrors `modules/` exactly. Never `@cloudflare/vitest-pool-workers`.

## Secrets & config

Non-secret config in `wrangler.jsonc` `vars` (override per environment); secrets via `.dev.vars` locally and `wrangler secret` deployed. `SQIDS_ALPHABET` ships with a dev default and MUST be overridden for hosted/production. The credential-vault master key (Phase 2) is always a secret.
