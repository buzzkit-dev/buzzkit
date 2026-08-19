# buzzkit

Open-source, self-hostable, code-first push notification framework. A developer-first alternative to OneSignal: campaigns, segments, and workflows defined in code, multi-tenant by design, headless at the core.

## Stack

| Layer | Technology |
|---|---|
| Runtime | Cloudflare Workers |
| API Framework | [Elysia](https://elysiajs.com) with CloudflareAdapter |
| Database | PostgreSQL via [Drizzle ORM](https://orm.drizzle.team) |
| Dashboard | Vite + React Router 8 SSR on Cloudflare Workers |
| Monorepo | [Turborepo](https://turbo.build) + Bun workspaces |
| Code Quality | [Biome](https://biomejs.dev) (lint + format), Husky, lint-staged, Sherif |

## Project Structure

```
apps/
├── api/          @buzzkit/api       Cloudflare Worker API (Elysia)
└── web/          @buzzkit/web       Platform dashboard (React Router 8 SSR on Cloudflare Workers)

packages/
├── core/         @buzzkit/core      Channel-agnostic primitives: connectors, workflows, campaigns, segments
├── sdk/          @buzzkit/sdk       Public TypeScript SDK
├── cli/          @buzzkit/cli       Pushes code-defined config to a buzzkit deployment
└── database/     @buzzkit/database  Drizzle ORM, PostgreSQL schema, migrations
```

## Getting Started

```sh
bun install
bun dev
```

- API: http://localhost:8790 (`/v1/health`, OpenAPI at `/swagger`)
- Web: http://localhost:5180

## Commands

| Command | Description |
|---|---|
| `bun dev` | Start all apps |
| `bun build` | Build all apps and packages |
| `bun lint` | Biome lint |
| `bun format:fix` | Biome auto-fix formatting |
| `bun check-types` | TypeScript type checking across all packages |

## Docs

Product and architecture documentation lives in [`docs/`](docs/README.md).
