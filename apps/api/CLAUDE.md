# @buzzkit/api — Cloudflare Worker API

Elysia API on Cloudflare Workers with the CloudflareAdapter. Conventions ported from the feedbase template.

## Architecture

```
src/
├── index.ts              Entry point — instrument({ fetch, queue, scheduled }) (one Worker, three traced services)
├── libs/                 Shared infrastructure (each an Elysia plugin or utility)
│   ├── database.ts       Drizzle client via Hyperdrive (`db` in context)
│   ├── error.ts          Custom error classes + global error handler
│   ├── logger.ts         Per-invocation buffered logger (console + Axiom) from @buzzkit/observability
│   ├── response.ts       Response envelope builder with auto Sqids ID transformation
│   ├── schemas.ts        Shared TypeBox schemas derived from DB enums (channel, platform, role, …) + slug/name/email/url
│   ├── encoding.ts       hex / base64 / base64url helpers (the only byte↔string code)
│   ├── cache.ts          Best-effort KV read/write/delete with date revival
│   ├── telemetry.ts      trace() spans, route/auth span attributes, instrument() binding
│   └── sqids.ts          Sqids encoder/decoder + ID_PREFIXES catalog
├── utils/errorCodes.ts   Error code → HTTP status mapping (includes PostgreSQL codes)
├── providers/            Provider registry: one module per provider (validate + send), aggregated in index.ts
├── queue/                Queue consumer (fan-out pages + batched delivery pipeline: select → claim → send → settle) and the reconciliation cron
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
- **Responses:** always `Response.success()` / `Response.list()` (every list is `{ items, hasMore, nextCursor }`) / `Response.error()` (envelope + Sqids transform); `markDeleted()` on every DELETE. Contract: `docs/api/conventions.md`. Root `id` needs `{ entity: '…' }`; new `*Id` field names need a `FIELD_ENTITIES` entry in `libs/response.ts`.
- **Errors:** throw the typed classes from `libs/error.ts` with `{ code, param }` for domain failures (lowercase snake_case codes, see `docs/api/conventions.md`) — never hand-build error responses in handlers. Malformed ids are 404, not 400.
- **Soft delete only**, every read filters `isNull(deletedAt)`.
- **Tenant scoping:** every data-plane query filters by `tenantId` from resolved auth context — there must be no code path that touches tenant data without one.
- **Cloudflare:** env via `import { env } from 'cloudflare:workers'`; `bun cf-typegen` after wrangler.jsonc changes; Web Crypto only (no `node:crypto`); no `fs`.

## Event ledger — every mutation records one event

Every mutation endpoint calls the context-bound `event()` exactly once — always `await`ed (the ledger INSERT is synchronous; the row is durable before the response; failures are logged, never thrown). Names follow Stripe's convention (`tenant.created`, `member.role_changed`) and MUST exist in `EVENT_CATALOG` (`api/events/catalog.ts`) — calls are type-checked against it. The ledger powers the audit log (`GET /v1/workspaces/:workspaceSlug/events`) and future webhook delivery (the catalog's `webhook` flag). Never recorded: reads, auth denials.

## Observability — every unit of work is a span

Traces and logs come from `@buzzkit/observability` (`packages/observability`). Wrap domain operations, provider calls, and queue/cron work in `trace('resource.verb', attrs?, fn)` and stamp outcomes with `t.set()`; log with `log.info/warn/error(message, fields)` — never `console`. Services report as `buzzkit-api` / `buzzkit-queue` / `buzzkit-scheduler` from one Worker. Caches live in KV only (`AUTH_CACHE`, `PROVIDER_CACHE`) — never in isolate memory — and only through `libs/cache.ts` (`readCache`/`writeCache`/`deleteCache`): a cache failure is logged and swallowed, it must never fail a request. Details: `docs/architecture.md` → Observability.

## Testing

Integration over HTTP in the plain Node vitest pool (NEVER `@cloudflare/vitest-pool-workers`). `bun test` boots its **own** API on port 8791 (`scripts/test.ts`: separate `--persist-to` state, separate inspector port), waits for `/v1/health`, runs vitest with `API_URL`, and stops it — never point tests at the dev server on 8790 and never kill a dev server you did not start. `bun test:only <files>` runs vitest alone against an already-running 8791 instance. Needs local Postgres (`bun db:up` at repo root). `test/` mirrors `modules/` exactly (`test/v1/health/index.test.ts` ↔ `/v1/health`). Helpers in `test/utils/`.

Pure modules get unit tests mirroring `src/` (`test/api/...`, `test/libs/...`, `test/providers/...`, `test/utils/...`, `test/packages/...`); the `@buzzkit/api` alias plus the `cloudflare:workers` stub in `vitest.config.mts` resolve them without the Worker runtime. Shared integration helpers live in `test/utils/` (`setup.ts` for accounts/keys/tenants, `fixtures.ts` for tokens, APNs uploads and the `APNS_REACHABLE` gate that flips APNs expectations between local `retrying` and deployed `failed`, `db.ts` for direct reads, `ids.ts` for sqids built from `wrangler.jsonc`).

Known local limitation: workerd on macOS cannot fetch APNs (HTTP/2) — see `docs/architecture.md`; APNs delivery is only testable deployed. Queues run locally in `wrangler dev` — fan-out, targeting, retry accounting, and `no_credential` outcomes are fully tested locally.

## Code conventions

**Domain files (`src/api/<resource>/index.ts`)** are ordered: types → constants → validation schemas → serializers → queries → mutations.

**No single-use constants.** A value gets a name only when it is reused or is a tunable policy number (`api/deliveries/policy.ts`, page sizes, TTLs). A string, regex, URL, or list used once is written inline where it is used — never `const SOMETHING = '…'` three lines above its only use.

**RULE #1 — NO comments in code. Anywhere. Ever.** Names and structure carry the meaning; behavior, invariants, and mechanics are documented in `docs/`. The only permitted exceptions: functional directives (`biome-ignore`, `@ts-expect-error`), the `/* /v1/... */` route table in `modules/v1/index.ts`, and config commentary in `wrangler.jsonc`.

**Function naming verbs, used identically everywhere:** `find*` (single row, throws 404), `list*` (many, incl. sweeps), `count*` (a total for a paginated list), `create*`, `update*`, `upsert*`/`register*`/`replace*` (idempotent writes), `softDelete*` (soft-delete + cascade effects), `revoke*` (keys/invites), `remove*` (memberships), `assert*` (invariant check that throws), `resolve*` (derive a value from input/context), `serialize*` (response shape), `mask*` (redaction), `mark*` (response decorators), and the delivery verbs `enqueue*`/`claim*`/`apply*`/`finalize*`/`expire*`/`reconcile*`/`rewrap*`/`purge*`/`touch*`/`revalidate*`/`resend*`/`accept*`/`record*`. Private non-throwing lookups are `select*`. No synonyms — no `get*`, `fetch*`, `set*`, `load*`, `delete*`, `destroy*`.

**`modules/v1/index.ts`** registers every route module with a `/* /v1/... */` path comment above each `.use()` — it is the route table at a glance. It imports route modules with relative paths; everything else uses package self-references.

## Authorization — one scope declaration per route

- Workspace routes: `{ scope: 'tenants:write' }` etc. — authenticates session membership (workspace from `:workspaceSlug` or `buzzkit-workspace` header) or a **workspace** API key (`bk_ws_`, workspace implied). Context: `workspace` non-null; `user`/`membership`/`apiKey` nullable. Tenant keys (`bk_tn_`) are rejected on workspace-context routes.
- Tenant routes (data plane): `{ tenant: 'credentials:write' }` etc. — additionally accepts tenant keys (which imply their tenant); workspace keys/sessions select a tenant via `buzzkit-tenant` (default tenant when absent). Context adds non-null `tenant`.
- Account routes: `{ account: 'read' | 'write' }` — session-only, `user` non-null.
- Session-only scopes (`keys:*`, `invites:*`, `members:write`, `workspace:delete`, `tenants:secrets`) are refused for keys at request time and at key creation — a leaked key can never escalate. Non-member sessions get 404, keys on foreign workspaces 403. Scope catalog + role bundles: `libs/scopes.ts`. Full model: `docs/authentication.md`.
- BetterAuth is **pinned to 1.6.25** — its drizzle schema expectations change between minors; bump only together with a schema migration.

## Endpoints

`GET /v1/health` · `/v1/auth/*` (BetterAuth) · `/v1/profile` · `/v1/workspaces` + `/:slug` + `members`, `invites`, `keys`, `events` · `/v1/invites/:token` (+ `/accept`) · `/v1/tenants` + `/:tenantSlug` (+ `/identity-secret`, `/identity-secret/rotate`) · `/v1/credentials` (+ `/:id`, `/:id/validate`) · `/v1/subscribers` (+ `/:externalId`, `subscriptions`, `preferences`) · `/v1/subscriptions` (+ `/:id`) · `/v1/topics` (+ `/:topicSlug`) · `/v1/messages` (+ `/:id`, `/:id/deliveries`) · `/v1/deliveries/:id` (+ `/attempts`) · `/v1/client/*` (identify, subscriptions, preferences — client keys only) — see `docs/api/`.

## Commands

| Command | Description |
|---|---|
| `bun dev` | Dev server on port 8790 (needs `bun db:up` at repo root + `.dev.vars`, see `.dev.vars.example`) |
| `bun test` | Boots a test API on 8791, runs the full suite, stops it (Postgres must be running) |
| `bun test:only` | vitest only, against an already-running test API on 8791 |
| `bun cf-typegen` | Regenerate worker-configuration.d.ts |
| `bun types:emit` | Emit `.types/` declarations consumed by `@buzzkit/eden` and the dashboard (turbo runs it before dev/build/check-types) |
| `bun deploy` | Deploy to Cloudflare |
