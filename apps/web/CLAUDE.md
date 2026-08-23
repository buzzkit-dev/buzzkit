# @buzzkit/web — the dashboard

Vite + React Router 8 SSR on Cloudflare Workers (`@cloudflare/vite-plugin`), deliberately not Next.js. Dev port **5180**, talks to the API on 8790. `docs/dashboard.md` is the route map, auth architecture, onboarding spec and phase plan; `docs/design.md` is the source of truth for everything visual (served at `/design.md`, previewed at `/ui`).

## Structure

```
app/
  root.tsx                      Layout, providers (Theme, MotionConfig, Tooltip, Toaster), ErrorBoundary
  cloudflare.ts                 `cloudflareContext`: env/ctx via RouterContextProvider
  routes.ts                     Route table (file-based, mirrors the API convention; brackets for params)
  lib/                          `*.server.ts` runs only on the Worker (session cookie, Eden API client); `*.client.ts` only in the browser (the BetterAuth client)
  hooks/                        Client hooks
  components/<feature>/         One directory per feature, files named for what they are, never prefixed with the directory name,
                                never abbreviated: auth/ · layout/ (the signed-in chrome) · onboarding/ (guides/ data, illustration/
                                primitives) · settings/ · shared/ (transitions, guide-step) · workspace/ · system/
  routes/<segment>/index.tsx    Loaders, actions, error mapping — nothing presentational beyond composition
```

## Rules (non-negotiable)

- **The browser never holds the API token.** BetterAuth lives on the API (`/v1/auth`) and the browser signs in against it directly through `lib/auth.client.ts`; the httpOnly session cookie the API sets is same-site with the dashboard, so loaders read it and pass it on as the bearer token. Every `/v1/*` call happens in a loader or action through `lib/api.server.ts` (Eden over `@buzzkit/api/contract`, bearer = the session cookie's value, `buzzkit-workspace` / `buzzkit-tenant` headers). Any 401 expires the cookie and redirects to `/login`. Entity types are derived from the client (`Awaited<ReturnType<typeof listX>>`), never written by hand.
- **Loaders are the source of truth.** No client caches, no polling, no `setInterval` fetching. Mutations are route actions with form intents (`useActionFetcher` for toast-style results, `useFetcher` when the result renders inline), and React Router revalidates.
- **Design system only.** Components from `@buzzkit/ui/components/*`, tokens only (`bg-bg-2`, `text-fg-2`, `primary-*`), `<Icon name='Icon…' />` with string literals only (the icon generator scans for them), the press pattern, `text-balance` titles / `text-pretty` descriptions, sentence case, no em or en dashes in user-facing copy. New UI belongs on `/ui`.
- **Motion stack.** CSS transitions for state; `motion/react` for anything more complex (springs `bounce: 0`, `AnimatePresence initial={false}`); `@number-flow/react` for every changing number; `@buzzkit/ui/components/text-swap` `TextSwap` for short text that changes in place. No other animation libraries, no hand-rolled equivalents.
- **SSR is the Worker, and the Worker looks like a browser.** The Cloudflare environment resolves packages with the `browser` export condition, so anything that asks `esm-env` whether it is in a browser gets `true` during SSR and skips its server markup (NumberFlow rendered an empty element until the client upgraded it). `vite.config.ts` answers `esm-env/browser` with `false` in the `ssr` environment and keeps those packages out of the Worker's dep pre-bundle so the override applies; if a component is missing on first paint but fine after hydration, check that first.
- **No comments in apps/web.** Naming, small modules and `docs/` explain; only `TEMPORARY` markers and lint directives are allowed.
- **Feature components are plain.** No loaders or route entries inside `components/`; route files own data and error mapping. Reusable-beyond-the-app pieces go to `@buzzkit/ui`.
- **Onboarding guides are data.** Add a provider by writing `components/onboarding/guides/<provider>.tsx` (steps + fields + illustrations built from `illustration/` primitives), registering it in `guides/index.ts` and the catalog, and extending `guides/upload.ts`. Illustrations follow the real third-party screen's structure and copy, drawn in our tokens with one `Spot` ring; never screenshots.

## Commands

| Command | Description |
|---|---|
| `bun dev` | Dev server on 5180 (needs `.dev.vars` with `API_URL`, see `.dev.vars.example`, and the API on 8790) |
| `VITE_FORCE_THEME=light` in `.env.local` | Dev-only theme pin (`light` or `dark`); git-ignored, ignored in production builds |
| `bun check-types` | `wrangler types` + `react-router typegen` + `tsc` |
| `bun build` / `bun deploy` | Build / deploy the Worker |
