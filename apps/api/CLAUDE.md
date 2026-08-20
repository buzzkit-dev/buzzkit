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
│   ├── telemetry.ts      trace() spans, route/auth span attributes, instrument() binding
│   └── sqids.ts          Sqids encoder/decoder + ID_PREFIXES catalog
├── utils/errorCodes.ts   Error code → HTTP status mapping (includes PostgreSQL codes)
├── providers/            Provider registry: one module per provider (validate + send), aggregated in index.ts
├── queue/                Queue consumer (deliveries: chained fan-out + deliver, batched counters) and the reconciliation cron
└── modules/              File-based routes
    ├── index.ts          App: CloudflareAdapter + CORS + logger + error + OpenAPI + v1
    └── v1/
        ├── index.ts      V1 router: response guard + route modules (flat registration)
        └── health/       GET /v1/health — DB-checked liveness
```

## Rules (non-negotiable)

- **Routes:** `modules/` mirrors the API path, one folder per segment, dynamic segments in brackets, every route file is `index.ts`. Flat registration in `modules/v1/index.ts` — route modules never `.use()` each other. Collection modules export the plural, `[id]` modules the singular.
- **Thin handlers:** domain logic lives in `src/api/<resource>/index.ts` as plain functions taking `Db`; handlers authorize → call domain functions → `Response`.
- **Imports:** package self-references (`@buzzkit/api/libs/error`), never path aliases — keeps the contract type-consumable by the SDK.
- **Responses:** always `Response.success()/.error()` (envelope + Sqids transform). Root `id` needs `{ entity: '…' }`; new `*Id` field names need a `FIELD_ENTITIES` entry in `libs/response.ts`.
- **Errors:** throw the typed classes from `libs/error.ts` — never hand-build error responses in handlers.
- **Soft delete only**, every read filters `isNull(deletedAt)`.
- **Tenant scoping:** every data-plane query filters by `tenantId` from resolved auth context — there must be no code path that touches tenant data without one.
- **Cloudflare:** env via `import { env } from 'cloudflare:workers'`; `bun cf-typegen` after wrangler.jsonc changes; Web Crypto only (no `node:crypto`); no `fs`.

## Event ledger — every mutation records one event

Every mutation endpoint calls the context-bound `event()` exactly once — always `await`ed (the ledger INSERT is synchronous; the row is durable before the response; failures are logged, never thrown). Names follow Stripe's convention (`tenant.created`, `member.role_changed`) and MUST exist in `EVENT_CATALOG` (`api/events/catalog.ts`) — calls are type-checked against it. The ledger powers the audit log (`GET /v1/workspaces/:slug/events`) and future webhook delivery (the catalog's `webhook` flag). Never recorded: reads, auth denials.

## Observability — every unit of work is a span

Traces and logs come from `@buzzkit/observability` (`packages/observability`). Wrap domain operations, provider calls, and queue/cron work in `trace('resource.verb', attrs?, fn)` and stamp outcomes with `t.set()`; log with `log.info/warn/error(message, fields)` — never `console`. Services report as `buzzkit-api` / `buzzkit-queue` / `buzzkit-scheduler` from one Worker. Caches live in KV only (`AUTH_CACHE`, `PROVIDER_CACHE`) — never in isolate memory — and only through `libs/cache.ts` (`readCache`/`writeCache`/`deleteCache`): a cache failure is logged and swallowed, it must never fail a request. Details: `docs/architecture.md` → Observability.

## Testing

Integration over HTTP in the plain Node vitest pool (NEVER `@cloudflare/vitest-pool-workers`): requires `bun dev` running (port 8790) + local Postgres (`bun db:up` at repo root). `test/` mirrors `modules/` exactly (`test/v1/health/index.test.ts` ↔ `/v1/health`). Helpers in `test/utils/`.

Known local limitation: workerd on macOS cannot fetch APNs (HTTP/2) — see `docs/architecture.md`; APNs delivery is only testable deployed. Queues run locally in `wrangler dev` — fan-out, targeting, retry accounting, and `no_credential` outcomes are fully tested locally.

## Code conventions

**Domain files (`src/api/<resource>/index.ts`)** are ordered: types → constants → validation schemas → serializers → queries → mutations.

**RULE #1 — NO comments in code. Anywhere. Ever.** Names and structure carry the meaning; behavior, invariants, and mechanics are documented in `docs/`. The only permitted exceptions: functional directives (`biome-ignore`, `@ts-expect-error`), the `/* /v1/... */` route table in `modules/v1/index.ts`, and config commentary in `wrangler.jsonc`.

**Function naming verbs, used identically everywhere:** `find*` (single row, throws 400/404), `list*` (many), `create*`, `update*`, `softDelete*` (soft-delete + cascade effects), `revoke*` (keys/invites), `remove*` (memberships), `assert*` (invariant check that throws), `serialize*` (response shape), `mask*` (redaction). No synonyms — no `get*`, `fetch*`, `delete*`, `destroy*`.

**`modules/v1/index.ts`** registers every route module with a `/* /v1/... */` path comment above each `.use()` — it is the route table at a glance. It imports route modules with relative paths; everything else uses package self-references.

## Authorization — one scope declaration per route

- Workspace routes: `{ scope: 'tenants:write' }` etc. — authenticates session membership (workspace from `:slug` or `buzzkit-workspace` header) or a **workspace** API key (`bk_ws_`, workspace implied). Context: `workspace` non-null; `user`/`membership`/`apiKey` nullable. Tenant keys (`bk_tn_`) are rejected on workspace-context routes.
- Tenant routes (data plane): `{ tenant: 'credentials:write' }` etc. — additionally accepts tenant keys (which imply their tenant); workspace keys/sessions select a tenant via `buzzkit-tenant` (default tenant when absent). Context adds non-null `tenant`.
- Account routes: `{ account: 'read' | 'write' }` — session-only, `user` non-null.
- `keys:*` scopes are session-only — a key can never manage keys. Scope catalog + role bundles: `libs/scopes.ts`. Full model: `docs/authentication.md`.
- BetterAuth is **pinned to 1.6.25** — its drizzle schema expectations change between minors; bump only together with a schema migration.

## Endpoints

`GET /v1/health` · `/v1/auth/*` (BetterAuth) · `/v1/profile` · `/v1/workspaces` + `/:slug` + `members`, `invites`, `keys`, `events` · `/v1/invites/:token` (+ `/accept`) · `/v1/tenants` + `/:tenantSlug` · `/v1/credentials` (+ `/apns`, `/fcm`, `/resend`, `/:id`, `/:id/validate`) · `/v1/subscribers` (+ `/:externalId`, `subscriptions`, `preferences`) · `/v1/subscriptions` (+ `/:id`) · `/v1/topics` (+ `/:topicSlug`) · `/v1/messages` (+ `/:id`, `/:id/deliveries`) · `/v1/deliveries/:id` (+ `/attempts`) · `/v1/client/*` (identify, subscriptions, preferences — client keys only) — see `docs/api/`.

## Commands

| Command | Description |
|---|---|
| `bun dev` | Dev server on port 8790 (needs `bun db:up` at repo root + `.dev.vars`, see `.dev.vars.example`) |
| `bun test` | Integration tests (dev server + Postgres must be running) |
| `bun cf-typegen` | Regenerate worker-configuration.d.ts |
| `bun deploy` | Deploy to Cloudflare |
