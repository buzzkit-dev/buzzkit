# Roadmap

**Status: Phases 0–4 ✅ (the API milestone). Phase 5 in progress: dashboard phase 1 (foundation + onboarding) is built and awaiting review; the dashboard's own phase plan lives in [dashboard.md](dashboard.md).**

**Phases 8–9 and the webhooks item of Phase 10 are replaced by the engine phases E1–E8 in [engine.md](engine.md): an event-based engine on Durable Objects (one actor per subscriber, Agents SDK), Cloudflare Workflows (runs) and Tinybird (the event log, segments, timelines). E1 (Events) and E2 (Webhooks) are built.**

Deviations from the original plan, all deliberate:
- **Reordered after the API milestone:** dashboard first (Phase 5), then real-device verification + email (6), SDK (7), campaigns/segments + CLI (8), workflows (9). Full OneSignal feature parity — segments, rules, workflows — comes after the first dashboard version.
- Observability (OTel + Axiom via `@buzzkit/observability`) landed in Phase 4 instead of Phase 10 — one Worker reports as `buzzkit-api` / `buzzkit-queue` / `buzzkit-scheduler`.
- Event/audit ledger shipped with Phase 2 (webhooks build on it). Tenant selection uses the `BuzzKit-Tenant` header (Stripe-Account pattern) instead of path params.
- Phase 3 grew: topics + per-subscriber, per-channel preferences (the OneSignal gap); subscribers have **subscriptions** (push device / email address / later SMS) each with its own `enabled` mute; `/v1/client/*` with optional HMAC identity verification (valid proof always stamps `verified`); Resend as the first email credential; tenant `settings` JSONB; provider registry.
- Phase 4 delivered APNs **and** FCM `send()` through the registry (the abstraction proved itself a phase early); the Phase 0 spike endpoint is retired. The delivery layer is built to webhook-grade standards: append-only attempt ledger (request/response per attempt), one error taxonomy across providers with core-owned policy, durable progressive retries honouring Retry-After, self-chaining fan-out, batched counters, DLQ, reconciliation cron, message TTLs, and delivered/bounced states reserved for async-confirming channels.
- Deferred: invite email delivery needs the Email Sending domain onboarded; profile DELETE needs an ownership-handover story; once-verified-always-require-proof mode; per-subscription×topic preferences (mute + topic×channel compose to cover it).

The full build plan, staged into phases. Each phase ends in something shippable and verified. We go phase after phase, in order — a phase is not done until its **Done when** criteria pass.

**The product promise (what everything serves):** you sign up, upload your APNs key (and later FCM service account), and get a clean API to send push notifications. That's the whole onboarding. On top of that: code-first campaigns and workflows pushed via CLI, and a tenants API so platforms can offer the same thing to *their* customers. The hosted product is just a deployment of the framework's multi-tenant core.

**Priorities:** iOS (APNs) first. Product (API) before dashboard. Framework and platform are the same code — if the platform needs something the framework doesn't expose, the framework is wrong.

---

## Target architecture (snapshot)

```
                    ┌─────────────────────────────────────┐
  buzzkit SDK ──────┤                                     │
  @buzzkit/cli ─────┤  apps/api (CF Worker, Elysia)       │──── PostgreSQL (Drizzle, Hyperdrive)
  mobile apps ──────┤  /v1/* — tenant-scoped everywhere   │──── KV (provider token cache, sessions)
  apps/web ─────────┤                                     │──── Queues (send fan-out, retries)
                    └──────────────┬──────────────────────┘──── Workflows/DO (durable workflow runs)
                                   │
                          ┌────────┴────────┐
                          │ delivery layer  │
                          │ apns │ fcm │ …  │ ← providers behind one generic channel interface
                          └─────────────────┘
```

### Tenancy model (the core primitive)

```
workspace            ← hosted customer / self-hoster's org. Auth, members, billing boundary.
└── tenant (1..n)    ← the isolation boundary. Credentials, subscribers, devices, sends,
    │                  campaigns, workflows — ALL data hangs off a tenant. Never crosses.
    ├── credentials  ← encrypted APNs keys / FCM service accounts, per provider
    ├── subscribers  ← end-users identified by the customer's own external_id
    │   └── devices  ← push tokens with lifecycle (active → invalid)
    └── messages → deliveries (per device, with provider results + retries)
```

- **Every workspace gets a `default` tenant at creation.** A simple app developer never learns tenants exist — their keys, devices, and sends live in the default tenant. A platform calls `POST /v1/tenants` and gets the exact same machinery per customer. The simple case is a degenerate case of the multi-tenant one; there is no separate code path.
- **Every data-plane API is tenant-scoped.** Tenant keys imply their tenant; workspace keys and sessions select one via the `buzzkit-tenant` header (default tenant when absent) — the Stripe-Account pattern. Tenant-scoped keys are locked to one tenant.

### Cross-cutting conventions (from day one, inherited from feedbase)

- Response envelope `{ success, data, error, metadata }`; Sqids-encoded IDs; typed error classes.
- Soft delete only, everywhere (`deletedAt` + partial unique indexes).
- File-based routes (`modules/v1/<segment>/index.ts`), flat registration, thin handlers; domain logic in `src/api/<resource>/`.
- Every route declares exactly one scope (e.g. `tenant:send`, `workspace:manage`).
- Package self-references in `apps/api`; contract stays type-consumable for the SDK.

---

## Phase 0 — Foundations & de-risking

Finish the skeleton so every later phase drops into place, and kill the one technical unknown before building on it.

**Build**

- **APNs-from-Workers spike (do this first).** APNs requires HTTP/2 to `api.push.apple.com`. Verify a Worker can deliver a real push to a device with a p8 key (ES256 JWT via WebCrypto). If outbound HTTP/2 is a problem, decide the fallback now (e.g. a minimal delivery sidecar or provider-specific egress) — this decision shapes the delivery layer. FCM is plain HTTPS + OAuth2, no risk.
- `packages/database`: real Drizzle setup — `createDrizzle()` via Hyperdrive binding, `drizzle.config.ts`, local Postgres (docker compose, own port), migration workflow (`db:generate` / `db:migrate`).
- `apps/api` libs (ported from the feedbase template): error classes + global handler, response envelope with Sqids ID transformation, buffered logger, telemetry hooks (wired to real OTel/Axiom in Phase 4 via `@buzzkit/observability`).
- Wrangler bindings: Hyperdrive, KV, Queues (declared as they're needed, typegen after each change).
- Write `docs/architecture.md` and start `docs/data-model.md`; one file per API resource under `docs/api/` as resources appear.

**Key decisions:** confirm APNs egress path; Hyperdrive vs direct `postgres` connection for self-hosters (support both — Hyperdrive id is config).

**Done when:** spike push arrives on a physical iPhone from a deployed Worker; migrations run locally; `/v1/health` checks the database; envelope + error handling proven by tests.

---

## Phase 1 — Identity, workspaces & tenants

The control plane: who you are, your workspace, and the tenants API — the "create tenants of your own" promise.

**Build**

- BetterAuth (email/password + bearer sessions) — port the feedbase auth package pattern; session caching in KV.
- Tables: `workspace`, `workspace_member` (roles: owner/admin/member), `invite`, `tenant`.
- Workspace lifecycle: create (auto-creates the `default` tenant), rename, member management, invites.
- **Tenants API:** `POST/GET/PATCH/DELETE /v1/tenants` — name, slug, metadata. Deleting a tenant soft-deletes its whole subtree.
- **API keys:** `api_key` table — SHA-256-hashed secrets shown once, display prefix, `last_used_at`. Two kinds: workspace keys (`bk_ws_…`, full access across the workspace's tenants) and tenant keys (`bk_tn_…`, locked to one tenant). Scope system: routes declare `tenant:read|write|send`, `workspace:manage`, etc.; auth middleware resolves key → context (workspace, tenant, scopes) in one place.
- Auth middleware macro (feedbase-style): a route says `{ scope: 'tenant:send' }` and gets typed `tenant`/`workspace` in context — this is the multi-tenancy enforcement point; there must be no way to query data without a resolved tenant.

**Key decisions:** key format and scope taxonomy (locked here, hard to change later); whether tenant slugs are unique per workspace (yes) and addressable in paths (`/v1/tenants/:tenant/…` with workspace keys; implied for tenant keys).

**Done when:** end-to-end via curl — sign up, create workspace (default tenant appears), mint keys, create a second tenant, and verify a tenant key for tenant A gets a 403 touching tenant B. Isolation tests are part of the phase, not an afterthought.

---

## Phase 2 — Credential vault

"All you have to do is upload your keys." Storage, encryption, validation, lifecycle.

**Build**

- `credential` table: `tenant_id`, `channel` (`push`), `provider` (`apns` | `fcm`), encrypted payload, non-secret metadata (APNs: team id, key id, bundle id/topic, environment sandbox|production; FCM: project id, client email), `status` (`unvalidated` → `active` → `invalid`), `validated_at`.
- **Envelope encryption:** per-credential DEK (AES-256-GCM) wrapping the secret, DEK wrapped by a master key held as a Worker secret. Key-rotation story documented (re-wrap DEKs, never re-encrypt payloads). Secrets never appear in responses, logs, or errors — enforced by serializer, tested.
- Upload APIs: APNs `.p8` (+ team id, key id, bundle id) and FCM service-account JSON. **Validation on upload:** sign a real provider token and make a harmless authenticated call; store the result. Bad keys fail loudly at upload, not at first send.
- Lifecycle: replace (new version, old revoked), revoke, re-validate. One active credential per (tenant, channel, provider, environment).

**Key decisions:** credential granularity — credentials attach to the **tenant** (a tenant ≈ one app; a customer with several apps makes several tenants). Revisit only if real usage demands an app sub-entity.

**Done when:** upload a real p8 → `active`; upload garbage → clear validation error; encrypted-at-rest verified by inspecting rows; a credential decrypts only in the delivery path.

---

## Phase 3 — Subscribers & devices

Who you can reach, and the token lifecycle that keeps sends clean.

**Build**

- `subscriber`: `tenant_id`, `external_id` (the customer's own user id — the public identity in all APIs), `attributes` JSONB (fuel for segments later). Upsert semantics: identify-style API.
- `device`: `tenant_id`, `subscriber_id`, `platform` (`ios` | `android`), `token`, `status` (`active` | `invalid`), `last_seen_at`, last failure info. Unique on (tenant, token) with re-registration reassigning a token to a new subscriber (device changed hands).
- Registration API shaped for calls **from inside mobile apps**: `POST /v1/devices` with external_id + token + platform. **Public client keys** (`bk_pk_…`, safe to embed in an app binary): can register/refresh devices and identify subscribers, nothing else — a leaked client key must never read data or send.
- Lifecycle: refresh on launch bumps `last_seen_at`; invalidation hook (Phase 4 feedback loop flips `status`); scheduled cleanup cron for long-dead tokens.

**Key decisions:** none open — the public-key capability boundary is the security-sensitive review point.

**Done when:** register, re-register (token moves subscribers), list devices per subscriber via curl; client key privilege boundary covered by tests.

---

## Phase 4 — Send API + APNs delivery  🎯 **Milestone: the core product (iOS)**

After this phase the promise is real: sign up, upload APNs key, send push via one clean API call.

**Build**

- **Send API** — `POST /v1/messages`: target by `externalIds`, `deviceIds`, or (later) `segment`; notification body (title, body, badge, sound, deep-link data, platform overrides); `idempotencyKey`. Returns a message id immediately; delivery is async.
- Tables: `message` (request, target spec, counts, status) and `delivery` (one per device: status `pending → enqueued → sent | failed | token_invalid`, attempt count, provider response code, timestamps).
- **Queue pipeline:** API resolves targets → creates deliveries → enqueues to a Cloudflare Queue. Consumer batches per tenant/credential, sends, records results. Retries with backoff via `msg.retry({ delaySeconds })` for retryable failures (5xx, throttling), capped by `max_retries`; permanent failures fail fast.
- **APNs provider** (first implementation of the generic `PushProvider` interface — `send(credential, device, payload) → result`): ES256 JWT signing, **token cache in KV** (~50 min; APNs tolerates ≤1 h), `apns-topic`/`apns-push-type`/`apns-priority`/`apns-collapse-id` headers, full status mapping.
- **Feedback loop:** `410 Unregistered` / `BadDeviceToken` → device `status = invalid` + delivery `token_invalid`. This is what keeps token hygiene automatic.
- Delivery visibility API: `GET /v1/messages/:id` with per-delivery results.
- Rate limiting guardrails per tenant (simple, KV-based; real quotas in Phase 10).

**Key decisions:** payload schema — generic buzzkit shape with per-platform escape hatches (`apns: { … raw keys }`) so we never block advanced users.

**Done when:** the full loop on a physical iPhone — upload key, register device, `POST /v1/messages`, notification arrives, delivery row shows `sent`; invalid token produces `token_invalid` and flips the device; idempotent replays don't double-send.

---

## Phase 5 — Platform dashboard (`apps/web`)  🎯 **Milestone: the product**

The product face, pulled forward: the API is complete enough to operate, so the dashboard comes before the SDK, campaigns, and workflows. Code stays the source of truth; the dashboard operates the account and *observes* the code-defined world. The detailed plan, route map and auth architecture are in [dashboard.md](dashboard.md).

**Prerequisite ✅:** `@buzzkit/eden`, a typed client inferred from `@buzzkit/api/contract` (Eden Treaty, envelope-unwrapping; the same client the SDK wraps in Phase 7). `apps/web` loaders use it; no hand-written fetch types.

**Built in dashboard phase 1 ✅ (awaiting review)**

- `@buzzkit/ui`: the feedbase design system ported 1:1 (shadcn Base UI + Tailwind v4 tokens, Open Runde, Central Icons pipeline, `/ui` preview, `docs/design.md`).
- Auth pages (signup/login/logout/profile), workspace creation (default tenant created by the API), the floating shell (switcher, pill nav, account menu, theme), overview with the channel card and a live four-step setup checklist, Settings → General.
- **Onboarding = the product promise:** create workspace → pick a channel (push, email; SMS and web push marked soon) → pick a provider (APNs / FCM / Resend) → an illustrated step-by-step guide through the provider's own console that collects each credential field where it is produced → `POST /v1/credentials` validates live → connected state.

**Next dashboard phases** (one at a time, each reviewed before the next starts): 2 Settings (channels, API keys, members & invites, tenants + tenant switcher, audit log) · 3 Subscribers & topics · 4 Messages (send composer, message list, deliveries + attempt ledger) · 5 Tenant settings & hardening (identity verification, kill-switches, danger zones, email verification on sign-up) · 6 read-only views for the code-defined world once Phases 8–9 land.

**Done when:** a new user completes signup → key upload → test push entirely in the dashboard; everything the dashboard shows comes from the public API (no private backdoors — the framework test).

---

## Phase 6 — Real-device verification + email channel

What is left of the original "second provider" phase: the FCM provider, the registry, and per-platform routing shipped with Phase 4; this phase proves them on real devices and adds the second *channel*.

**Build**

- First deployment: Cloudflare account (Hyperdrive, `AUTH_CACHE` + `PROVIDER_CACHE` KV, `buzzkit-deliveries` + DLQ, cron), real APNs `.p8` and FCM service account, a test app registering both tokens; `scripts/smoke` sends one message and polls the attempt ledger. Verify `invalid_endpoint` → subscription invalidation and `Retry-After` handling against real providers; verify APNs environment detection against a real key (`BadDeviceToken` on the accepted host, `BadEnvironmentKeyInToken` on the other); verify that Cloudflare's pooled HTTP/2 connections to APNs never carry two tenants' keys on one connection (Apple rejects tokens from multiple developer accounts over a single connection).
- Email through the same fan-out: `channel: 'email'` payload shape (`subject`, `html`/`text`, per-tenant `from`), `resend.send` via the registry, `delivered`/`bounced` written from Resend webhooks (the funnel counters already reserve them).
- Whatever the second channel forces us to bend in the provider interface gets fixed **in the interface**, not with special cases.

**Done when:** one `POST /v1/messages` reaches an iPhone and an Android device from a deployed Worker; an email message reaches an inbox with `delivered` confirmed; provider interface has no `if (apns)` leaks; docs/api updated.

---

## Phase 7 — `buzzkit` SDK: the developer experience

The framework's public face. This is where "feels like a framework, not a platform" gets earned.

**Build**

- **Typed client** in `packages/buzzkit`, inferred from the API contract (Eden Treaty over `@buzzkit/api/contract`, envelope-unwrapping, exactly like feedbase — entity types derived, never hand-written):

  ```ts
  const buzzkit = new Buzzkit({ apiKey });                    // default tenant, simple case
  await buzzkit.send({ to: 'user_123', title: 'Hey', body: '…' });

  const tenant = buzzkit.tenant('acme');                       // platform case — same client
  await tenant.credentials.apns.upload({ key, teamId, keyId, bundleId });
  await tenant.send({ to: [...], … });
  ```

- Subpath organization inside the one package: `buzzkit` (client + send), `buzzkit/config` (definition primitives for Phase 8), later `buzzkit/channels`, `buzzkit/workflows`.
- Devices/subscribers namespaces; typed errors; retry/backoff on the client for transient failures.
- Docs: quickstart (native iOS/Android snippets for token registration → SDK on the backend), `docs/api/` complete for everything shipped.

**Key decisions:** publishing pipeline (changesets, npm) — set up now even while versions are 0.x.

**Done when:** a demo backend (fresh project, `bun add buzzkit`) registers a device and sends to a phone in under ~20 lines; types flow end-to-end with zero hand-written entity types.

---

## Phases 8–9 — The engine (events, webhooks, segments, campaigns, workflows, iOS SDK, code)

Superseded by [engine.md](engine.md), which carries the design and the phase table **E1 Events → E2 Webhooks → E3 Segments → E4 Campaigns → E5/E6 Workflows → E7 iOS SDK + local delivery → E8 Code (builders, `buzzkit push`)**. What changed from the original Phases 8–9: the stored, versioned spec is the source of truth and the API is the way in (the CLI is diff + apply on top, last); product events are a stream through a per-subscriber Durable Object actor into Tinybird, not rows in Postgres; runs execute on Cloudflare Workflows; segments compile to ClickHouse SQL; campaigns are scheduled sends to a segment; webhooks move up from Phase 10 to E2.

---

## Phase 10 — Production hardening

Everything the hosted version needs to take real traffic, all of it useful to self-hosters too.

**Build**

- Quotas & rate limits per workspace/tenant (hosted free tier needs ceilings); usage counters; an app-level KV/DO-backed limiter for `/v1/auth/*` and `/v1/client/*` (WAF rules are the deployment requirement until then).
- Credential re-encryption sweep: re-seal every credential under the current master-key version so old versions can be retired.
- Observability: ✅ OTel tracing + Axiom logging landed in Phase 4 (`@buzzkit/observability`: api/queue/scheduler services, drizzle + better-auth spans, per-invocation logs). Remaining: delivery metrics dashboards, queue-depth visibility, alerting on provider error spikes.
- Retention: expire `delivery_attempt.request/response` and `message.payload` after a configurable window (Svix retains payloads 90 days; Stripe events 30 days) — the ledger rows stay, the bodies go. Before enabling it, move attempt bodies into a 1:1 `delivery_attempt_body` side table partitioned by `created_at` so retention is a partition drop, not an UPDATE storm on a hot append-only table; `bigint` ids + BRIN on `created_at` (already in place) make the id cut-off for a date cheap. Deliberately **not** partitioning the ledgers themselves: partition keys would have to join every unique index the idempotency guards rely on.
- Queue scale-out: shard `buzzkit-deliveries` across N queues (Cloudflare's documented answer to the 5,000 msg/s per-queue cap) once a single tenant needs more than ~300k deliveries/minute; split fan-out into K independent id-range chains per message at the same time (today one message fans out as one serial chain of 500-row pages).
- Opt-out-default topics at scale: drive fan-out from a `(topic_id, channel, subscriber_id) where opted_in` preference index instead of the tenant's subscription range.
- Cache the workspace-key → default-tenant resolution (today one indexed read per data-plane request for workspace keys and sessions).
- Idempotency: accept `Idempotency-Key` as a header (Stripe/Svix/Resend convention) in addition to the body field, and reject reuse with a different payload.
- Analytics API + dashboard cards: sends, delivery rate, failures by reason, token churn.
- Audit log for control-plane actions (key created, credential replaced, member added).
- Security pass: credential-handling review, key-rotation runbook, dependency audit; comprehensive isolation test suite as a permanent CI fixture.

**Done when:** a load test (thousands of deliveries across many tenants) completes with visible traces, correct retry behavior, accurate analytics, and zero cross-tenant leakage.

---

## Phase 11 — Open-source release & self-hosting

Ship the framework to the world; the hosted product becomes deployment #1.

**Build**

- **Self-host guide:** wrangler-based deploy (own Cloudflare account), Postgres options (docker compose / Neon / Supabase), secret setup, one-command bootstrap script.
- Config split: everything hosted-specific (quotas, billing hooks) behind env config so the OSS deploy is the same code with different config.
- npm publishing: `buzzkit` (+ CLI bin) via changesets; API versioning policy (`/v1` stability statement).
- Public docs site (can start as the `docs/` folder rendered), README polish, examples repo (simple app + multi-tenant platform demo), LICENSE, contribution guide.
- Launch checklist: seed demo, landing page on `apps/web` index.

**Done when:** a stranger with a Cloudflare account and a Postgres URL gets from `git clone` to a test push on their own infrastructure using only the docs.

---

## Explicitly later (not in these phases)

- Additional channels as connectors: SMS (Twilio/Vonage — a pricing wedge: OneSignal meters sending, we ride the customer's provider), **in-app messaging** (a pull channel: SDK fetches `/v1/client/messages`; OneSignal caps this at one active message), **Live Activities** (APNs push-to-start/update tokens — fits the subscription model as a token variant), web push, WhatsApp.
- **Routing rules** — segment→provider, geo rules ("US users via Resend, rest via Mailgun"), percentage traffic splits. These are LOGIC, so they live in the code-defined layer (Phase 8 versioned specs, like segments/campaigns — also what makes them AI-writable), never in tenant settings and never in a channel table. Until then: one credential per channel = the provider.
- Newsletter-platform integrations — email subscriptions + topics already form newsletter infrastructure.
- Native device SDKs (Swift/Kotlin/Expo packages) beyond documented REST registration — revisit after Milestone feedback.
- Billing for the hosted version.
- Visual workflow builders, AI engagement features — never, per the design principles.

## Pending decisions (tracked, not blocking)

| Decision | Phase | Leaning |
|---|---|---|
| APNs egress from Workers (HTTP/2) | 0 | Spike decides; fallback = minimal delivery sidecar |
| CLI inside `buzzkit` package as `bin` vs `@buzzkit/cli` | E8 | Fold into `buzzkit` (sst-style); `push` is diff + apply over the definitions API |
| Workflow runner: CF Workflows vs Durable Objects | 8 | **Decided** (engine.md): Cloudflare Workflows for runs, a Durable Object actor per subscriber for state, ordering and timers; Tinybird for the event log |
| App sub-entity under tenant | 2 | No — tenant ≈ app; multiple apps = multiple tenants |
