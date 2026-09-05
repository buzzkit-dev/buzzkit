# buzzkit Monorepo

buzzkit — open-source, self-hostable, code-first push notification framework. Turborepo monorepo modeled on the feedbase template: Cloudflare Workers API with Elysia, Drizzle ORM, React Router 8 dashboard.

## What buzzkit is

Two layers, one codebase:

1. **The framework (headless core)** — multi-tenant push infrastructure defined entirely in code: workspaces with isolated APNs/FCM credentials, device token lifecycle, sending, scheduled sends, segments and workflows (bring your own provider credentials, buzzkit is the framework around them). Segments and workflows are defined in the dashboard or through the API; the `buzzkit` package is the server SDK (send, subscribers, events, inline segment expressions on a send), never a place to define and deploy workflows from code.
2. **The platform (`apps/web` + hosted version)** — a full product built *on top of* the framework. The hosted version is just a deployment of the same multi-tenant core; it must never need anything the framework doesn't expose.

**Multi-tenancy is the core primitive, not a feature.** Every design decision must work for both a single self-hoster and the hosted platform running thousands of workspaces.

**Channels are generic.** v1 ships mobile push (APNs + FCM) only, but the core primitives (connectors, workflows, triggers, segments) are channel-agnostic so email/SMS/web push can be added as modular connectors without rewriting the core.

## Project Structure

```
apps/api/                → @buzzkit/api            Cloudflare Worker API (Elysia + CloudflareAdapter)
apps/web/                → @buzzkit/web            Platform dashboard (Vite + React Router 8 SSR on CF Workers, dev port 5180)
apps/marketing/          → @buzzkit/marketing      Marketing site at buzzkit.dev (Astro static + React islands on CF Workers assets, dev port 5181; agent surface in `docs/marketing.md`)
apps/docs/               → @buzzkit/docs           Documentation at docs.buzzkit.dev (Mintlify: docs.json + MDX, dev port 5182; the
                                                  API reference is generated from `openapi.json`, emitted from the API contract on every dev/build)
packages/buzzkit/        → buzzkit                 The public server SDK (send, subscribers, events, webhooks, segment expressions)
packages/schema/         → @buzzkit/schema         Grammars the API and the dashboard both validate (`/workflows`: types, lint, parsers), private
packages/database/       → @buzzkit/database       Drizzle ORM, PostgreSQL schema, migrations
packages/auth/           → @buzzkit/auth           BetterAuth configuration (email/password, bearer tokens)
packages/eden/           → @buzzkit/eden           Typed Eden Treaty API client (envelope-unwrapping, inferred from the contract)
packages/observability/  → @buzzkit/observability  Buffered logging (Axiom), OpenTelemetry tracing
packages/tinybird/       → @buzzkit/tinybird       The event log: Tinybird data sources, materialized views and endpoints as TypeScript (`bun run push` → Tinybird Local, `bun run deploy` → cloud)
packages/ui/             → @buzzkit/ui             Design system: shadcn (Base UI style) + Tailwind v4 tokens, Central Icons
```

**`buzzkit` is one package, and it is the server SDK.** Only what a customer's backend uses lives in `packages/buzzkit`: the send client, subscriber and event APIs, webhook verification and the segment expression grammar (types + lint, so an inline segment on a send is typed and checked before it is sent), organized by subpath exports (`buzzkit/webhooks`, `buzzkit/expressions`, …) — never split into separate npm packages for organization's sake, and never holding anything that only runs on the server (request schemas, evaluators, renderers). Workflows are not defined from code: their language is the private `@buzzkit/schema/workflows` package, their runtime is the API. The platform (`apps/api`) depends on `buzzkit` directly; that's the dogfooding constraint made concrete. (The root workspace is named `buzzkit-monorepo` so the package can own the bare `buzzkit` name.)

The API dev server runs on port **8790**, the web dev server on port **5180** (offset from feedbase's 8788/5173 so both repos can run side by side). `bun db:up` starts Postgres (5460) and Tinybird Local (7181); after a fresh Tinybird container, `bun run push` in `packages/tinybird` pushes the event tables and endpoints into it (it is `push`, not `build`, so turbo's `build`/`test` graphs never depend on a running Tinybird).

## Tech Stack

- **Runtime**: Cloudflare Workers (Wrangler)
- **API Framework**: Elysia with `CloudflareAdapter` — NOT a Node.js server, no `app.listen()`
- **Database**: PostgreSQL via Drizzle ORM (what *is*); Tinybird for the event stream (what *happened*); a Durable Object per subscriber for what is true right now (`docs/engine.md`)
- **Dashboard**: deliberately **not Next.js** — Vite + React Router 8 SSR via `@cloudflare/vite-plugin`
- **Package Manager**: Bun with workspaces
- **Code Quality**: Biome (pinned exactly; hardened rule set + custom GritQL plugins in `.biome/plugins/`: no awaited calls in ternaries, no interpolated span names), `scripts/lint-conventions.ts` (the comments ban + the function-verb catalog), knip (dead exports/files/deps), Sherif, publint on `packages/buzzkit`. Husky hooks: pre-commit (lint-staged Biome on staged files + conventions + sherif), commit-msg (conventional commits), pre-push (check-types + unit tests). CI (Blacksmith runners): `.github/workflows/lint.yml` (Biome + conventions + sherif + knip, check-types), `.github/workflows/test.yml` (unit suites; full API integration suite against Postgres + Tinybird via docker compose) and `.github/workflows/deploy.yml` (on `main`: check-types + unit tests, deploy the API, dashboard and marketing site, then dispatch the device suite in `buzzkit-ios` against production and wait for it; a failure rolls the API back to the previous deployment and leaves the run red). The `conventions` skill (`.claude/skills/conventions`) is the pattern catalog — load it before writing code.

## Commands

| Command           | Description                                  |
| ----------------- | -------------------------------------------- |
| `bun dev`         | Start all apps                               |
| `bun lint`        | Biome lint (incl. Grit plugins) + the conventions checker |
| `bun format:fix`  | Biome auto-fix formatting                    |
| `bun check-types` | TypeScript type checking across all packages + `scripts/` |
| `bun run test`    | Unit tests of `buzzkit`, `@buzzkit/schema` and the dashboard's pure modules (the API's suite is `bun run test` inside `apps/api`, it boots its own server) |

## Key Conventions (inherited from feedbase)

### API Route Pattern — file-based, flat, thin

The `modules/` tree mirrors the API path exactly, one folder per path segment, dynamic segments in brackets, and **every route file is `index.ts`**:

```
modules/v1/health/index.ts    → /v1/health
```

Every route module registers directly in `modules/v1/index.ts` — route modules never `.use()` each other. Reusable domain logic lives in `apps/api/src/api/<resource>/index.ts`, not inline in route files.

### API imports & the typed client

`apps/api` imports itself via **package self-references** (`@buzzkit/api/modules/v1/index`), never path aliases — that keeps the contract (`@buzzkit/api/contract`, the v1 router without runtime adapters) type-consumable by other packages. `bun run types:emit` in `apps/api` regenerates `.types/` (d.ts, git-ignored) that consumers resolve; turbo runs it before `dev` / `build` / `check-types`, re-run it by hand after changing API response shapes mid-session. `@buzzkit/eden` wraps Eden Treaty over the contract and unwraps the response envelope, so the dashboard (`apps/web/app/lib/api.server.ts`) gets tRPC-style end-to-end types — entity types are derived from calls, never hand-written.

### Database

Schema files go in `packages/database/src/schema/`, exported from `src/schema/index.ts`. Soft delete only — every table gets a `deletedAt` column; never hard delete.

### Cloudflare Workers

- Environment accessed via `import { env } from 'cloudflare:workers'` — NOT `process.env`
- After changing wrangler bindings, run `bun run cf-typegen` to regenerate `worker-configuration.d.ts`
- No `fs` module — no file system access in Workers

### Design system & dashboard

`packages/ui` is shadcn-owned source (`bunx shadcn add <name>` in `packages/ui`, then restyle to tokens), ported 1:1 from feedbase — same look and feel, non-negotiable. Never hardcode colors: use token utilities (`bg-bg-2`, `text-fg-3`, `bg-primary-4`; the brand is only ever the `primary-*` alias ramp). Icons come exclusively from `<Icon name='Icon…' />` (Central Icons, generated paths from string literals — never build a name dynamically), never lucide. `docs/design.md` is the source of truth for everything visual; every component belongs on the `/ui` preview route. Web routes follow the same file-based convention as the API (`app/routes/<segment>/index.tsx`, registered in `app/routes.ts`); `apps/web/CLAUDE.md` has the dashboard rules, `docs/dashboard.md` the route map, auth architecture, onboarding, and the phase plan.

## Documentation

Product and architecture documentation lives in `docs/` — start at `docs/README.md`. `docs/overview.md` is the product vision and the source of truth for scope. Keep docs updated in the same change that alters behavior.
