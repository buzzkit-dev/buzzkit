# @buzzkit/api — Cloudflare Worker API

Elysia API on Cloudflare Workers with the CloudflareAdapter. Conventions ported from the feedbase template.

## Architecture

```
src/
├── index.ts              Entry point — compiles app, exports fetch handler
├── libs/                 Shared infrastructure (each an Elysia plugin or utility)
│   ├── database.ts       Drizzle client via Hyperdrive (`db` in context)
│   ├── error.ts          Custom error classes + global error handler
│   ├── logger.ts         Buffered logger (console sink until observability phase)
│   ├── response.ts       Response envelope builder with auto Sqids ID transformation
│   └── sqids.ts          Sqids encoder/decoder + ID_PREFIXES catalog
├── utils/errorCodes.ts   Error code → HTTP status mapping (includes PostgreSQL codes)
├── providers/            Delivery providers behind a generic interface (apns, fcm, …)
└── modules/              File-based routes
    ├── index.ts          App: CloudflareAdapter + CORS + logger + error + OpenAPI + v1
    └── v1/
        ├── index.ts      V1 router: response guard + route modules (flat registration)
        ├── health/       GET /v1/health — DB-checked liveness
        └── spike/apns/   Phase 0 APNs spike — REMOVE in Phase 4
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

## Testing

Integration over HTTP in the plain Node vitest pool (NEVER `@cloudflare/vitest-pool-workers`): requires `bun dev` running (port 8790) + local Postgres (`bun db:up` at repo root). `test/` mirrors `modules/` exactly (`test/v1/health/index.test.ts` ↔ `/v1/health`). Helpers in `test/utils/`.

Known local limitation: workerd on macOS cannot fetch APNs (HTTP/2) — see `docs/architecture.md`; APNs delivery is only testable deployed.

## Authorization — one scope declaration per route

- Workspace routes: `{ scope: 'tenants:write' }` etc. — authenticates session membership (workspace from `:slug` or `x-workspace` header) or a **workspace** API key (`bk_ws_`, workspace implied). Context: `workspace` non-null; `user`/`membership`/`apiKey` nullable. Tenant keys (`bk_tn_`) are rejected on workspace-context routes.
- Account routes: `{ account: 'read' | 'write' }` — session-only, `user` non-null.
- `keys:*` scopes are session-only — a key can never manage keys. Scope catalog + role bundles: `libs/scopes.ts`. Full model: `docs/authentication.md`.
- BetterAuth is **pinned to 1.6.25** — its drizzle schema expectations change between minors; bump only together with a schema migration.

## Endpoints

`GET /v1/health` · `POST /v1/spike/apns` (Phase 0 spike) · `/v1/auth/*` (BetterAuth) · `/v1/profile` · `/v1/workspaces` + `/:slug` + `members`, `invites`, `keys` · `/v1/invites/:token` (+ `/accept`) · `/v1/tenants` + `/:tenantSlug` — see `docs/api/`.

## Commands

| Command | Description |
|---|---|
| `bun dev` | Dev server on port 8790 (needs `bun db:up` at repo root + `.dev.vars`, see `.dev.vars.example`) |
| `bun test` | Integration tests (dev server + Postgres must be running) |
| `bun cf-typegen` | Regenerate worker-configuration.d.ts |
| `bun deploy` | Deploy to Cloudflare |
