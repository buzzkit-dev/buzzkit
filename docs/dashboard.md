# Dashboard

How `apps/web` (React Router 8 SSR on Cloudflare Workers) is built, authenticates against the API, and what it ships in which phase. The dashboard consumes the same public API as everyone else; there are no private endpoints (the framework test from [overview.md](overview.md)). Everything visual follows [design.md](design.md).

## Packages

| Package | Role |
|---|---|
| `@buzzkit/ui` (`packages/ui`) | The design system, ported 1:1 from feedbase: shadcn (Base UI style) + Tailwind v4 tokens, Open Runde, Central Icons pipeline (`generate:icons` scans the repo for `name='Icon…'` literals). Chat-specific pieces were left behind; everything else is identical |
| `@buzzkit/eden` (`packages/eden`) | Eden Treaty over `@buzzkit/api/contract` (`apps/api/src/modules/contract.ts`: the v1 router without runtime adapters). Unwraps the `{ success, data, error, metadata }` envelope so callers get `data` or a normalized `{ status, value: { code, message, param } }` error. Types are inferred from the API's emitted declarations (`bun run types:emit` in `apps/api` → `.types/`, git-ignored; turbo runs it before `dev` / `build` / `check-types`) |
| `@buzzkit/web` (`apps/web`) | The dashboard. `app/lib/api.server.ts` wraps the Eden client per call (bearer token + `buzzkit-workspace` / `buzzkit-tenant` headers), maps 401 to a sign-out, and derives every entity type (`Workspace`, `Credential`, `Tenant`, …) from calls, never by hand |

## The server-side proxy pattern

The API authenticates **only** `Authorization: Bearer <token>`; cookies are never read ([authentication.md](authentication.md)). The dashboard therefore never talks to the API from the browser:

1. Route **actions** call the BetterAuth endpoints (`/v1/auth/sign-in/email`, `/v1/auth/sign-up/email`) server-side from the web Worker (`lib/auth.server.ts`).
2. The returned session token is stored in a **signed, httpOnly cookie** on the web origin (`lib/session.server.ts`: `__session`, `SameSite=Lax`, `Secure` outside development, 7-day `maxAge` matching BetterAuth's session expiry, signed with `SESSION_SECRET`).
3. Route **loaders** read the token from the cookie and forward it as a bearer header on server-side `/v1/*` calls via `lib/api.server.ts`.

Two rules fall out of `api.server.ts`:

- **Any API 401 destroys the cookie and redirects to `/login`.** Loaders and actions never handle expired sessions themselves.
- Envelope failures throw `ApiError(status, code, message, param, details)`; actions map codes to field messages (`conflict` on `POST /workspaces` → "This slug is already taken"). `param` lets the onboarding guide attach a provider rejection to the field that caused it.
- `unwrap` JSON-round-trips every payload: Treaty revives ISO strings into `Date`s at runtime but the derived types say `string`; the round-trip makes the runtime shape match so loader data serializes predictably.

Server-side auth calls send `Origin: <API_URL>`; BetterAuth's CSRF check (enabled outside development) only trusts `trustedOrigins`, which lists the API origin and `DASHBOARD_URL`.

### Tenant selection

Every data-plane call carries `buzzkit-tenant`. Phase 1 always operates on the workspace's **default tenant** (the simple-app case never learns tenants exist, exactly like the API). The tenant switcher (Phase 2) persists the selected tenant slug per workspace in the session cookie and accepts `?tenant=<slug>` on any route as a shareable override.

## Route map

Workspaces live at the dashboard root, `/:slug`, which is why every top-level dashboard route name is a reserved workspace slug in the API (`RESERVED_SLUGS`).

| Route | Purpose |
|---|---|
| `/` | Pure redirect: no session → `/login` · no workspace → `/new` · else last-visited (or first) workspace |
| `/login`, `/signup` | Auth forms; visiting with a session bounces to `/` |
| `/logout` | Action-only; best-effort API sign-out, destroys the cookie, → `/login` |
| `/profile` | Action-only; `PATCH /v1/profile` from the account menu |
| `/new` | Create workspace, **fresh accounts only** (0 workspaces); the API creates the `default` tenant in the same transaction, then the dashboard continues into `/:slug/onboarding`. With workspaces in hand the loader redirects to `/` and creation happens in the workspace switcher's dialog, whose fetcher posts to this route's action |
| `/invite/:token` | Public invite preview; accept with a matching signed-in email |
| `/:slug/onboarding` | The setup flow (below). Its own focused shell, outside the workspace nav |
| `/:slug` | Workspace layout (workspace + workspace list + profile in parallel) and the floating shell: switcher left, `Overview · Settings` pill nav centered, account menu right |
| `/:slug` (index) | Overview: the Channels card (one row per available channel with its connected providers and status badges, `Connect` / `Manage` into the onboarding) and the four-step setup checklist (channel → API key → device → first message), computed from real data on every load |
| `/:slug/settings` | General: workspace name and slug |
| `/ui`, `/design.md` | Design-system preview and the design doc (public) |

### Redirect matrix

| Route | No cookie | Dead token | Authed, 0 workspaces | Authed, N workspaces |
|---|---|---|---|---|
| `/` | → /login | 401 → clear cookie → /login | → /new | → /:lastWorkspace (else first) |
| `/login`, `/signup` | render | → / → clear → /login (no loop) | → / → /new | → / → /:slug |
| `/new` | → /login | 401 → clear → /login | render | → / (creation lives in the switcher dialog) |
| `/:slug`, `/:slug/onboarding` | → /login | 401 → clear → /login | 404 from the API | shell; API 404 → `NotFoundPage`, 403 → `NoAccessPage` |

`lastWorkspace` is written into the session cookie by the `/:slug` layout loader and on workspace creation, so `/` returns you to where you left off.

## Onboarding

The product promise is "sign up, upload your provider key, send". The onboarding is one **centered card** (the `Card` anatomy: header, content, footer strip) with four thin progress lines above it (`Workspace → Channel → Provider → Connect`). Nothing else on the page, exactly like `/new`: no header, no skip link; the flow is not skippable from inside (the dashboard stays reachable by URL).

- **Progress** (`components/onboarding/progress.tsx`): four `h-1` tracks in `bg-3` with a `fg-4` fill that animates its width on a 0.5s bounce-0 spring. Done steps are full, the current step carries a small fill that grows with sub-progress (the Connect line fills as the guide advances), upcoming steps are empty. No numbers, no labels, no icons; the element is a `progressbar` with `aria-valuetext` for screen readers.
- **Workspace** (`/new`): name + slug. The default tenant is created automatically; the user never sees it.
- **Channel** (`/:slug/onboarding`, "Connect a channel"): `ChoiceRow`s (icon tile, name, one-line description, chevron) for every channel from `catalog.ts`: Push notifications and Email are available; SMS and Web push render dimmed with a `Soon` badge. A channel with a credential shows `Connected` and stays clickable. Rows use the house press pattern: the `::before` layer tints `bg-a2` on hover and active and scales to `0.995` on press; the `IconTile` wears a permanent `bg-4/70` hairline ring; the row itself never moves and there is no shadow.
- **Provider** (`/:slug/onboarding/:channel`, "Choose a push provider"): the same rows per provider, platform as small badges (Apple Push `iOS`, Firebase Cloud Messaging `Android`; Resend, with Postmark and SendGrid listed as `Soon`). Every channel shows this step, even with one live provider, so the choice is explicit. Footer: `Back`.
- **Connect** (`/:slug/onboarding/:channel/:provider`): the provider guide, **one sub-step at a time**. The Apple guide follows the real 2026 portal flow: Keys → Register a New Key (tick APNs, Configure) → Configure Key (Environment `Sandbox & Production`, Key Restriction `Team Scoped`, which Apple locks after saving) → Register and Download → Key ID from View Key Details → Team ID from the portal header (`Team name - TEAMID`, top right) → bundle ID from Identifiers.

### The provider guide

The guide is the heart of the onboarding. Inside the card: the illustration of the current sub-step (a `16/10` `bg-2` panel), the sub-step's title and one-line description, an optional outbound link (`Open Keys`, `Open the Firebase console`, …), and the field(s) this sub-step produces. The footer carries `Back`, `n of N`, and `Next` (enabled once the sub-step's fields are valid; Enter in a field does the same) or, on the last sub-step, the connect action. Sub-steps swap with a 0.3s bounce-0 spring (fade + 12px slide, `AnimatePresence mode='popLayout'` so the entering step starts while the leaving one is still on its way out) inside a `SizeAnimator` that bleeds past the card padding so shadows and the slide never clip; the `n of N` counter rolls with NumberFlow and the primary label morphs from `Next` to the connect label with Torph.

- Each guide (`components/onboarding/guides/apns.tsx`, `fcm.tsx`, `resend.tsx`) is an ordered list of sub-steps: title, description, link, note, **fields**, illustration. Fields sit inside the step that produces them: the `.p8` drop zone under "Download the .p8 file", the Key ID input under "Copy the Key ID", the service-account JSON drop under "Upload the JSON file". Files are read in the browser (`file.text()`) and submitted as hidden fields; the APNs `.p8` is checked for a PKCS #8 header and the Firebase JSON for `project_id` / `client_email` / `private_key` before anything is sent.
- **Connect** posts one form (every field travels as a hidden input, so earlier sub-steps stay part of the submission) to the route action, which builds the `CredentialUpload` (`guides/upload.ts`) and calls `POST /v1/credentials` on the default tenant. The API validates with a real provider call: `active` renders the connected state, `unvalidated` (provider unreachable, which is what local `wrangler dev` on macOS produces for APNs) renders an amber "saved, not verified" state with `Validate again` (`POST /v1/credentials/:id/validate`), and a provider rejection (400) surfaces inline; when the API names a `param` the guide jumps back to the sub-step that owns that field.
- **Connected state**: same card, header with the provider glyph, a row list (status badge, environment, Team ID / Key ID / bundle ID, or project + service account), footer with `Add another channel` (only while other channels are unconnected) and `Go to the dashboard`.

Illustrations are composed from `components/onboarding/illustration.tsx` primitives (`Browser`, `Sidebar`, `Page`, `PageTitle`, `MockButton`, `MockInput`, `MockCheckbox`, `MockRow`, `MockTabs`, `MockDialog`, `Spot`, `Callout`) and follow the structure and copy of the real Apple Developer, Firebase and Resend screens; the single sky `Spot` ring marks what to click or copy. They are tokens-only so they read as part of the product, sized for the card (the mock sidebar hides under `sm`), and meant to be tightened against real screenshots of those dashboards.

## Phases

Each phase ends in something reviewable in the browser. A phase starts only after the previous one has been reviewed and approved.

| Phase | Scope | Status |
|---|---|---|
| **1. Foundation + onboarding** | `@buzzkit/ui`, `@buzzkit/eden` + API contract, auth pages, workspace creation, floating shell (switcher, pill nav, account menu, theme), overview with channel card + setup checklist, Settings → General, the full onboarding flow with the APNs / FCM / Resend guides, `/ui` preview, docs | ✅ built, awaiting review |
| **2. Settings** | **Channels**: credentials of the selected tenant (status, environment, last check, validate again, revoke, replace via the guide). **API keys**: workspace / tenant / client keys with the scope picker (presets + custom), shown-once secrets, client-key token copy, revoke. **Members & invites**: roles, remove, invite by email with resend/revoke, the owner guard. **Tenants**: list / create / rename / metadata / delete, the tenant switcher in the shell (cookie-persisted + `?tenant=`). **Audit log**: `GET /workspaces/:slug/events` with event/actor filters | planned |
| **3. Subscribers & topics** | Subscribers list (keyset pagination, search by externalId, verified badge), subscriber detail (attributes, subscriptions with mute/unmute/remove, per-topic × channel preferences), delete. Settings → **Topics**: CRUD, default opt-in, per-channel defaults | planned |
| **4. Messages** | Send composer (`to` / `topic`, title, body, data, TTL, channel, APNs environment) as the "send a test push" surface; messages list with status and funnel counts; message detail with the per-delivery table (provider, status, attempts, last error) and the attempt ledger (request / response / latency) as a sheet | planned |
| **5. Tenant settings & hardening** | Identity verification toggle + identity secret reveal/rotate, channel kill-switches, danger zone (delete tenant / workspace), email verification on sign-up (`requireEmailVerification` + the email lib), workspace avatar, onboarding checklist steps 2-4 becoming live once keys/subscribers/messages pages exist | planned |
| **6. Code-defined views** | Read-only segments / campaigns / workflows and run history, once API Phases 8-9 land | later |

## Configuration

| Var | Where | Meaning |
|---|---|---|
| `API_URL` | `wrangler.jsonc` `vars` (dev default `http://localhost:8790`; production overrides at deploy) | API origin |
| `SESSION_SECRET` | Secret: `.dev.vars` locally (see `.dev.vars.example`), `wrangler secret put` in production | Signs the session cookie |

The API's `DASHBOARD_URL` must be the dashboard origin (`http://localhost:5180` locally): it is the CORS origin and a BetterAuth trusted origin.
