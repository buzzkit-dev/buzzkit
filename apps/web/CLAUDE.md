# @buzzkit/web — the dashboard

Vite + React Router 8 SSR on Cloudflare Workers (`@cloudflare/vite-plugin`), deliberately not Next.js. Dev port **5180**, talks to the API on 8790. `docs/dashboard.md` is the route map, auth architecture, onboarding spec and phase plan; `docs/design.md` is the source of truth for everything visual (served at `/design.md`, previewed at `/ui`).

## Structure

```
app/
  root.tsx                      Layout, providers (Theme, `LinkProvider` handing react-router's `Link` to the design system, MotionConfig,
                                Tooltip, Toaster), ErrorBoundary
  cloudflare.ts                 `cloudflareContext`: env/ctx via RouterContextProvider
  routes.ts                     Route table (file-based, mirrors the API convention; brackets for params)
  lib/                          api.server.ts (typed Eden client) · session.server.ts (cookie, sign-out) · auth.client.ts (BetterAuth client)
                                actions/   every route action (`*.server.ts`), one file per feature, `context.server.ts` for the preamble
                                utils/     pure helpers (format, time, request: `requestUrl` is the only way to read a loader's URL, because
                                           React Router's single-fetch requests arrive as `/path.data?_routes=…` and a link or redirect built
                                           from the raw `request.url` would point at the data endpoint; json: `parseJson` with a line and column for every path and `lineOf`, behind the segment and workflow editors; pagination: `readPage` turns the request into `{ limit, cursor }`,
                                           `paginate` turns an API page into `{ items, pagination }` with page number, page count and
                                           Previous / Next hrefs, carrying the cursor trail in the URL)
                                `.server.ts` / `.client.ts` are React Router module boundaries: a `.server` file is excluded from the
                                browser bundle and the build fails if client code imports it, so Worker env and tokens cannot leak
  hooks/                        Client hooks
  components/<feature>/         Only pieces used by more than one route live here, one directory per feature, files named for what they
                                are (never prefixed, never abbreviated): badges/ (the vocabulary badges: one component per value set, owning label
                                and colour, so a platform or key kind looks the same on every page) · events/ (describe.ts, the audit-log vocabulary; stream.ts, the event-stream vocabulary: label,
                                icon and detail per `$` name, custom names as themselves; name.tsx, the one-line glyph + label cell of the catalog and the stream; volume-chart.tsx, shared by the Events pages) · webhooks/ (describe.ts, the subscription summary shared by the list and the endpoint page) · workflows/ (describe.ts: the trigger, step and run-event vocabulary shared by the list, the workflow page and the run page; spec-editor.tsx: the JSON definition textarea with the `buzzkit/workflows` lint inline, used by New workflow and the Code tab; flow.tsx: the definition as a flow diagram (rules rows, boundary-centred node columns, forked lanes that continue or end the run) with an optional run path drawn along it, used by the Steps tab, the version dialog, the New workflow preview and the run page; trigger.tsx: the trigger as segment-style condition chips) · auth/ (form, providers, password input) · layout/ (the signed-in chrome: sidebar + navigation.ts, the IA;
                                account menu, workspace switcher, theme provider) · onboarding/ (layout, transition, progress, catalog,
                                choice-row, file-drop, connected, provider-guide; guides/ data; illustration/ primitives) · settings/ ·
                                workspace/ (fields, create dialog) · errors/ (unexpected, no-access, not-found). Anything a single route uses is written in that route file
  routes/<segment>/index.tsx    Loader + `export const action = …Action` from lib/actions.server.ts + composition; pathless groups are
                                `(name)/` like Next.js (`(auth)/layout.tsx` wraps login and signup)
```

## Rules (non-negotiable)

- **The browser never holds the API token.** BetterAuth lives on the API (`/v1/auth`) and the browser signs in against it directly through `lib/auth.client.ts`; the httpOnly session cookie the API sets is same-site with the dashboard, so loaders read it and pass it on as the bearer token. Every `/v1/*` call happens in a loader or action through `lib/api.server.ts` (Eden over `@buzzkit/api/contract`, bearer = the session cookie's value, `buzzkit-workspace` / `buzzkit-tenant` headers). Any 401 expires the cookie and redirects to `/login`. Entity types are derived from the client (`Awaited<ReturnType<typeof listX>>`), never written by hand.
- **Loaders are the source of truth.** No client caches, no polling, no `setInterval` fetching. Two exceptions, by design: the event Stream's first page queries Tinybird directly from the browser with the short-lived tenant-scoped JWT the loader fetched from `GET /v1/events/token`, never the API (`docs/engine.md`); and a webhook endpoint page revalidates its loader (never a client fetch) while a delivery on it is pending or has a retry due, every three seconds or at the retry's time, at most a minute apart, so the ledger moves without a reload. Mutations are route actions with form intents (`useActionFetcher` for toast-style results, `useFetcher` when the result renders inline), and React Router revalidates. No action-only routes: the action lives on the route that renders the control, and its body lives in `lib/actions/<feature>.server.ts`, never in the route file.
- **Design system only.** Components from `@buzzkit/ui/components/*`, tokens only (`bg-bg-2`, `text-fg-2`, `primary-*`), `<Icon name='Icon…' />` with string literals only (the icon generator scans for them), the press pattern, `text-balance` titles / `text-pretty` descriptions, sentence case, no em or en dashes in user-facing copy. New UI belongs on `/ui`.
- **Every time is hoverable.** Render times only through `TimeAgo` (relative) or `Time` (date) from `hooks/use-time-ago.tsx`; both show the exact time in a tooltip. Never put `formatDate()` output straight into JSX.
- **Motion stack.** CSS transitions for state; `motion/react` for anything more complex (springs `bounce: 0`, `AnimatePresence initial={false}`); `NumberFlow` from `@buzzkit/ui/components/number-flow` for every changing number (never the raw `@number-flow/react`: the wrapper carries the one 400ms ease-out timing); `@buzzkit/ui/components/text-swap` `TextSwap` for short text that changes in place. No other animation libraries, no hand-rolled equivalents.
- **SSR is the Worker, and the Worker looks like a browser.** The Cloudflare environment resolves packages with the `browser` export condition, so anything that asks `esm-env` whether it is in a browser gets `true` during SSR and skips its server markup (NumberFlow rendered an empty element until the client upgraded it). `vite.config.ts` answers `esm-env/browser` with `false` in the `ssr` environment and keeps those packages out of the Worker's dep pre-bundle so the override applies; if a component is missing on first paint but fine after hydration, check that first. `NumberFlow` also ships an unlayered `:where(number-flow-react){line-height:1}` in its SSR markup that beats any layered `leading-*` utility until hydration removes it, so a number that is not `leading-none` grows on the second paint and shifts the layout: give `NumberFlow` `leading-none` and size the row around it.
- **Copy goes through the `copy` skill** (`.claude/skills/copy/SKILL.md`): one job per string, full sentences, the API's nouns, no reassurance or fragments. Page descriptions say what the page is for and stop; field hints say what the option is and where it is used; CTAs name the action ("Create key").
- **Component bodies read top to bottom in one fixed order.** (1) router and context hooks and custom hooks whose result the body uses (`useOutletContext`, `useNavigate`, `useSearchParams`, `useFetcher` / `useActionFetcher`, `useFilters`); (2) plain values derived from props and loader data; (3) every `useState`; (4) every `useRef`; (5) derived values; (6) custom hooks that return nothing (`useFocusFirstError`, `useLinkedScroll`), directly under the derived values; (7) handlers; (8) every `useEffect`, last, directly above the `return`. No unused imports, variables or props; nothing computed that the JSX does not use; no state that only mirrors a prop when a `key` or a derived value does the job. Modules: imports, then constants, then types, then helpers, then components, the route's default export last.
- **No comments in apps/web.** Naming, small modules and `docs/` explain; only `TEMPORARY` markers and lint directives are allowed.
- **Feature components are plain, and only exist when shared.** A component used by one route lives in that route file; `components/` is for pieces two or more routes use; reusable-beyond-the-app pieces (`GuideStep`, the logo as `IconBuzzkit`) go to `@buzzkit/ui`. No loaders or route entries inside `components/`.
- **Onboarding guides are data.** Add a provider by writing `components/onboarding/guides/<provider>.tsx` (steps + fields + illustrations built from `illustration/` primitives), registering it in `guides/index.ts` and the catalog, and extending `guides/upload.ts`. Illustrations follow the real third-party screen's structure and copy, drawn in our tokens with one `Spot` ring; never screenshots.

## Commands

| Command | Description |
|---|---|
| `bun dev` | Dev server on 5180 (needs `.dev.vars` with `API_URL`, see `.dev.vars.example`, and the API on 8790) |
| `bun check-types` | `wrangler types` + `react-router typegen` + `tsc` |
| `bun build` / `bun deploy` | Build / deploy the Worker |
