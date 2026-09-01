# @buzzkit/api — Cloudflare Worker API

Elysia API on Cloudflare Workers with the CloudflareAdapter. Conventions ported from the feedbase template.

## Architecture

```
src/
├── index.ts              Entry point — instrument({ fetch, queue, scheduled }) (one Worker, three traced services)
├── libs/                 Shared infrastructure (each an Elysia plugin or utility)
│   ├── database.ts       Drizzle client via Hyperdrive: `db` in route context, `stepDb()` for engine/DO steps, `batchDb()` for
│   │                     queue/cron work (never raw `createDb` outside libs — lint-enforced), `countRows(db, table, where)`
│   ├── error.ts          Custom error classes + global error handler (logs carry route + requestId)
│   ├── logger.ts         Per-invocation buffered logger (console + Axiom) from @buzzkit/observability; every line carries the requestId
│   ├── response.ts       Response envelope builder with auto Sqids ID transformation; `Response.page(page)` for cursor pages;
│   │                     requestId lands in `metadata` automatically via the invocation context
│   ├── retry.ts          `nextRetryDelaySeconds(policy, attemptsMade, { floorSeconds?, retryAfterSeconds? })` — the one backoff engine;
│   │                     each domain owns a distinctly named `RetryPolicy` (`PUSH_RETRY_POLICY`, `WEBHOOK_RETRY_POLICY`)
│   ├── http.ts           `timedFetch` — the one timeout+latency+body-excerpt fetch (providers and webhook deliveries share it)
│   ├── schemas.ts        Shared TypeBox schemas derived from DB enums (channel, platform, role, …) + slug/name/email/url + params schemas
│   ├── encoding.ts       hex / base64 / base64url helpers (the only byte↔string code)
│   ├── cache.ts          Best-effort KV read/write/delete with date revival (the blessed read*/write*/delete* store vocabulary)
│   ├── crypto.ts         Sealed secrets: `sealingContext`, seal/unseal/rewrap + `rewrapSealedRows` (the shared rewrap loop)
│   ├── auth/             BetterAuth + the four auth macros as scoped files: client.ts (BetterAuth instance + session cache
│   │                     keys), resolution.ts (user/workspace/apiKey middlewares), handler.ts (the /v1/auth mount),
│   │                     types.ts, index.ts (the `auth` macro plugin; import as `@buzzkit/api/libs/auth/index`)
│   ├── telemetry.ts      trace() spans, route/auth span attributes, instrument() binding, requestId recording
│   ├── timezone.ts       Zone arithmetic + `parseWallTime`, `DAY_MS`, `resolveTimeScale`
│   ├── tinybird.ts       Tinybird client (typed endpoints), Events API ingest, local token resolution, dashboard JWT signing
│   ├── actor.ts          `subscriberActor(tenantId, subscriberId)` + `subscriberActorName` — the Durable Object stub
│   └── sqids.ts          Sqids encoder/decoder + ID_PREFIXES catalog
├── api/                  Domain logic per resource (see Rules); `runs/` reads Tinybird's `runs_current` / `run_counts` / `run_steps` and the
│                         actor (`selectRun`, `listRecent`) so a live run is fresh and a finished one is history
│                         `scheduling/` is the time logic messages and workflows share: timezones.ts (the zone list, the earliest and latest
│                         zones a subscriber-timezone schedule spans, wall-clock parsing, `zonesFor`, `timezoneScoped` for segment audiences)
│                         and cron.ts (`nextScheduleInstant`, `dueInstants` over the five-field grammar from `@buzzkit/schema/workflows`).
│                         `messages/schedule.ts` and `workflows/schedules.ts` only add what is specific to a one-shot send or a recurring trigger
├── utils/errorCodes.ts   Error code → HTTP status mapping (includes PostgreSQL codes)
├── providers/            Provider registry, aggregated in index.ts. Each provider is a directory of scoped files
│                         (`classify.ts`, `payload.ts`, `tokens.ts`, `validate.ts`, `send.ts`, apns' `request.ts`, fcm's
│                         `account.ts`) with an index barrel exporting its `ProviderDefinition`; `shared/` holds the
│                         cross-provider fetch/JWT/token-cache/encoding plumbing. `resend/` stays one lean index (58 lines)
├── actor/                The subscriber actor (Durable Object on the Agents SDK): subscriber.ts (the class: ingest, flush, the run RPCs),
│                         ingest.ts (accepting events, system events), runs.ts (`advanceRuns`: trigger matching, cancel rules, wait delivery,
│                         the `$run.*` events; pure over the store and a `RunPorts` object so it unit-tests without Workers), store.ts (typed
│                         SQLite access), schema.ts (DDL), types.ts, constants.ts. Exported instrumented from index.ts (`instrumentActor`)
├── queue/                Queue consumers, each on the `consume(name, batch, handler)` wrapper (consume.ts: the `queue.<name>` span +
│                         `batchDb()` preamble + `CRASH_RETRY_DELAY_SECONDS`). deliveries: fan-out pages + batched delivery pipeline:
│                         select → claim → send → settle; events: actor flushes → gzipped Events API batches, `buzzkit-events-dlq`
│                         re-driven into the main queue; webhooks: audit ids and actor batches → event objects → signed deliveries with
│                         explicit delayed retries (jitter + Retry-After, all non-2xx retried except `410 Gone`). The two other DLQs
│                         (`buzzkit-deliveries-dlq`, `buzzkit-webhooks-dlq`) log-and-ack — the reconcile sweeps re-enqueue live work
├── engine/               `EngineWorkflow` (index.ts), the Cloudflare Workflow (binding `ENGINE`) that interprets one run's pinned spec:
│                         context.ts (`RunContext`: params, step state, the actor stub, the memoized `tenant(db)`, `record` → `$run.step`; `do` turns a 4xx `ApiError` into a `NonRetryableError` so permanent failures do not sit in retries), moments.ts (`resolveMoment`:
│                         a delay and a wall-clock time in a zone, over `nextLocalTime` from libs/timezone.ts), template.ts (rendering the
│                         `@buzzkit/schema/workflows` template grammar: paths, the ternary, every filter), dry-run.ts, steps/ (one file per
│                         step kind, `runSteps` dispatches; db from `stepDb()`), types.ts. Every step is its own
│                         `runInvocation(…, { traced: false })` — otel-cf-workers cannot instrument Workflows, so the shared `trace()` is silent
│                         there — but `do` emits a manual `workflow.step <name>` span per step through `runWorkflowStep`
│                         (`@buzzkit/observability`): all steps of a run share a trace derived from the run id, each span links to the
│                         triggering request's trace (`traceparent` in the run params, OTel messaging-semconv style), and `finish` emits the
│                         `workflow.run <slug>` root span with `workflow.run.result`; failing steps are recorded into run history as `failed`
├── cron/                 The Worker's cron triggers, dispatched by `controller.cron` in index.ts (constants.ts names the two expressions),
│                         each sweep isolated in its own try/catch so one failure never skips the rest, unknown expressions log. Every
│                         entry is `sweep(name, run)` (sweep.ts: a db, a `scheduler.<name>` span, the counts as attributes, one log line when
│                         anything moved). `EVERY_MINUTE`: scheduled-messages.ts (`releaseScheduledMessages`, zone by zone for subscriber-timezone
│                         sends) and workflow-schedules.ts (`releaseWorkflowSchedules`: record due fires, drain open ones). `EVERY_FIVE_MINUTES`:
│                         reconcile.ts (deliveries), webhooks.ts (`reconcileWebhooks`) and rewrap.ts (`rewrapSecrets`: credentials,
│                         tenant secrets and source secrets under the current master key) and sources.ts (`purgeSources`: source deliveries
│                         older than 30 days)
└── modules/              File-based routes
    ├── contract.ts       `api` — the v1 router without runtime adapters; `@buzzkit/api/contract` for Eden clients
    ├── index.ts          App: CloudflareAdapter + CORS + logger + error + OpenAPI + v1
    └── v1/
        ├── index.ts      V1 router: response guard + route modules (flat registration)
        └── health/       GET /v1/health — DB-checked liveness
```

## Rules (non-negotiable)

- **Routes:** `modules/` mirrors the API path, one folder per segment, dynamic segments in brackets named exactly like the param (`[workspaceSlug]`, `[tenantSlug]`, `[externalId]`, `[id]`), every route file is `index.ts`. Handlers are declared in verb order: `get`, `post`, `put`, `patch`, `delete`. Flat registration in `modules/v1/index.ts` — route modules never `.use()` each other. Collection modules export the plural, `[id]` modules the singular.
- **Thin handlers:** domain logic lives in `src/api/<resource>/index.ts` as plain functions taking `Db`; handlers authorize → call domain functions → `Response`. A route file contains nothing but its Elysia instance — no local helper functions, types, or serializers; anything reusable goes to `src/api/<resource>` (domain) or `src/libs` (infrastructure).
- **Imports:** package self-references (`@buzzkit/api/libs/error`), never path aliases — keeps the contract type-consumable by the SDK.
- **Responses:** always `Response.success()` / `Response.list()` / `Response.page()` (every list is `{ items, hasMore, nextCursor, total? }`) / `Response.error()` (envelope + Sqids transform); `markDeleted()` on every DELETE. Contract: `docs/api/conventions.md`. Root `id` needs `{ entity: '…' }`; new `*Id` field names need a `FIELD_ENTITIES` entry in `libs/response.ts`. An empty PATCH returns 200 with the unchanged entity, never 400.
- **Pagination is domain-owned** (model: `listAuditEvents`): the `list*` function takes `{ cursor?, limit?, …filters }`, uses `clampLimit` + `resolveCursor` + a `limit + 1` fetch, returns `toPage`/`toPageBy` (+ `total` where served); the route is authorize → domain call → `Response.page(page)`. Never assemble `hasMore`/`nextCursor` in a route file.
- **Errors:** throw the typed classes from `libs/error.ts` with `{ code, param }` for domain failures (lowercase snake_case codes, see `docs/api/conventions.md`) — never hand-build error responses in handlers. Malformed ids are 404, not 400.
- **Soft delete only**, every read filters `isNull(deletedAt)`.
- **Tenant scoping:** every data-plane query filters by `tenantId` from resolved auth context — there must be no code path that touches tenant data without one.
- **A channel exists only once it is connected:** topics (`channels`), subscriptions (every registration route, including the client ones and the `email` field on `PUT /v1/subscribers/:id`) and sends check `listConnectedChannels` (live credentials) first and answer 400 `channel_not_connected`; deleting a credential keeps existing topics and subscriptions. Helpers live in `api/credentials`.
- **Cloudflare:** env via `import { env } from 'cloudflare:workers'`; `bun cf-typegen` after wrangler.jsonc changes; Web Crypto only (no `node:crypto`); no `fs`. Secrets must have a line in `.dev.vars` (even empty) or `wrangler types` drops them from `Env`.

## Two ledgers — the audit log and the event stream

**Control-plane mutations record one audit entry** via the context-bound `audit()` — always `await`ed. Every `*.updated` records `changes` + `previousAttributes` through `diffForEvent(before, after, ignore)` — the third argument is an IGNORE list (always exclude sealed-secret columns and `updatedAt`); `test/v1/workspaces/[workspaceSlug]/audit/ledger.test.ts` asserts the diffs and that secret material never reaches the ledger, so a gap fails tests. Entries are always `await`ed (the INSERT is synchronous; the row is durable before the response; failures are logged, never thrown). Names follow Stripe's convention (`tenant.created`, `member.role_changed`) and MUST exist in `AUDIT_CATALOG` (`api/audit/catalog.ts`) — calls are type-checked against it. The ledger powers the audit log (`GET /v1/workspaces/:workspaceSlug/audit`) and webhook delivery: after the insert, public names (the catalog's `webhook` flag) are enqueued to `buzzkit-webhooks` with `waitUntil`, and the five-minute sweep re-enqueues any the enqueue missed. Never recorded: reads, auth denials.

**Anything about a subscriber goes on the event stream**, never the audit ledger: registrations, mutes, removals, invalidations, preference changes and attribute writes call `recordSystemEvents(tenantId, subscriber, [{ name: 'subscription.registered', data }])` (`api/events/track.ts`; names and `data` are typed by `SYSTEM_EVENTS` in `api/events/catalog.ts` and the `$` prefix is applied inside), tracked events go through `trackEvents`; the four registering routes call `recordRegistration` in `api/subscribers` (created, registered, and `$subscription.removed` for a previous owner). Both reach the subscriber's actor (`libs/actor.ts` → `actor/subscriber.ts`), which is the durability point, and flow to Tinybird through the `buzzkit-events` queue and to webhook endpoints through `buzzkit-webhooks` (`api/webhooks`, `queue/webhooks.ts`, `docs/webhooks.md`; signing lives in the `buzzkit/webhooks` package module, which the API dogfoods). `$` names are buzzkit's (`SDK_EVENTS`, `SYSTEM_EVENTS`); customers' names never start with `$`. Reads (catalog, recent, volume, timeline) query Tinybird through `libs/tinybird.ts`, never Postgres. Docs: `docs/api/events.md`, `docs/engine.md`.

**Sources turn other services' webhooks into stream events** (`api/sources`, `docs/api/sources.md`): `POST /v1/sources/:id/ingest` is the one unauthenticated write, the provider's signature is the credential (`verify.ts`: Stripe's header, Standard Webhooks through `buzzkit/webhooks`, a shared header for `custom`), the raw body is verified as received, and `ingestDelivery` records exactly one `source_delivery` row per request with its outcome (`unverified`, `rejected`, `dropped` + reason, `duplicate`, `event`) before calling `trackEvents` with `source: 'webhook'` and `data.$provider`. The mapping grammar (`@buzzkit/schema/sources`: presets, lint, `mapPayload`, `suggestMapping`) is shared with the dashboard; the API never defines a second one.

## Observability — every unit of work is a span

Traces and logs come from `@buzzkit/observability` (`packages/observability`). Wrap domain operations, provider calls, and queue/cron work in `trace('resource.verb', attrs?, fn)` and stamp outcomes with `t.set()`; log with `log.info/warn/error(message, fields)` — never `console`. Span names are static two-segment `resource.verb` strings mirroring the function they wrap (lint-enforced) — provider, environment, and outcome are attributes, never name segments; provider sends always run inside a `deliveries.send` span with `delivery.ok`/`delivery.code` stamped. Log messages are `[Prefix] Sentence` with every id in scope (`tenantId`, `subscriberId`, `runId`, `workspaceId`) — a line that cannot be filtered per tenant is a defect — and the requestId attaches to every line and response envelope automatically through the invocation context. A `catch` either rethrows, converts to a typed result, or logs with context; never an empty `catch {}`. Services report as `buzzkit-api` / `buzzkit-queue` / `buzzkit-scheduler` / `buzzkit-actor` / `buzzkit-workflows` from one Worker; the actor's spans join the API request's trace through the `traceparent` the ingest RPC carries; the engine emits `workflow.step` / `workflow.run` spans on a per-run trace linked back to the triggering request (see the engine entry above). Caches live in KV only (`AUTH_CACHE`, `PROVIDER_CACHE`) — never in isolate memory — and only through `libs/cache.ts` (`readCache`/`writeCache`/`deleteCache`): a cache failure is logged and swallowed, it must never fail a request. Details: `docs/architecture.md` → Observability.

## Testing

Integration over HTTP in the plain Node vitest pool (NEVER `@cloudflare/vitest-pool-workers`). `bun test` boots its **own** API on port 8791 (`scripts/test.ts`: separate `--persist-to` state, separate inspector port, `ENVIRONMENT=test` so sign-ups skip the external Have I Been Pwned check), waits for `/v1/health`, runs vitest with `API_URL`, and stops it — never point tests at the dev server on 8790 and never kill a dev server you did not start. `bun test:only <files>` runs vitest alone against an already-running 8791 instance. Needs local Postgres (`bun db:up` at repo root). `test/` mirrors `modules/` exactly (`test/v1/health/index.test.ts` ↔ `/v1/health`). Helpers in `test/utils/`.

`setupWorkspace()` returns a workspace whose default tenant has push (a real sandbox APNs upload) and email (a credential row written straight to the database) connected, because nothing channel-specific can be created for a channel without a credential (`channel_not_connected`). Pass `{ bare: true }` for a tenant with no credentials (the credentials suites, the refusal tests) or `{ push: 'unusable' }` for a push credential the provider rejected (`status: 'invalid'`): still connected, but deliveries skip it and settle at once as `no_credential`, which is what the fan-out tests need instead of retrying against an unreachable APNs. `createTenant()` connects the same way unless `{ bare: true }`; `connectChannel` / `disconnectChannel` in `test/utils/db.ts` flip a channel mid-test.

Pure modules get unit tests mirroring `src/` (`test/api/...`, `test/libs/...`, `test/providers/...`, `test/utils/...`, `test/packages/...`, `test/queue/...`, `test/actor/...`) — these never open a database or a socket, so CI's unit job runs them without infrastructure; a domain suite that needs real Postgres through `test/utils/db.ts` lives under `test/db/...` (mirroring `src/` the same way) and runs only with the integration suite; the `@buzzkit/api` alias plus the `cloudflare:workers` stub in `vitest.config.mts` resolve them without the Worker runtime. The actor's store, ingest and flush are pure modules over an `ActorStore`; `test/utils/actorStore.ts` builds one on `node:sqlite` so they run against real SQLite in vitest (`NODE_OPTIONS=--no-warnings bunx vitest run test/actor`). The event stream's outage path is `test/v1/events/durability.test.ts`, which pauses the `buzzkit-tinybird` container (docker; ~90s; never run it alongside another suite). Two suites can run at once on separate instances: `TEST_API_PORT=8793 TEST_STATE_DIR=../../.wrangler/test-state-x bun run test -- <files>`. Shared integration helpers live in `test/utils/` (`setup.ts` for accounts/keys/tenants, `fixtures.ts` for tokens, APNs uploads and the `APNS_REACHABLE` gate that flips APNs expectations between local `retrying` and deployed `failed`, `db.ts` for direct reads, `ids.ts` for sqids built from `wrangler.jsonc`, `providerKeys.ts` for structurally valid but unregistered provider credentials: a real P-256 PKCS#8 APNs .p8 and a Firebase service-account JSON).

Known local limitation: workerd on macOS cannot fetch APNs (HTTP/2) — see `docs/architecture.md`; APNs delivery is only testable deployed. Queues and Durable Objects run locally in `wrangler dev` — fan-out, targeting, retry accounting, `no_credential` outcomes and the event stream are fully tested locally; the stream needs Tinybird Local (`bun db:up`, then `bun run push` in `packages/tinybird` once per fresh container) and tests poll with `eventually()` (`test/utils/eventually.ts`) because Tinybird is seconds behind the actor.

## Code conventions

**A resource is a directory of small scoped files, structured like `api/messages/`**: `types.ts`, `schemas.ts`, `serialize.ts`, `constants.ts` (only when there are real tunable constants), concept files named for their concern (`registration.ts`, `preferences.ts`, `policy.ts`, `secrets.ts`), and `index.ts` holding the primary queries/mutations plus `export *` re-exports of every sibling so importers always use the barrel (`@buzzkit/api/api/<resource>/index`). Files inside the directory import each other directly, never the barrel. Within each file the canonical order holds: types → constants → validation schemas → serializers → queries → mutations. A tiny single-concern resource (`profile`, `versioning`) may stay one lean `index.ts`.

**Readability (lint-enforced where possible):** never wrap a call chain or query in a ternary — branch with guards and early returns; ternaries are for small value picks with simple operands. Any arrow whose body spans multiple lines gets a block body with an explicit `return`; one-liners stay expressions. Blank lines separate logical paragraphs inside a function — the guards, the fetch, the transform, each loop, the return — but only in bodies long enough to have phases: a short function has no internal blank lines at all (a guard + return, a const + multi-line return, an accessor read as one unit). A judgment convention, deliberately not a lint rule — the `conventions` skill has the examples.

**No single-use constants.** A value gets a name only when it is reused or is a tunable policy number (`api/deliveries/policy.ts`, page sizes, TTLs). A string, regex, URL, or list used once is written inline where it is used — never `const SOMETHING = '…'` three lines above its only use.

**RULE #1 — NO comments in code. Anywhere. Ever.** Names and structure carry the meaning; behavior, invariants, and mechanics are documented in `docs/`. The only permitted exceptions: functional directives (`biome-ignore`, `@ts-expect-error`), the `/* /v1/... */` route table in `modules/v1/index.ts`, and config commentary in `wrangler.jsonc`.

**Function naming verbs, used identically everywhere:** `find*` (single row, throws 404; id-taking ones take the sqid string and decode inside), `select*` (single row, returns null — anything callers null-check), `list*` (many, incl. sweeps), `count*` (a total for a paginated list), `create*`, `update*`, `upsert*`/`register*`/`replace*` (idempotent writes), `softDelete*` (soft-delete + cascade effects), `revoke*` (keys/invites), `remove*` (memberships, actor rows), `assert*` (invariant check that throws), `resolve*` (derive a value from input/context), `apply*` (write derived state onto something), `serialize*` (response shape), `mask*` (redaction), `mark*` (response decorators), and the delivery verbs `enqueue*`/`claim*`/`finalize*`/`expire*`/`reconcile*`/`rewrap*`/`purge*`/`touch*`/`revalidate*`/`resend*`/`accept*`/`record*`. No synonyms — no `get*`, `fetch*`, `set*`, `load*`, `delete*`, `destroy*` (lint-enforced by `scripts/lint-conventions.ts`). One exception: byte/KV stores (`libs/cache.ts`, `actor/store.ts`) speak `read*`/`write*`/`delete*`/`insert*` — that vocabulary never leaks into `src/api/**`. Cross-domain name collisions are bugs: `api/deliveries` owns the unqualified delivery names; every other domain qualifies (`listWebhookDeliveries`, `serializeSourceDelivery`). Full catalog with examples: the `conventions` skill (`.claude/skills/conventions`).

**`modules/v1/index.ts`** registers every route module with a `/* /v1/... */` path comment above each `.use()` — it is the route table at a glance. It imports route modules with relative paths; everything else uses package self-references.

## Authorization — one scope declaration per route

- Workspace routes: `{ scope: 'tenants:write' }` etc. — authenticates session membership (workspace from `:workspaceSlug` or `buzzkit-workspace` header) or a **workspace** API key (`bk_ws_`, workspace implied). Context: `workspace` non-null; `user`/`membership`/`apiKey` nullable. Tenant keys (`bk_tn_`) are rejected on workspace-context routes.
- Tenant routes (data plane): `{ tenant: 'credentials:write' }` etc. — additionally accepts tenant keys (which imply their tenant); workspace keys/sessions select a tenant via `buzzkit-tenant` (default tenant when absent). Context adds non-null `tenant`.
- Account routes: `{ account: 'read' | 'write' }` — session-only, `user` non-null.
- Session-only scopes (`keys:*`, `invites:*`, `members:write`, `workspace:delete`, `tenants:secrets`) are refused for keys at request time and at key creation — a leaked key can never escalate. Non-member sessions get 404, keys on foreign workspaces 403. Scope catalog + role bundles: `libs/scopes.ts`. Full model: `docs/authentication.md`.
- BetterAuth is **pinned to 1.6.25** — its drizzle schema expectations change between minors; bump only together with a schema migration.

## Endpoints

`GET /v1/health` · `/v1/auth/*` (BetterAuth) · `/v1/profile` · `/v1/workspaces` + `/:slug` + `members`, `invites`, `keys`, `audit`, `webhooks` (+ `catalog`, `events/:id`, `/:id`, `rotate`, `deliveries`, `deliveries/:id`, `replay`) · `/v1/invites/:token` (+ `/accept`) · `/v1/tenants` + `/:tenantSlug` (+ `/identity-secret`, `/identity-secret/rotate`) · `/v1/credentials` (+ `/:id`, `/:id/validate`) · `/v1/secrets` (+ `/:name`) · `/v1/sources` (+ `/:id`, `/:id/ingest` unauthenticated and provider-signed, `/:id/preview`, `/:id/deliveries`) · `/v1/subscribers` (+ `/:externalId`, `subscriptions`, `preferences`, `deliveries`, `timeline`) · `/v1/subscriptions` (+ `/:id`) · `/v1/topics` (+ `/:topicSlug`) · `/v1/events` (+ `/names`, `/names/:name`, `/volume`, `/token`) · `/v1/messages` (+ `/:id`, `/:id/cancel`, `/:id/deliveries`) · `/v1/workflows` (+ `/:slug`, `/:slug/publish`, `/:slug/pause`) · `/v1/stats` · `/v1/deliveries/:id` (+ `/attempts`) · `/v1/client/*` (identify, subscriptions, preferences, events — client keys only) — see `docs/api/`.

## Commands

| Command | Description |
|---|---|
| `bun dev` | Dev server on port 8790 (needs `bun db:up` at repo root + `.dev.vars`, see `.dev.vars.example`) |
| `bun test` | Boots a test API on 8791, runs the full suite, stops it (Postgres must be running) |
| `bun test:only` | vitest only, against an already-running test API on 8791 |
| `bun cf-typegen` | Regenerate worker-configuration.d.ts |
| `bun types:emit` | Emit `.types/` declarations consumed by `@buzzkit/eden` and the dashboard (turbo runs it before dev/build/check-types) |
| `bun deploy` | Deploy to Cloudflare |
