# Architecture

System architecture for buzzkit. See [overview.md](overview.md) for the product vision and [roadmap.md](roadmap.md) for the build plan.

## Runtime

Everything runs on Cloudflare Workers:

- **`apps/api`** — Elysia with `CloudflareAdapter` (never a Node server). Entry compiles the app and exports a `fetch` handler.
- **`apps/web`** — React Router 8 SSR via `@cloudflare/vite-plugin`.
- **PostgreSQL** via Drizzle ORM, connected through Hyperdrive (`HYPERDRIVE` binding; self-hosters point `localConnectionString`/Hyperdrive config at their own Postgres). Local dev: `bun db:up` (docker compose, port 5460).
- **Cloudflare Queues** (Phase 4) for send fan-out and retries; **KV** for provider token caches and session caching; **Workflows or Durable Objects** (Phase 8) for durable workflow runs.

## API layers

```
modules/   file-based routes — thin handlers: authorize → domain functions → Response
api/       domain logic per resource (queries, invariants, schemas)
providers/ delivery providers behind a generic interface (apns, fcm, …)
libs/      infrastructure plugins: response envelope, errors, sqids, logger, database
```

Every response uses the envelope `{ success, data, error, metadata }`. Errors are typed classes mapped by a global handler (`libs/error.ts` + `utils/errorCodes.ts`, including PostgreSQL error-code mapping). All emitted IDs are Stripe-style prefixed Sqids (`ws_…`, `tnt_…`, `sub_…`; catalog in `libs/sqids.ts`); numeric IDs never leak.

## APNs egress (Phase 0 spike — resolved)

APNs only accepts HTTP/2. Findings (2026-08-19):

- **Production Workers: works.** Workers' `fetch` negotiates HTTP/2 at the Cloudflare edge; the ecosystem relies on this (e.g. `cloudflare-apns2`, Cloudflare's own Agents docs sending APNs via `fetch`).
- **Local workerd on macOS: broken.** The probe (`POST /v1/spike/apns` with an empty body) fails with `Network connection lost` — known issue [cloudflare/workerd#4841](https://github.com/cloudflare/workerd/issues/4841). The same request from the host machine over HTTP/2 gets APNs' proper `403 MissingProviderToken`, so this is workerd-specific.

**Decision:** the APNs provider is plain `fetch` (no sidecar needed). Consequence for development: real APNs delivery cannot be exercised through `wrangler dev` on macOS — delivery testing runs against a deployed Worker (workers.dev preview is fine). The probe endpoint stays until Phase 4 so any environment can self-diagnose; final end-to-end verification (real p8 → ES256 JWT → sandbox APNs → physical iPhone) happens on the first deploy with real credentials.

ES256 provider-token signing via WebCrypto lives in `providers/apns` (raw `r||s` ECDSA output is exactly JOSE ES256 — no DER conversion needed). Apple accepts tokens up to 1h old; Phase 4 caches them ~50 min in KV. FCM (HTTP v1) is plain HTTPS + OAuth2 (RS256 service-account JWT) — no transport concerns.

## Testing

Integration over HTTP: vitest in the plain Node pool making real requests against a running dev server (`bun dev`, port 8790), seeding via direct Drizzle access. The `test/` tree mirrors `modules/` exactly. Never `@cloudflare/vitest-pool-workers`.

## Secrets & config

Non-secret config in `wrangler.jsonc` `vars` (override per environment); secrets via `.dev.vars` locally and `wrangler secret` deployed. `SQIDS_ALPHABET` ships with a dev default and MUST be overridden for hosted/production. The credential-vault master key (Phase 2) is always a secret.
