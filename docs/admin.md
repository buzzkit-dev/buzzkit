# Admin

Internal, support-only access to every workspace on a deployment. An admin opens any workspace by slug and has everything an owner has, but is not a member of it and leaves no trace of themselves in it: not in the members list, not in invites, not in the member-facing audit log. What they change appears in that workspace's own audit log as "BuzzKit Support"; nothing is recorded for a read.

Status: **built** (API, tests, dashboard). This is the design it implements; the build notes at the end record what differed.

## Why it exists

The hosted platform needs support: reproduce what a customer reports, re-validate a credential, cancel a stuck scheduled message, fix a webhook endpoint. Today the only way in is to be invited, which shows up as a member, changes the workspace's headcount, survives the support case, and requires the customer to act first. A self-hoster running the framework for several product teams has the same problem one level down.

## Principles

1. **One boolean.** A user is an admin or is not: `user.admin`. No table, no roles, no per-workspace grants.
2. **Full access, everywhere, always.** An admin resolves every live workspace with the complete scope set, including the session-only ones (`keys:*`, `invites:*`, `members:write`, `workspace:delete`, `tenants:secrets`). Membership does not narrow it: an admin who is also a `member`-role member of a workspace still has everything there.
3. **Invisible as a person, accountable as an actor.** An admin is never a `workspace_member` row unless they were invited like anyone else. Member counts, the members page, invites and role changes are untouched by their presence. What they *do* is a normal audit entry in the workspace's own log, with the actor shown as **BuzzKit Support**, so a customer can always see exactly what support changed. The admin's email is stored on the row but never shown to the workspace.
4. **Only actions are recorded, and as ordinary audit entries.** Reads are never logged. A change is one row in the workspace's own audit log with the admin as the actor (`actorType = admin`), not a second ledger and not a custom event.
5. **Internal only.** The flag never appears in any response, not even to the admin: it is not a BetterAuth session field (so `/v1/auth/get-session` cannot leak it), it is read from the `user` row inside the auth middleware, and no serializer emits it. What an admin sees is `role: 'owner'` in every workspace. The dashboard learns that someone is an admin only because `GET /v1/admin/workspaces` answers 200 instead of 403. No request body can set the flag. `test/v1/workspaces/visibility.test.ts` and `test/v1/admin/workspaces/index.test.ts` are the proof and must stay green.
6. **Framework, not platform.** The hosted product must never need anything the framework does not expose (`overview.md`), so this lives in `apps/api` and `packages/database`. A self-hoster who never flips the boolean never notices it exists.

## Data model

- `user.admin boolean not null default false` (`packages/database/src/schema/auth.ts`, migration `0020`). Deliberately **not** a BetterAuth additional field: the session never carries it, `workspaceMiddleware` joins the `user` row on every workspace request and `requireAdmin` reads it with `selectAdmin` on the admin routes.
- There is no platform ledger and no `admin.*` event. An admin's change is written to the workspace's `event` row with `actorType: 'admin'`, `actorUserId` and their email as `actorDisplay`; `actorType = admin` is reserved for admins.

## Authorization

### Resolution

`workspaceMiddleware` (`apps/api/src/libs/auth/resolution.ts`) stays the single chokepoint. The membership query is unchanged; the decision after it becomes:

1. Workspace not found → 404 (unchanged).
2. `user.admin` (from the joined `user` row) → resolve with `scopes: GRANTED_SCOPES` (every workspace- and tenant-context scope in the catalog, session-only ones included), `membership` as found (possibly null), actor `member` when there is a membership and `user` otherwise. No 404 is ever possible for an admin on a live slug, and nothing is recorded for a read.
3. Otherwise the member path, unchanged; no membership → 404 exactly as today.

The flag is read from the database on every request, so a change made in the database takes effect on the next request.

Route-level checks that compare roles by scope keep working: the owner-only test for granting `owner` is `requireScope(scopes, 'workspace:delete')`, which an admin passes.

The `tenant` macro needs no change: it sits on `workspaceMiddleware` and reads `scopes`. API keys are untouched: admin is a property of a user, never of a key, and `admin:*` is not grantable (below).

Trace attributes: `auth.admin = true` next to the existing `membership.role`.

### Audit attribution

The context-bound `audit()` is where invisibility is enforced, in one place:

- **Admin with a membership in the workspace** → the row is written exactly as for any member: `type: 'member'`, their email, their member id. They are visibly in the workspace already; hiding them would be lying about a known member's action. No platform mirror.
- **Admin without a membership** → the row is written with `actorType: 'admin'`, `actorUserId` and the admin's email as `actorDisplay` but the workspace-facing serializer replaces the display with "BuzzKit Support" for every `admin` actor, so the workspace's audit log (API and dashboard) shows what was done, not which admin did it. Webhooks fire as for any other entry.

The `admin` actor type is the admin's own.

### The admin routes

Everything only an admin can call lives under `/v1/admin/*` (`modules/v1/admin/`), so the prefix is the boundary: nothing under it is reachable by a key or a plain session, and nothing outside it changes shape for an admin. Every handler on it spreads one `adminOnly` const, `{ account: 'read', beforeHandle: requireAdmin }`: the session macro authenticates, the guard reads the flag from the caller's `user` row and answers 403 `admin_required` otherwise; a key never gets past the macro (401). All of them sit on one router, `modules/v1/admin/index.ts` (`admin`, prefix `/admin`), whose guard carries `detail: { hide: true }` so the routes never reach the public OpenAPI document or the reference docs; a new admin route is one more handler on that router, `{ ...adminOnly, query }`. The gate cannot move onto the guard itself: a guard-level `beforeHandle` runs before a route-level macro has resolved the user, and a macro declared on the guard does not resolve at all, so every request would be 401 (both tried, both failed the gate tests). Three exist today. `GET /v1/admin/workspaces[?q=&limit=&cursor=]` returns every live workspace on the deployment (searchable by name, slug or member email, keyset-paged, each with the caller's own `role` or null) after `assertAdmin` has read the flag from the caller's `user` row; anyone else gets 403 `admin_required`, and API keys never reach it because the route is session-only. `GET /v1/workspaces` stays the caller's own memberships, for admins too. The dashboard uses this call three ways: the Admin page's search, the ⌘K `Switch workspace` list, and, tolerated at 403, the layout's probe for whether the user is an admin at all.

There is no cross-workspace actions list either: what an admin did in a workspace is in that workspace's audit log, like any other change.

### Platform overview

`GET /v1/admin/rates` is the throughput strip: deliveries, messages, events and runs per minute, averaged over the last five whole minutes, with a per-minute series for the last thirty (`collectRates` in `api/stats/rates.ts`; Postgres for deliveries and messages, the `event_rate` and `run_rate` pipes for the rest). It is the one admin call that is polled, every ten seconds, because it is four cheap queries.

`GET /v1/admin/stats` is the other admin route: the same shape as `GET /v1/stats` (tiles, previous window, series, top events) computed across every tenant on the deployment, with `workflows` empty (a workflow belongs to one tenant) and a `platform` block in its place: `topWorkspaces` (most messages in the range, with delivered), `eventWorkspaces` (most events, from the `event_top_tenants` pipe folded onto workspaces), `growingWorkspaces` (most subscribers added, with their total) and `newestWorkspaces` (the last five created, with members and subscribers). Five rows each. It is `account: 'read'` plus `assertAdmin`, so a key is 401 and a non-admin session 403. `collectStats` takes `tenantId: number | null`; `null` drops the tenant filter from every Postgres query and switches the Tinybird reads to the `event_volume_all`, `event_top_all` and `run_volume_all` pipes, which are the tenant-scoped pipes without the tenant parameter. It fits the contract's type budget because it is a single route; a second one would not.

### Isolation invariants (added to `docs/authentication.md` and the matrix in `test/v1/auth/index.test.ts`)

6. An admin session resolves any live workspace with every granted scope, membership or not; session-only scopes included.
7. Once the flag is cleared in the database the user is a plain user again as soon as their cached session expires (5 minutes at most): non-member slugs are 404 again, memberships keep their role.
8. No API key ever reaches `GET /v1/admin/workspaces` (the route is session-only, so a key is 401), and an unknown scope such as `admin:read` cannot be granted at key creation (400).
9. A workspace's audit log never contains an `admin.*` event. An admin's mutation in a workspace they are not a member of appears there as an `admin` actor displayed as "BuzzKit Support", with the email stored but hidden; the email stays on the row.
10. The workspace members list, member count and invites list are byte-identical before and after an admin visit that makes no membership change.

## Dashboard

- **Entry point.** An `Admin` item at the bottom of the account menu, shown when the layout's probe (`GET /v1/admin/workspaces?limit=100`, tolerated 403) answered 200. It opens the `/admin` section, its own chrome in the shape of the workspace dashboard: the same 240px sidebar (`SidebarNavigation`, the navigation component the workspace sidebar is built from, over `ADMIN_NAVIGATION` in `components/layout/navigation.ts`), a `Back to dashboard` link where the workspace switcher would be, the account menu at the bottom, and the same sheet-behind-a-top-bar fold under `lg`. The sidebar is the extension point: a future admin page (feature flags, plan overrides) is a new entry in `ADMIN_NAVIGATION` and a route under `routes/admin/`. Two pages today: **Overview** (`/admin`), the platform-wide version of a workspace's Overview: a "per minute" strip of four tiles (deliveries, messages, events, runs) over `GET /v1/admin/rates`, refreshed every ten seconds through the loader-only route `routes/admin/rates/index.ts` and a fetcher, then `GET /v1/admin/stats` with the same tiles, deliveries, events and runs charts, plus four leaderboards (most messages, most events, fastest growing, newest workspaces) and the top events for the chosen range; and **Workspaces** (`/admin/workspaces`), one search over every workspace by name, slug or member email (the search field sits in the page header, placeholder "Search workspaces", no filter bar), each row linking to `/:slug`. The charts are shared with the workspace Overview through `components/overview/charts.tsx`. The admin section has no five-second live refresh: a platform-wide refresh is several Tinybird queries, so it loads on navigation and on a range change only. Same PageHeader, card, paged-table and filter-bar conventions as every other page; nothing new in `packages/ui`.
- **Opening a workspace.** Clicking a result goes to `/:slug` as usual. `getWorkspace` answers `role: 'owner'`, so every page's existing role check enables its CTAs and the members page hands out `owner` like an owner; nothing in the dashboard knows about admins except the banner, the switcher label and the Admin item, all driven by the probe.
- **The banner.** While the probe says admin and the open workspace is not in the user's own membership list, a full-width strip renders above the top bar on every page of the workspace: `Support view · changes appear to the workspace as "system" · this visit is logged`, with the workspace name and a `Leave` link back to `/admin`. Amber ramp (`bg-amber-2` / `text-amber-4`, the tone the dashboard already uses for warnings), never dismissible, present in the sidebar sheet on mobile too. It is the one visual difference from what the customer sees, and it exists so a screenshot can never be mistaken for the customer's own view. In a workspace where the admin is also a member, no banner: they are there as themselves.
- **Switcher.** The workspace switcher lists the user's own memberships as today, never every workspace on the deployment; only the workspace currently open as support is shown, at the top, with a `Support` label, and it is not what the next sign-in lands on. Every workspace is one ⌘K away instead: for an admin the layout's probe also returns the first hundred workspaces, which is what the menu's `Switch workspace` page lists, and from two characters on the live search (`routes/[slug]/search/index.ts`) returns every workspace matching by name, slug or member email in a `Workspaces` group that navigates to `/:slug` directly.
- **Not found stays not found.** A non-admin, non-member sees the same `NotFoundNotice` as before.

## Where it lives

- `packages/database/src/schema/auth.ts` — `user.admin` (migration `0020`).
- `apps/api/src/api/admin/` — `markWorkspaceAccess` (the one response decorator: an admin reads as `owner`), `assertAdmin` / `selectAdmin` / `requireAdmin` (the route guard), `listEveryWorkspace` and `AdminWorkspaceQuerySchema`.
- `apps/api/src/modules/v1/admin/index.ts` — the admin router: `GET /workspaces`, `GET /stats`.
- `apps/api/src/libs/auth/resolution.ts` — `resolveWorkspaceGrant`: **this is the whole authorization rule.** Given the membership row (or none) and the `admin` flag joined from the `user` row, it decides the scopes (`GRANTED_SCOPES` for an admin, the role bundle otherwise) and the actor. Nothing else in the API knows about admins.
- `apps/api/src/api/audit/` — the `user` and `admin` actor variants, the `system`-with-mirror write in `createAuditLogger`, `listEveryWorkspace`.
- `apps/web/app/routes/admin/` — `layout.tsx` (the admin chrome and the probe that redirects non-admins), `index.tsx` (Overview), `workspaces/index.tsx` (the search); the dashboard has no role logic of its own (the API reports `role: 'owner'`); the banner and the switcher pin in `routes/[slug]/layout.tsx` and `components/layout/workspace-switcher.tsx`; the Admin item in `components/layout/account-menu.tsx`.
- Tests: `apps/api/test/v1/admin/workspaces/index.test.ts`, `test/v1/admin/stats/index.test.ts`, `test/v1/workspaces/visibility.test.ts` and the `admin` block of `test/v1/auth/index.test.ts`.

## Build notes

- **Type budget.** Elysia's inferred router type sits at TypeScript's declaration-emit limit (TS7056): the two admin routes fit, a third macro or a handful of extra routes may not, and every addition must be checked with `bun run types:emit`. That is why the admin gate is a `beforeHandle` rather than a macro, and why `modules/index.ts` exports the compiled `handleFetch` rather than the app instance.
- **Attribution.** `resolveWorkspaceGrant` keeps membership first: an admin who is a member acts under their member identity, so the workspace's audit log names them exactly as it would have before the flag; a non-member admin acts as an `admin` actor with their email.

## Open questions

- **Second factor.** Admin sessions are ordinary email + password sessions today, and this one carries every workspace on the deployment. Before the hosted deployment grants it to anyone but the founder, admins should be required to sign in through GitHub or a passkey. Tracked here, not blocking the build.
- **Retention of the platform ledger.** `event` rows are never deleted; the platform ledger inherits that. Fine at support volumes, worth restating in the privacy policy: "we log every time our staff opens or changes your workspace, and keep that log".
