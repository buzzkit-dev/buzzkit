# @buzzkit/web — the dashboard

Vite + React Router 8 SSR on Cloudflare Workers (`@cloudflare/vite-plugin`), deliberately not Next.js. Dev port **5180**, talks to the API on 8790. `docs/dashboard.md` is the route map, auth architecture, onboarding spec and phase plan; `docs/design.md` is the source of truth for everything visual (served at `/design.md`, previewed at `/ui`).

## Structure

```
app/
  root.tsx                      Layout, providers (Theme, MotionConfig, Tooltip, Toaster), ErrorBoundary
  cloudflare.ts                 `cloudflareContext`: env/ctx via RouterContextProvider
  routes.ts                     Route table (file-based, mirrors the API convention; brackets for params)
  lib/                          api.server.ts (typed Eden client) · session.server.ts (cookie, sign-out) · auth.client.ts (BetterAuth client)
                                actions/   every route action (`*.server.ts`), one file per feature, `context.server.ts` for the preamble
                                utils/     pure helpers (format, time)
                                `.server.ts` / `.client.ts` are React Router module boundaries: a `.server` file is excluded from the
                                browser bundle and the build fails if client code imports it, so Worker env and tokens cannot leak
  hooks/                        Client hooks
  components/<feature>/         Only pieces used by more than one route live here, one directory per feature, files named for what they
                                are (never prefixed, never abbreviated): auth/ (form, providers, password input) · layout/ (the signed-in chrome: sidebar + navigation.ts, the IA;
                                account menu, workspace switcher, theme provider) · onboarding/ (layout, transition, progress, catalog,
                                choice-row, file-drop, connected, provider-guide; guides/ data; illustration/ primitives) · settings/ ·
                                workspace/ (fields, create dialog) · errors/ (unexpected, no-access, not-found). Anything a single route uses is written in that route file
  routes/<segment>/index.tsx    Loader + `export const action = …Action` from lib/actions.server.ts + composition; pathless groups are
                                `(name)/` like Next.js (`(auth)/layout.tsx` wraps login and signup)
```

## Rules (non-negotiable)

- **The browser never holds the API token.** BetterAuth lives on the API (`/v1/auth`) and the browser signs in against it directly through `lib/auth.client.ts`; the httpOnly session cookie the API sets is same-site with the dashboard, so loaders read it and pass it on as the bearer token. Every `/v1/*` call happens in a loader or action through `lib/api.server.ts` (Eden over `@buzzkit/api/contract`, bearer = the session cookie's value, `buzzkit-workspace` / `buzzkit-tenant` headers). Any 401 expires the cookie and redirects to `/login`. Entity types are derived from the client (`Awaited<ReturnType<typeof listX>>`), never written by hand.
- **Loaders are the source of truth.** No client caches, no polling, no `setInterval` fetching. Mutations are route actions with form intents (`useActionFetcher` for toast-style results, `useFetcher` when the result renders inline), and React Router revalidates. No action-only routes: the action lives on the route that renders the control, and its body lives in `lib/actions/<feature>.server.ts`, never in the route file.
- **Design system only.** Components from `@buzzkit/ui/components/*`, tokens only (`bg-bg-2`, `text-fg-2`, `primary-*`), `<Icon name='Icon…' />` with string literals only (the icon generator scans for them), the press pattern, `text-balance` titles / `text-pretty` descriptions, sentence case, no em or en dashes in user-facing copy. New UI belongs on `/ui`.
- **Motion stack.** CSS transitions for state; `motion/react` for anything more complex (springs `bounce: 0`, `AnimatePresence initial={false}`); `@number-flow/react` for every changing number; `@buzzkit/ui/components/text-swap` `TextSwap` for short text that changes in place. No other animation libraries, no hand-rolled equivalents.
- **SSR is the Worker, and the Worker looks like a browser.** The Cloudflare environment resolves packages with the `browser` export condition, so anything that asks `esm-env` whether it is in a browser gets `true` during SSR and skips its server markup (NumberFlow rendered an empty element until the client upgraded it). `vite.config.ts` answers `esm-env/browser` with `false` in the `ssr` environment and keeps those packages out of the Worker's dep pre-bundle so the override applies; if a component is missing on first paint but fine after hydration, check that first.
- **No comments in apps/web.** Naming, small modules and `docs/` explain; only `TEMPORARY` markers and lint directives are allowed.
- **Feature components are plain, and only exist when shared.** A component used by one route lives in that route file; `components/` is for pieces two or more routes use; reusable-beyond-the-app pieces (`GuideStep`, the logo as `IconBuzzkit`) go to `@buzzkit/ui`. No loaders or route entries inside `components/`.
- **Onboarding guides are data.** Add a provider by writing `components/onboarding/guides/<provider>.tsx` (steps + fields + illustrations built from `illustration/` primitives), registering it in `guides/index.ts` and the catalog, and extending `guides/upload.ts`. Illustrations follow the real third-party screen's structure and copy, drawn in our tokens with one `Spot` ring; never screenshots.

## Commands

| Command | Description |
|---|---|
| `bun dev` | Dev server on 5180 (needs `.dev.vars` with `API_URL`, see `.dev.vars.example`, and the API on 8790) |
| `VITE_FORCE_THEME=light` in `.env.local` | Dev-only theme pin (`light` or `dark`); git-ignored, ignored in production builds |
| `bun check-types` | `wrangler types` + `react-router typegen` + `tsc` |
| `bun build` / `bun deploy` | Build / deploy the Worker |
