# Roadmap

**Status: Phases 0–4 ✅ (Phase 4 built, awaiting review) — next: Phase 5 (real-device verification of APNs/FCM delivery; email sending via the provider registry).**

Deviations from the original plan, all deliberate:
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

## Phase 5 — FCM delivery (Android) + channel abstraction proven

Adding the second provider is the test that the delivery layer is actually generic.

**Build**

- FCM HTTP v1 provider: OAuth2 access token from service-account JWT (RS256 via WebCrypto), cached in KV (~55 min); FCM message mapping (notification + data, android config); error mapping (`UNREGISTERED` → invalidate token, `QUOTA_EXCEEDED`/5xx → retry).
- Whatever the second provider forces us to bend in the `PushProvider` interface gets fixed **in the interface**, not with special cases — this frozen interface is the template every future channel connector (email, SMS, web push) follows.
- Send API targets both platforms transparently: one message fans out to a subscriber's iOS and Android devices, each via its provider.

**Done when:** one `POST /v1/messages` reaches an iPhone and an Android device; provider interface has no `if (apns)` leaks; docs/api updated.

---

## Phase 6 — `buzzkit` SDK: the developer experience

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

- Subpath organization inside the one package: `buzzkit` (client + send), `buzzkit/config` (definition primitives for Phase 7), later `buzzkit/channels`, `buzzkit/workflows`.
- Devices/subscribers namespaces; typed errors; retry/backoff on the client for transient failures.
- Docs: quickstart (native iOS/Android snippets for token registration → SDK on the backend), `docs/api/` complete for everything shipped.

**Key decisions:** publishing pipeline (changesets, npm) — set up now even while versions are 0.x.

**Done when:** a demo backend (fresh project, `bun add buzzkit`) registers a device and sends to a phone in under ~20 lines; types flow end-to-end with zero hand-written entity types.

---

## Phase 7 — Code-first campaigns & segments + `@buzzkit/cli`

Config as code, pushed like a deploy. The sst/Alchemy moment.

**Build**

- **Definition primitives** in `buzzkit/config`:

  ```ts
  export const dormant = defineSegment('dormant-users', {
    where: (u) => u.attribute('plan').eq('free').and(u.lastSeen().olderThan('7d')),
  });

  export const winback = defineCampaign('winback', {
    segment: dormant,
    schedule: cron('0 10 * * MON'),
    message: { title: 'We miss you', body: '…' },
  });
  ```

  Definitions compile to a **versioned, serializable spec** (JSON) — the builder API is DX; the spec is the contract the server executes. This split is what keeps everything generic across channels.
- Tables: `segment`, `campaign` — each with immutable versions (definition JSONB, checksum, deployed_by, deployed_at); the dashboard will only ever *read* these.
- **CLI (`@buzzkit/cli`):** `buzzkit login` (or key via env), `buzzkit push` (build definitions → diff against deployed versions → apply), `buzzkit diff`, `buzzkit list`. Deploys are atomic per tenant.
- Execution: segment evaluation compiles to SQL over subscribers/attributes/`last_seen_at`; campaign runs fan out through the existing Phase 4 queue pipeline (a campaign run is just a big message); scheduled campaigns via cron trigger scanning due schedules.
- `event` table + `POST /v1/events` (track API): name, subscriber, properties — needed by workflows next phase and by event-based segments.

**Key decisions:** spec versioning semantics (in-flight campaign runs pin their version); CLI folding into the main `buzzkit` package as its `bin` (sst-style, `bunx buzzkit push`) vs staying separate — decide when the CLI takes shape, lean toward folding in.

**Done when:** define a segment + scheduled campaign in a demo repo, `buzzkit push`, watch the cron fire and phones buzz; a second push with a changed message shows a real diff and bumps the version.

---

## Phase 8 — Workflow engine

The deep end: multi-step, long-running, conditional engagement logic — fully code-defined, channel-generic.

**Build**

- **Definition API** (same compile-to-spec approach):

  ```ts
  export const onboarding = defineWorkflow('onboarding', {
    trigger: onEvent('user.signed_up'),
    steps: (w) => {
      w.wait('10m');
      w.send({ title: 'Welcome!', … });
      w.wait('1d');
      w.branch(w.subscriber.event('app.opened').within('3d'), {
        then: (w) => w.send({ title: 'Pro tip…', … }),
        else: (w) => w.send({ title: 'Need a hand?', … }),
      });
    },
  });
  ```

  Triggers: `onEvent(...)` (with property filters), `cron(...)`, subscriber-created. Steps: `wait` (duration or until-condition with timeout), `send`, `branch`/conditions (event happened / attribute check / interacted-with-previous-message), `cancelIf` (exit early on event).
- **Durable execution:** one run per (workflow version, subscriber). Preferred engine: **Cloudflare Workflows** (durable steps + sleeps built in); fallback design: Durable Object per run with alarms. Spike both at phase start, pick once, wrap behind our own runner interface either way — self-hosters on plain Workers must not be locked out.
- `workflow`, `workflow_run` tables (state, current step, wake_at, history). Event ingestion routes events → trigger matching → run creation/resumption.
- Versioning semantics: in-flight runs finish on their pinned version; new triggers use the latest.
- Run visibility API: list runs, inspect a run's step history (dashboard reads this later).

**Key decisions:** the runner engine (Workflows vs DO) — the one real architecture decision left; condition language power (start with the closed set above, no arbitrary code server-side).

**Done when:** the signup→wait→send→branch flow from the definition above runs end-to-end against real events with real waits (compressed clocks in tests); a redeploy mid-run doesn't break in-flight runs; runs are inspectable via API.

---

## Phase 9 — Platform dashboard (`apps/web`)

The product face. Code stays the source of truth — the dashboard operates the account and *observes* the code-defined world.

**Build**

- Port the feedbase design system: `packages/ui` (shadcn + Tailwind v4 tokens, icon pipeline), same look and feel; wire `@buzzkit/eden`-style typed API access from loaders.
- Auth pages (signup/login), workspace creation & member management, invites.
- **Onboarding flow = the product promise:** create workspace → upload APNs key (drag-drop `.p8`, validated live) → grab API key → send a test push to your registered device. Minutes, not hours.
- Tenant management (list/create — mirrors the API), credential management per tenant, API key management (create/revoke, shown-once secrets).
- Subscribers & devices browser; message log with per-delivery status and provider errors (the debugging surface).
- Campaigns/segments/workflows: **read-only views** of deployed versions + run history, with "deployed via CLI vX" framing baked into the UI.

**Done when:** a new user completes signup → key upload → test push entirely in the dashboard; everything the dashboard shows comes from the public API (no private backdoors — the framework test).

---

## Phase 10 — Production hardening

Everything the hosted version needs to take real traffic, all of it useful to self-hosters too.

**Build**

- **Webhooks:** delivery events (`message.completed`, `device.invalidated`, `workflow.run.completed`) to customer endpoints — queue-backed with signed payloads, retries, reconciliation cron (feedbase webhook pattern).
- Quotas & rate limits per workspace/tenant (hosted free tier needs ceilings); usage counters.
- Observability: ✅ OTel tracing + Axiom logging landed in Phase 4 (`@buzzkit/observability`: api/queue/scheduler services, drizzle + better-auth spans, per-invocation logs). Remaining: delivery metrics dashboards, queue-depth visibility, alerting on provider error spikes.
- Retention: expire `delivery_attempt.request/response` and `message.payload` after a configurable window (Svix retains payloads 90 days; Stripe events 30 days) — the ledger rows stay, the bodies go.
- Queue scale-out: shard `buzzkit-deliveries` across N queues (Cloudflare's documented answer to the 5,000 msg/s per-queue cap) once a single tenant needs more than ~300k deliveries/minute.
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
- **Routing rules** — segment→provider, geo rules ("US users via Resend, rest via Mailgun"), percentage traffic splits. These are LOGIC, so they live in the code-defined layer (Phase 7 versioned specs, like segments/campaigns — also what makes them AI-writable), never in tenant settings and never in a channel table. Until then: one credential per channel = the provider.
- Newsletter-platform integrations — email subscriptions + topics already form newsletter infrastructure.
- Native device SDKs (Swift/Kotlin/Expo packages) beyond documented REST registration — revisit after Milestone feedback.
- Billing for the hosted version.
- Visual workflow builders, AI engagement features — never, per the design principles.

## Pending decisions (tracked, not blocking)

| Decision | Phase | Leaning |
|---|---|---|
| APNs egress from Workers (HTTP/2) | 0 | Spike decides; fallback = minimal delivery sidecar |
| CLI inside `buzzkit` package as `bin` vs `@buzzkit/cli` | 7 | Fold into `buzzkit` (sst-style) |
| Workflow runner: CF Workflows vs Durable Objects | 8 | CF Workflows, wrapped behind our own runner interface |
| App sub-entity under tenant | 2 | No — tenant ≈ app; multiple apps = multiple tenants |
