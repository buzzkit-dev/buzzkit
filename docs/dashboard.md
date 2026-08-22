# Dashboard

How `apps/web` (React Router 8 SSR on Cloudflare Workers) is built, authenticates against the API, and what it ships in which phase. The dashboard consumes the same public API as everyone else; there are no private endpoints (the framework test from [overview.md](overview.md)). Everything visual follows [design.md](design.md).

## Packages

| Package | Role |
|---|---|
| `@buzzkit/ui` (`packages/ui`) | The design system, ported 1:1 from feedbase: shadcn (Base UI style) + Tailwind v4 tokens, Open Runde, Central Icons pipeline (`generate:icons` scans the repo for `name='Icon…'` literals). Chat-specific pieces were left behind; everything else is identical |
| `@buzzkit/eden` (`packages/eden`) | Eden Treaty over `@buzzkit/api/contract` (`apps/api/src/modules/contract.ts`: the v1 router without runtime adapters). Unwraps the `{ success, data, error, metadata }` envelope so callers get `data` or a normalized `{ status, value: { code, message, param } }` error. Types are inferred from the API's emitted declarations (`bun run types:emit` in `apps/api` → `.types/`, git-ignored; turbo runs it before `dev` / `build` / `check-types`) |
| `@buzzkit/web` (`apps/web`) | The dashboard. `app/lib/api.server.ts` wraps the Eden client per call (bearer token + `buzzkit-workspace` / `buzzkit-tenant` headers), maps 401 to a sign-out, and derives every entity type (`Workspace`, `Credential`, `Tenant`, …) from calls, never by hand |

## The server-side proxy pattern

The API authenticates `/v1/*` with `Authorization: Bearer <token>` only ([authentication.md](authentication.md)); BetterAuth itself is mounted on the API at `/v1/auth`. The dashboard uses BetterAuth's own session cookie, the way a same-origin app would, by proxying:

1. The web Worker forwards every `/api/auth/*` request to `<API_URL>/v1/auth/*` verbatim (`workers/app.ts`), headers and `Set-Cookie` included. `BETTER_AUTH_URL` on the API is therefore the **dashboard** origin plus `/api/auth`, so BetterAuth's cookies (`buzzkit.session_token`, `__Secure-` prefixed in production) are first-party httpOnly cookies on the dashboard and OAuth callbacks land on the dashboard.
2. The browser talks to BetterAuth through that proxy with the BetterAuth client (`lib/auth.client.ts`, `basePath: '/api/auth'`): `signIn.email`, `signUp.email`, `signIn.social({ provider: 'github' })`. The session cookie is set by BetterAuth's response; the pages then navigate, and loaders see it.
3. Route **loaders** read the session cookie (`lib/session.server.ts`: `requireSession`, `readSessionToken`) and forward its value, which is BetterAuth's signed session token, as the bearer header on server-side `/v1/*` calls via `lib/api.server.ts`. The browser never sees the token: the cookie is httpOnly and nothing is stored client-side.
4. `/logout` is a route action: it calls `/v1/auth/sign-out` with the bearer token and expires the cookie. Any API 401 does the same (`signedOutRedirect`).

`/login` and `/signup` share one pathless layout (`routes/auth/layout.tsx` → `components/auth/shell.tsx`) that renders **one persistent form** (`components/auth/form.tsx`, `AuthForm`): the routes only contribute `handle.auth` (mode, title, description, footer link) and loader data (providers, redirect, error), and render nothing themselves. Switching between the two keeps Email, Password and the submit button exactly where they are; the Name field is the only thing that moves, rising out from behind Email (height unfolding, translate up from 24px, scale from 0.95, fade in, 0.4s bounce-0 spring) and folding back the same way. The fields below it sit on their own `bg-card` layer so Name really comes from behind them. `/new` and `/invite/:token` use the static `AuthLayout` card.

The only cookie the dashboard writes itself is `buzzkit.workspace`, the last visited workspace slug, unsigned because it is not security-relevant. Only `/`-relative `redirect` values are honoured (`safeRedirect`). GitHub sign-in is on when the API has `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` (`GET /v1/login` reports it, the button is drawn only then); the OAuth app's callback URL is `<BETTER_AUTH_URL>/callback/github`, i.e. `http://localhost:5180/api/auth/callback/github` locally.

Two rules fall out of `api.server.ts`:

- **Any API 401 expires the cookie and redirects to `/login`.** Loaders and actions never handle expired sessions themselves.
- Envelope failures throw `ApiError(status, code, message, param, details)`; actions map codes to field messages (`conflict` on `POST /workspaces` → "This slug is already taken"). `param` lets the onboarding guide attach a provider rejection to the field that caused it.
- `unwrap` JSON-round-trips every payload: Treaty revives ISO strings into `Date`s at runtime but the derived types say `string`; the round-trip makes the runtime shape match so loader data serializes predictably.

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
| `/:slug/onboarding/*` | The setup flow (below): one route with a splat (`/`, `/:channel`, `/:channel/:provider`), its own focused shell outside the workspace nav. One route rather than nested ones so the card can keep a fixed header and footer while only the content animates between steps |
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
- **Channel** (`/:slug/onboarding`, "Connect a channel"): `ChoiceRow`s (icon tile, name, one-line description, chevron) for every channel from `catalog.ts`: Push notifications and Email are available; SMS and Web push render dimmed with a `Soon` badge. A channel with a credential shows `Connected` and stays clickable. Rows share one sliding highlight (`useAnimatedIndicator`, the same mechanic as menus and the settings nav): a `bg-a2` pill glides to the hovered row, fades out when the pointer leaves, and scales to `0.9925` on press; the `IconTile` brings its own `bg-4/70` hairline ring; rows draw no background of their own, never move, and cast no shadow.
- **Provider** (`/:slug/onboarding/:channel`, "Choose a push provider"): the same rows per provider, platform as small badges (Apple `iOS`, Firebase Cloud Messaging `Android`; Resend, with Postmark and SendGrid listed as `Soon`). Every channel shows this step, even with one live provider, so the choice is explicit. Footer: `Back`.
- **Connect** (`/:slug/onboarding/:channel/:provider`): the provider guide, **one sub-step at a time**.
- **The card has three slots** (`OnboardingShell`): a header that switches instantly, a content area wrapped in `StepTransition` (`components/onboarding/shared/transitions.tsx`), and a footer anchored below it. Every view of the funnel (channels, providers, each guide sub-step, the connected state) produces `{ title, description, content, footer }` (`OnboardingSlots`); the route component picks the slots for the current URL and guide state and hands them to the shell. The transition is keyed by view + sub-step and its direction comes from a numeric position (`channels 0 < providers 100 < guide 200+n < connected 900`), stored in state the moment the key changes, so Back always slides back. Because the footer lives outside the animated region, it simply rides the card's height animation (`SizeAnimator`, 400ms to match the spring) instead of jumping. The guide's state lives in `useProviderGuide`, keyed by provider; its Next button submits the content's form by `form` id since they sit in different slots. The Apple guide follows the real 2026 portal flow: Keys → Register a New Key (tick APNs, Configure) → Configure Key (Environment `Sandbox & Production`, Key Restriction `Team Scoped`, which Apple locks after saving) → Register and Download → Key ID from View Key Details → Team ID from the portal header (`Team name - TEAMID`, top right) → bundle ID from Identifiers.

### The provider guide

The guide is the heart of the onboarding. Inside the card: the sub-step's title and one-line description as the card header (there is no static guide title; the step is the header, and it switches instantly while the content below animates), the illustration (a `bg-2` panel whose inner box keeps the mock's own `16/10` ratio, so the padding reads the same on every side), an optional outbound link (`Open Keys`, `Open the Firebase console`, …), and the field(s) this sub-step produces. The footer carries `Back`, `n of N`, and `Next` (enabled once the sub-step's fields are valid; Enter in a field does the same) or, on the last sub-step, the connect action. Sub-steps swap with a 0.4s bounce-0 spring, directional (`AnimatePresence mode='popLayout'` so the entering step starts while the leaving one is still on its way out): the leaving step slides a full width away, scales to 0.85 and blurs to 2px (no fade, so it has to leave completely); the entering one comes from a full width on the other side, scaling up from 0.85 while its 4px blur resolves to zero. Row pages (channels, providers) never scale: whatever is on the other side, a row page enters and leaves with the slide and a 1 to 1.5px blur only. The 0.85 scale and heavier blur belong to preview pages (guide steps, connected) in both directions, so going back from a guide to the provider list means the guide scales out while the list slides in flat. The card edge clips the slide horizontally and the animator's own box clips vertically via a `clip-path` inset that is open on the sides, so a step that shrinks the card never spills under the footer inside a `SizeAnimator` that bleeds past the card padding so shadows and the slide never clip; the centered `n of N` counter rolls with NumberFlow on the same 400ms curve and the primary label swaps from `Next` to the connect label with `TextSwap` (NumberFlow-style vertical roll with masked edges, the button width springs to fit).

- Each guide (`components/onboarding/guides/apns.tsx`, `fcm.tsx`, `resend.tsx`) is an ordered list of sub-steps: title, description, link, note, **fields**, illustration. Fields sit inside the step that produces them: the `.p8` drop zone under "Download the .p8 file", the Key ID input under "Copy the Key ID", the service-account JSON drop under "Upload the JSON file". There is no environment picker: the API detects it from the key. While a file-field sub-step is showing, **the whole page is the drop target**: dragging a file anywhere raises a full-screen overlay (portal, blurred backdrop, dashed panel) that already judges the type mid-drag from the MIME info the browser exposes (unknown types pass, clearly wrong ones turn the panel red and say what is expected); on drop the file name and type are checked against the field's `accept` list, a wrong file is rejected inline under the drop zone without being read, and a right one is read in the browser (`file.text()`) and submitted as a hidden field; the APNs `.p8` is checked for a PKCS #8 header and the Firebase JSON for `project_id` / `client_email` / `private_key` before anything is sent.
- **A refresh keeps your place.** The sub-step lives in the URL (`?step=n`, written with a replace navigation that `shouldRevalidate` exempts from re-running the loader, so even the server render lands on the right step) and the non-secret answers (Key ID, Team ID, bundle ID, which fields were touched) live in `sessionStorage` per workspace and provider, cleared on success. **Secrets are never stored in the browser**: the `.p8`, the service-account JSON and the Resend key have to be dropped or pasted again after a reload, and the guide steps back to that field if a later step was open.
- **The connect form always carries every field of the guide**, including fields on sub-steps that were skipped because their value was derived (the Key ID read from `AuthKey_<ID>.p8`); only the visible steps decide what the user sees, never what gets sent. When the API points an error at a field on a skipped sub-step, that sub-step is un-skipped and shown with the error; an error that points at no field at all is shown under the last sub-step, so a rejection is never silent. The primary button never changes its `type`: it is always a plain button that calls `requestSubmit()` on the last sub-step (a button that flips to `type='submit'` inside the click that reaches the last step would be submitted by the browser's default action on that very click). The derived map is persisted alongside the public values, so the step list and `?step` numbering survive a reload.
- **Validation waits for you to finish.** A field's error appears when you leave it or press Enter, never while you type; editing a field that already shows an error hides the error again until the next blur or Enter. Enter on a valid field is the same as Next.
- **Fields that can be derived are.** A file field may `derive` other values from the file (the APNs `.p8` is named `AuthKey_<KEYID>.p8`, so dropping it fills the Key ID), and a step marked `skipWhenDerived` drops out of the sequence while every field it owns came from a derivation, so the Key ID step only appears when Apple's file name doesn't carry it. Example ids in placeholders and illustrations are invented but shaped like the real thing (ten uppercase alphanumerics).
- **Connect** posts one form (every field travels as a hidden input, so earlier sub-steps stay part of the submission) to the route action, which builds the `CredentialUpload` (`guides/upload.ts`) and calls `POST /v1/credentials` on the default tenant. The API validates with a real provider call and, for APNs, probes Sandbox and Production itself (one `.p8` covers both when the key was configured for both, so the guide asks for no environment) and answers with one credential per accepted environment. All `active` renders the connected state (environments listed), `unvalidated` (provider unreachable, which is what local `wrangler dev` on macOS produces for APNs) renders an amber "saved, not verified" state with `Validate again` (`POST /v1/credentials/:id/validate` for each), and a provider rejection (400) surfaces inline; when the API names a `param` the guide jumps back to the sub-step that owns that field.
- **Connected state**: same card, header with the provider glyph, a row list (status badge, environment, Team ID / Key ID / bundle ID, or project + service account), footer with `Add another channel` (only while other channels are unconnected) and `Go to the dashboard`.

Illustrations are composed from `components/onboarding/illustration/` primitives (`Browser`, `Sidebar`, `Page`, `PageTitle`, `MockButton`, `MockInput`, `MockCheckbox`, `MockRow`, `MockTabs`, `MockDialog`, `Spot`, `Callout`) and follow the structure and copy of the real Apple Developer, Firebase and Resend screens; the single sky `Spot` ring marks what to click or copy. They are tokens-only so they read as part of the product, sized for the card (the mock sidebar hides under `sm`), and meant to be tightened against real screenshots of those dashboards.

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
| `VITE_FORCE_THEME` | `apps/web/.env.local` (git-ignored), dev only | Pins the theme to `light` or `dark` while developing, ignoring the stored preference and the OS; the theme menu is inert while set |

The API's `DASHBOARD_URL` must be the dashboard origin (`http://localhost:5180` locally): it is the CORS origin and a BetterAuth trusted origin.
