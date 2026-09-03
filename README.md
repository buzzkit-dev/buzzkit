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
├── marketing/    @buzzkit/marketing Marketing site at buzzkit.dev (Astro static on Cloudflare Workers)
└── web/          @buzzkit/web       Platform dashboard (React Router 8 SSR on Cloudflare Workers)

packages/
├── auth/         @buzzkit/auth      BetterAuth configuration (email/password, bearer tokens)
├── buzzkit/      buzzkit            The framework: channel connectors, workflows, campaigns, segments, send client
└── database/     @buzzkit/database  Drizzle ORM, PostgreSQL schema, migrations
```

## Getting Started

```sh
bun install
bun db:up                                  # local Postgres (docker compose, port 5460)
cp apps/api/.dev.vars.example apps/api/.dev.vars   # then set BETTER_AUTH_SECRET
cd packages/database && bun db:migrate && cd ../..
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

Product documentation, the guides and the API reference are at [docs.buzzkit.dev](https://docs.buzzkit.dev). Architecture and internal design notes live in [`docs/`](docs/README.md).

## License

The core (the API, the dashboard, the marketing site and the internal packages) is licensed under the [GNU AGPL-3.0](LICENSE). The SDKs customers embed are MIT: the [`buzzkit`](packages/buzzkit/LICENSE) server package and the [iOS SDK](https://github.com/buzzkit-dev/BuzzKit-iOS).
