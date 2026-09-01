# Engine

Events, workflows, segments, scheduled sends — the engagement layer over the send API. **Status: design (2026-08-26), decided stack, no phases yet.** Part 1 is the architecture, part 2 is the developer and product experience through real apps. Roadmap Phases 8–10 are superseded by this.

> **Events are facts about a user. Workflows react to them with time and state. Segments are filters over users. A scheduled message sends to a segment at a moment, or at each user's own. Every send goes through the same preferences, providers and ledger.**

---

## Part 1 — The stack

### 1.1 Four systems, each doing the one thing it is best at

```
 iOS SDK · server SDK · integrations
              │  POST /v1/events · /v1/client/events
              ▼
      ┌─────────────────┐    RPC     ┌────────────────────────────────┐
      │ API (Worker)    │ ─────────► │ Subscriber actor (DO, Agents   │  ← durable ack, order, projections,
      │ Elysia, global  │            │ SDK) — one per subscriber      │    triggers, waits, timers
      └─────────────────┘            └───────┬───────────────┬────────┘
              │                              │ create/send   │ outbox
              │ definitions (Postgres)       ▼               ▼
              │ pushed to KV        ┌──────────────┐   ┌────────────┐   Events API   ┌──────────────┐
              │                     │ Cloudflare   │   │ Queue      │ ─────────────► │ Tinybird     │
              │                     │ Workflows    │   │ (batching) │                │ (ClickHouse) │
              │                     │ = runs       │   └────────────┘                └──────┬───────┘
              │                     └──────┬───────┘                                        │ endpoints
              ▼                            ▼ send                                            ▼
      ┌─────────────────┐          ┌──────────────┐                            segments · explorer · timelines
      │ Postgres        │ ◄─────── │ messages →   │                            run history · analytics
      │ (what *is*)     │          │ deliveries   │  (existing pipeline)
      └─────────────────┘          └──────────────┘
```

| System | Owns | Why this one |
|---|---|---|
| **Postgres** (existing) | *What is*: tenancy, credentials, subscribers, subscriptions, topics, preferences, messages/deliveries, the audit ledger, and the **definitions** (workflow / segment + immutable versions) | Relational, transactional, modest volume. Unchanged. |
| **Subscriber actor** — a Durable Object per subscriber, built on the Agents SDK | *What is true for this user this instant*: ordered inbox (rolling window), projections (`count(name)`, `last(name)`, last seen, timezone), active runs, pending waits/cancels, per-user timers, the flush watermark. **The durable ack for an event.** | Single-threaded per user → ordering and exactly-once trigger decisions for free; located near the device; hibernates when idle; scales to tens of millions of instances because nothing is shared. |
| **Cloudflare Workflows** | *Runs*: one durable instance per (workflow, subscriber, trigger) | Native `sleep` to 365 days, `waitForEvent`, retried steps, `terminate`, idempotent `createBatch`; idle instances cost nothing. |
| **Tinybird** | *Everything that happened*: every product and engine event, forever-ish; segments, the Events explorer, timelines, run history, analytics | ClickHouse with an ingest API, materialized views, typed endpoints, JWT row-level isolation, local Docker runtime, and a code-first project that lives in the monorepo. |

The rule that keeps it fast: **nobody queries the wrong store.** A workflow condition never scans Tinybird (the actor already holds the count); a segment never touches actors (one Tinybird query); the dashboard never reads actor state for lists (Tinybird); the runtime never reads Postgres per event (definitions are pushed to KV).

### 1.2 The Agents SDK, and why the actor is built on it

Cloudflare's `agents` package is a class, `Agent`, that *is* a Durable Object with batteries: an embedded SQLite (`this.sql`), persisted state, **`schedule(when, method, payload)`** — a delay, a date or a cron, tens of thousands per instance, multiplexed over the DO's single alarm slot — plus `runWorkflow()` with `onWorkflowComplete / onWorkflowError` callbacks, routing by name (`getAgentByName(env.ACTOR, id)`), and WebSockets we don't need. It was built for AI agents; underneath it is exactly "a per-entity actor with a scheduler and a database", which is what a per-subscriber engine is. It runs wherever Durable Objects run — Cloudflare's network — with each instance pinned to one location, active only while handling a call or an alarm. We pin the version and use it as a runtime, not a framework.

### 1.3 The event

```json
{
  "id": "01J6…",  "sequence": 4127,           // uuidv7 at ingest; per-subscriber sequence from the actor = the order
  "name": "workout.completed",           // yours; `$…` is reserved for buzzkit
  "source": "ios",                       // server | ios | android | web | system
  "externalId": "user_42",
  "timestamp": "…", "receivedAt": "…",
  "data": { "workoutId": "w_1", "duration": 42 },
  "run": null, "message": null           // set on engine events
}
```

- `POST /v1/events` (secret key, `source: server`, ≤100 per call) · `POST /v1/client/events` (client key, `source` from the platform, ≤100 per call, identity verification as everywhere). Unknown `externalId` → the subscriber is created. Optional `idempotencyKey` per event; a replay is a 200 no-op. `data` ≤8KB; names `[a-z0-9_.-]{1,100}`; `timestamp` may be up to 7 days in the past (offline queue).
- **Reserved SDK events**: `$app.opened`, **`$app.backgrounded`** (the quiet moment — a push waiting on `$app.opened` lands while the app is foregrounded and iOS suppresses the banner, so "background + 5 min" is the useful anchor), `$session.ended`, `$notification.delivered` (from the Notification Service Extension: real receipts that APNs never provides), `$notification.opened` (`{ messageId, action }`), `$permission.changed`, `$identify` (attributes snapshot). **Engine events**: `$run.started / step / completed / canceled / failed`, `$send`, `$message.sent`, and the **subscriber lifecycle** that today lives in the audit ledger: `$subscriber.created`, `$subscription.registered / muted / removed / invalidated`, `$preferences.updated`, `$delivery.sent / failed / invalid`. Rule: **the actor is the source of truth for anything about a subscriber; Postgres for anything about the workspace or tenant.** The audit ledger keeps control-plane facts only (who did what: tenants, keys, members, credentials, webhooks, definitions published) plus tenant-level `message.completed` for API and scheduled messages — workflow sends are per-subscriber `$send` + receipts, never a million `message.completed` rows.
- **Trust is declared on the trigger**: `sources: ["server"]` for anything financial or security-relevant; behavioral events accept any source.

### 1.4 Ingestion: the actor acks, Tinybird follows

1. The API validates, resolves the subscriber (Postgres, cached), and makes **one RPC to the subscriber's actor** with the batch.
2. The actor, in one SQLite transaction: dedupes on `idempotencyKey`, assigns `sequence`, appends to the inbox, updates projections. The **outbox is a watermark** (`last_flushed_seq`): everything above it is unflushed, so an event costs one row write, not two. Then it evaluates triggers, waits, cancels (below). **The 202 goes out after this** — the actor's SQLite is the durability point, exactly as "the ledger insert is awaited before the response" is today.
3. Rows above the watermark flush to **Queue `buzzkit-events`** (`waitUntil`, alarm-driven retry until the queue accepts, then the watermark advances); the consumer takes up to 100 messages, each a batch, gzips one NDJSON body and POSTs it to Tinybird's **Events API** (`/v0/events?name=events`, 202 = accepted, `successful_rows` / `quarantined_rows` checked; a malformed row lands in quarantine, never poisons the batch). At-least-once end to end; Tinybird dedupes on `id` (`ReplacingMergeTree`, `ENGINE_VER sequence`).
4. Why the queue: the Events API allows 100 requests/s per data source (100MB each, best-effort beyond — plenty once batched); a million actors POSTing individually is the one thing not to do. Ingest-to-queryable latency is seconds.

Ordering is free: a DO is single-threaded, so two `workout.completed` for one user are processed one after the other, the second sees five and the first saw four. `sequence` is the order everywhere downstream. Definitions reach the actor through KV (`defs:{tenantId}` → active workflows' trigger/concurrency/cancel/schedule metadata + a version stamp; the actor reloads on change); the spec body is fetched once per run at create time.

### 1.5 Runs: the actor decides, Workflows execute

On every accepted event the actor does four lookups against its own SQLite:

1. **Triggers** — workflows whose `trigger.event` matches, whose `sources` allow, whose `where` passes against `{ trigger, subscriber, projections }`; `concurrency` (`per-event` | `one-per-subscriber`, with `restart`) checked against `runs`. Then `env.ENGINE.createBatch([{ id, params }])` with the deterministic id `${tenant}:${workflow}:${subscriber}:${sequence}` (idempotent: an existing id is skipped) and `params = { versionId, spec, subscriber, trigger, projections }`. `$run.started` to the outbox.
2. **Waits** — `waits(runId, event, where, expiresAt)`: a match → `env.ENGINE.get(runId).sendEvent({ type: "evt:<path>", payload })` (Workflows buffers it if the instance has not reached the wait yet).
3. **Cancels** — `cancelOn` match → `instance.terminate()`, `$run.canceled`.
4. **Schedules** — `trigger: { schedule: { daily: "19:00", timezone: "subscriber" } }` registers one `this.schedule()` per active subscriber; on fire the actor evaluates `where` and creates a run like an event would.

**`EngineWorkflow` is one class that interprets the spec pinned in its params**, so a redeploy never touches an in-flight run:

| Spec step | Workflows primitive |
|---|---|
| `wait: "2h"` | `step.sleep(path, "2 hours")` — free while sleeping, to 365 days |
| `waitUntil: { after: "trigger", plus: "2d", at: "09:00", timezone: "subscriber" }` | `step.do` reads `$timezone` fresh → `step.sleepUntil(path, t)`; anchored, so chains never drift |
| `waitFor: { event, as, until, where }` | `step.do("register")` → actor · `step.waitForEvent(path, { type, timeout })` in try/catch · `step.do("deregister")` on timeout; `Promise.race` for "whichever first" |
| `fetch: { as, url, onError }` | `step.do(path, { retries: { limit: 3, delay: "10s", backoff: "exponential" }, timeout: "30s" }, signedPost)` → `variables[as]` (≤64KB) |
| `branch: { if, then, else }` | `step.do` evaluates and records which way; recurse |
| `send: { name, topic, channel, title, body, data, deliver }` | `step.do(path, () => createMessage({ to: [externalId], idempotencyKey: runId + path, … }))` — the existing pipeline, untouched. `deliver: "local"` → see 1.7 |
| `set: { attribute | variable }` · `exit` | `step.do` · return |

Every step reports to the actor (`record(runId, path, status, summary)`) → `$run.step` → Tinybird holds the complete timeline. Expressions (shared with segments): `ref` paths with `eq | neq | gt | gte | lt | lte | in | exists | contains`, projection conditions (`{ count: "workout.completed", within: "30d", gte: 5 }`, `{ occurred: "$app.opened", since: "trigger" }`, `{ opened: "welcome" }`), `all | any | not`. Templates: path lookups, a few filters, a ternary. No loops, no code; `fetch` is the escape hatch.

**Limits that shape the product, not the code**: instance creation is 100/s per workflow — event triggers never notice; a schedule trigger that starts a workflow for a million people takes ~3 hours by design, so broadcasts are messages (the existing fan-out) and workflows are per-user timing. 50k *running* instances at once; sleeping and waiting ones do not count. Steps are metered (~$45 per million six-step runs).

### 1.6 Tinybird: the project, the tables, the endpoints

Tinybird is a **code-first project inside the monorepo** — `packages/tinybird`, defined with the TypeScript SDK (`defineDatasource`, `defineMaterializedView`, `defineEndpoint`, with `InferRow` / `InferParams` giving the API Worker typed rows and parameters — the same end-to-end typing we have through Eden), deployed with `tb deploy` from CI, developed against **`tb local`** in Docker (also in docker compose next to Postgres, and in the test suite), with a **branch per PR** and `FORWARD_QUERY` for schema migrations. Tinybird's agent skills and MCP server plug into the same workflow we already use for the rest of the repo.

One Tinybird workspace serves the whole hosted product; every row carries `tenant_id` (and `workspace_id`), every endpoint takes `tenant_id` as a parameter, and **JWTs with `fixed_params`** pin it: the API mints a short-lived JWT per dashboard session (`GET /v1/events/token`, a public API feature customers can use to embed the same explorer), and the browser queries Tinybird endpoints directly with the tenant filter that cannot be overridden — no proxy hop for charts and live tails. Ingest uses a static `DATASOURCE:APPEND` token held only by the queue consumer.

```ts
// packages/tinybird/events.ts (TypeScript SDK; the CLI emits the .datasource/.pipe files)
export const events = defineDatasource('events', {
  schema: { tenant_id: t.uint64(), subscriber_id: t.uint64(), external_id: t.string(),
            id: t.string(), sequence: t.uint64(), name: t.lowCardinality(t.string()), source: t.lowCardinality(t.string()),
            timestamp: t.dateTime64(3), received_at: t.dateTime64(3), data: t.json(), data_raw: t.string(),
            run_id: t.nullable(t.string()), message_id: t.nullable(t.string()), step: t.nullable(t.string()) },
  engine: engine.replacingMergeTree({ ver: 'sequence',
    sortingKey: ['tenant_id', 'name', 'subscriber_id', 'timestamp', 'id'],
    partitionKey: 'toYYYYMM(timestamp)', ttl: 'timestamp + toIntervalMonth(13)' }),
});
```

Materialized views (incremental, on ingest — "insert triggers"): `events_by_subscriber` (sorted by subscriber then time: the timeline), `event_names_hourly` (`AggregatingMergeTree`: tenant × name × source × hour → count, uniq subscribers, sources: the catalog and the charts), `subscriber_attributes` (`ReplacingMergeTree` fed by every attribute snapshot on the stream, `$subscriber.created` / `$subscriber.updated` / `$identify`: the **attribute mirror**, so a segment never joins Postgres), `subscription_state` and `subscriber_activity` (E3: the channel state and the first / last device activity per subscriber, also from the stream), `runs_current` (`ReplacingMergeTree` by run fed by `$run.*`: the runs list and the live counts), `sends_current` (fed by `$send` + `$notification.delivered/opened`: per-message engagement, the fatigue signal). Endpoints, each a typed pipe with parameters, for the fixed shapes: `subscriber_timeline`, `event_catalog`, `event_volume`, `runs`, `run_counts`, `run_steps`, `live_tail`. **Segments are not static pipes** — an arbitrary boolean tree cannot be a templated endpoint — so the segment compiler emits ClickHouse SQL (attribute predicates on `subscriber_attributes`, event predicates as `GROUP BY subscriber_id HAVING`, keyset-paged by `subscriber_id`) and runs it through Tinybird's **Query API** (`POST /v0/sql`, a `DATASOURCES:READ` token held by the API only). Queries time out at 10s and return ≤100MB — segment previews answer in tens of milliseconds.

A segment send pages `segment_members` (500 ids at a time), resolves subscriptions in Postgres, and hands them to the existing fan-out; the message stores `{ segment, segmentVersionId }`, and a scheduled one its `schedule` and the zones already released. Tinybird is seconds behind the actor; segments and dashboards accept that, and anything that must be exact and immediate (conditions, concurrency, caps) asks the actor. Sinks (S3 / GCS / Kafka) give customers their own events back later without us building an export.

Self-hosting: the OSS deploy needs a Tinybird workspace (free tier for small deployments; `tb local` for development). The two seams — `append(batch)` through the Events API and reads through published endpoints — are deliberately narrow so a plain ClickHouse adapter could exist one day; nothing is built for it now.

### 1.7 The iOS side: quiet moments and local notifications

The Swift SDK is not a token registrar with a `track()` bolted on; it is half the engine.

- **Quiet-moment delivery.** `{ "wait": { "for": "5m", "after": "$app.backgrounded", "unless": ["$app.opened"] } }` is the right way to say "the next time the user is not looking", and a foreground-arriving push can be shown as a banner only if the delegate opts in, which the SDK exposes as `showWhileActive: true` per message.
- **`deliver: "local"`.** A `send` can be delivered **as an on-device local notification**: the cloud sends a silent push (`content-available`) carrying the content plus a fire time (or a local-time rule); the SDK schedules it with `UNCalendarNotificationTrigger` — exact to the second, in the device's own timezone, and it fires with the radio off. The SDK cancels pending local notifications tagged with a run when the run is canceled (a cancel push) or when a local event the rule names occurs (`cancelOnLocal: ["workout.completed"]`) — the streak reminder disappears the moment the workout is logged, no round trip. Delivered/opened still flow back as `$notification.delivered/opened`.
- **Device runtime (later, same spec).** The subset `schedule → where (on-device projections) → send local → cancelOn` needs no cloud at all; the SDK can interpret it from a rules bundle fetched at identify, so the streak reminder works in airplane mode and the server sees the events when the device is back. One spec, two runtimes.

### 1.8 Scale and cost, decisively

Everything runs on Cloudflare's network; nothing is a single box. The API Worker is stateless and global. **One actor per subscriber means a million users are a million independent single-threaded state machines** — no hot table, no lock, no shard key to choose; the Agents SDK is documented to "tens of millions of instances". Workflows: unbounded sleeping instances, 50k running, 100 creates/s per workflow. Queues: 5,000 msg/s per queue, each message a batch; shard when the numbers say so. Tinybird: 100 Events API requests/s × up to 100MB per data source — with batching, effectively unbounded events/s; endpoint queries interactive. Postgres keeps only the hot paths it already has (subscriber upsert, message create).

**The cost model, re-based on real event volume.** With the reserved SDK events a normal app produces ~100 events per MAU per month (≈15 sessions × `$app.opened` / `$app.backgrounded` / `$session.ended`, ~30 custom events, ~10 notification receipts). Session boundaries only, no heartbeats — the SDK never emits a `$` event that is not a fact. Per 1M MAU / 100M events / 5M runs a month, list prices:

| Line | Driver | Estimate |
|---|---|---|
| Workers requests | ~45M API calls (events arrive batched per session) | ~$10 |
| Actor requests + duration | ~45M RPCs + flush alarms, milliseconds each | ~$15 |
| Actor SQLite rows written | one row per event; the outbox is a **watermark** (`last_flushed_seq`, one write per flush), not a row per event | ~$50–100 |
| Queues | ~20M batch messages × 3 ops | ~$25 |
| Workflows | 5M runs × ~4 steps = 20M steps; invocations within the included 10M | ~$160 |
| Tinybird | Developer base $49; storage ~25GB/month compressed, 13-month TTL → ~$20/month; **compute is the variable** — 100M rows/month is ~40 inserts/s for ClickHouse, so 1 vCPU (≈$500/month at the burst rate) should carry ingest, MVs and dashboard queries; budget 0.5–1.5 | ~$250–800 |
| **Total** | | **≈ $500–1,100 / month**, i.e. **$0.0005–0.001 per MAU** and **≈ $5–10 per million events**, all-in |

Workflows cost scales with *runs*, not events — most events trigger nothing. What a single customer costs at the margin: a **20k-MAU app (2M events, 100k runs)** is ~$10–20/month of infrastructure; a 5k-MAU app is a few dollars; the two fixed bases (Workers Paid $5, Tinybird $49) are shared by every tenant on the hosted platform. A free tier of 10k MAU / 1M events costs us under $10 per free customer per month. For reference, the same 1M MAU is five figures a month at Customer.io or Braze, and 100M events is five to six figures at Novu Cloud (which meters triggers) or Segment (which meters tracked users); analytics-priced products (PostHog) land at low thousands for 100M events. The levers if a line surprises us: the watermark outbox (rows written), batch size (queue ops), folding branch evaluation into the following step (Workflow steps), and MV design + TTL (Tinybird compute and storage).

---

## Part 2 — How it feels

### 2.1 The surfaces

**iOS SDK** (Swift):

```swift
Buzzkit.configure(clientKey: "bk_pk_…")
Buzzkit.identify("user_42", identityHash: session.buzzkitHash)   // hash from your backend
Buzzkit.registerForPush()                                          // permission → token → subscription; $permission.changed
Buzzkit.track("workout.completed", ["duration": 42, "kind": "run"])
// automatic: $app.opened, $app.backgrounded, $session.ended, $notification.opened (UNUserNotificationCenter hook)
// NotificationServiceExtension: `final class NSE: BuzzkitNotificationService {}` → $notification.delivered, rich media, local scheduling
BuzzkitPreferencesView()                                           // the settings screen: topics × channels
```

Events queue in SQLite offline, batch on foreground and every 30s, carry a UUID and the original time, and are dropped once acked. A replay is a no-op on our side.

**Server SDK** (`buzzkit`, TypeScript, typed over the contract):

```ts
const buzz = new Buzzkit({ apiKey });
await buzz.events.track({ externalId: 'user_42', name: 'trial.started', data: { plan: 'monthly', endsAt } });
await buzz.send({ to: 'user_42', topic: 'price-alerts', title: 'Price drop', body: '…' });   // direct, no workflow
```

**Definitions** — one JSON spec per version, written in the dashboard's editor (the lint inline) or sent to `POST /v1/workflows`. Workflows are never defined from customer code (decided 2026-08-29): the `buzzkit` package is the server SDK and holds nothing about workflows; the builder-style sketches below are illustrations of the shapes, not an API.

**Dashboard**:

- **Events** — the catalog: every name with 24h / 7d volume, unique users, sources, last seen, listening workflows; a live tail; a per-name page with the volume chart, sample payloads and the inferred field list (what `where` and templates can reference). Backed by `event_names_hourly`; charts and tail query Tinybird directly with the session's JWT.
- **Workflows** — list with active / sleeping / waiting counts; the workflow page renders the spec as a **vertical step list** with live numbers per row ("1,204 sleeping here · 87 waiting for `trial.canceled`"), a code tab, versions, runs. The run page is a timeline: trigger, every step with its recorded output ("branch → else", "fetch → 200 in 340ms", "send → msg_… delivered 17:31, opened 17:32"), variables, subscriber. **Test** runs the spec against a pasted event with waits collapsed and sends stubbed.
- **Subscriber profile** — one timeline merging product events, engine events and deliveries; active runs ("`trial` · sleeping until Thu 09:00 local · step 5 of 7"). Recent rows from the actor, history from Tinybird.
- **Segments** — a builder of rows (attribute · event count · never · last seen · channel), the count updating as you edit; a members preview; "Send to segment" with a Send field: now, at a time in a zone, or at each subscriber's own time.

### 2.2 Real apps

Each: what the developer runs today without buzzkit, and what they write with it.

#### Fitness app — streak at risk, and rate-us at the next quiet moment

*Without*: a `streaks` table; a cron every 15 minutes bucketing users by a timezone you have to collect and keep fresh; "no workout today and streak ≥ 3"; a `sent_today` guard; quiet hours for travellers; an APNs client with token invalidation; and a client-side counter for the review ask that needs an app release to change "fifth" to "third".

*With*:

```ts
export const streak = defineWorkflow('streak-at-risk', {
  trigger: schedule({ daily: '19:00', timezone: 'subscriber' }),
  where: all(count('workout.completed', { since: 'localMidnight' }).eq(0), attribute('streakDays').gte(3)),
  steps: (w) => w.send({ topic: 'reminders', deliver: 'local', cancelOnLocal: ['workout.completed'],
                         title: '{{ subscriber.attributes.streakDays }}-day streak at risk', body: 'Ten minutes keeps it alive.' }),
});

export const review = defineWorkflow('review-ask', {
  trigger: onEvent('workout.completed', { where: count('workout.completed').eq(5) }),
  concurrency: 'one-per-subscriber',
  steps: (w) => { w.afterBackground('5m'); w.send({ data: { prompt: 'review' }, silent: true }); },
});
```

The actor holds `streakDays` and the workout count and owns the 19:00 timer; the reminder is scheduled *on the phone*, exact to the second, and vanishes the moment the workout is logged. The review ask waits, for free, until the user has put the phone down for five minutes. Changing "five" is a `push`.

#### Price tracker — the three-day trial (your app)

*Without*: a `trial_sequences` table with `step` and `next_at`; a worker polling it every minute; an App Store Server Notifications handler updating rows on cancellation; three message builders that count checks per watched product; APNs; a dedupe key per step; a cleanup for converted users.

*With*: the Apple webhook handler tracks two server events, one endpoint answers one question, one definition.

```ts
// backend, on App Store Server Notifications
await buzz.events.track({ externalId, name: 'trial.started', data: { endsAt } });
await buzz.events.track({ externalId, name: 'trial.canceled' });
await buzz.events.track({ externalId, name: 'subscription.started' });

// the one question buzzkit will ask, verified like a webhook
app.post('/buzzkit/trial-status', verifyBuzzkitSignature, async ({ subscriber }) =>
  ({ checks: await countChecks(subscriber.externalId), product: await firstWatchedProduct(subscriber.externalId) }));

export const trial = defineWorkflow('trial', {
  trigger: onEvent('trial.started', { sources: ['server'] }),
  concurrency: 'one-per-subscriber',
  cancelOn: [onEvent('subscription.started')],
  steps: (w) => {
    w.wait('2h');
    const status = w.fetch('status', 'https://api.example.com/buzzkit/trial-status');
    w.branch(status.get('checks').gt(0), (w) =>
      w.send({ topic: 'trial', title: 'Already {{ status.checks }} price checks', body: 'We are watching {{ status.product }} for you.' }));
    const cancel = w.waitFor('trial.canceled', { as: 'cancel', until: w.trigger.plus('1d') });
    w.branch(cancel.exists(),
      (w) => w.send({ title: 'Your trial is canceled', body: 'Alerts continue until {{ trigger.data.endsAt | date }}.' }),
      (w) => { const s = w.fetch('status', '…/trial-status'); w.send({ body: 'We have checked {{ s.product }} {{ s.checks }} times so far.' }); });
    w.waitUntil(w.trigger.plus('2d'), { at: '09:00', timezone: 'subscriber' });
    w.send({ title: 'Your trial ends tomorrow', body: "{{ cancel ? 'Resubscribe to keep your alerts.' : 'Nothing to do — your alerts continue.' }}" });
  },
});
```

`trial.started` → actor → run created → the instance sleeps two hours → `fetch` asks your server, retried on failure → branch → `waitFor` parks the instance while the actor watches for `trial.canceled`; Apple's cancellation eighteen hours later is forwarded and the canceled branch runs, otherwise the wait times out at exactly trigger + 1 day → the final wait snaps to 09:00 in the user's timezone → send. `subscription.started` at any point terminates the run. The run page shows every step including both fetch responses. Price drops are `buzz.send(...)` from the scraper: no timing, no workflow.

#### E-commerce — abandoned checkout

*Without*: a `carts` table with `updated_at`; a cron for carts older than an hour joined against `orders`; a `reminded_at` column; the item name denormalized for the copy; APNs; a rule not to nag twice a day.

*With*: `Buzzkit.track("checkout.started", ["itemName": item.name, "total": cart.total])` in the app, and:

```ts
export const abandoned = defineWorkflow('abandoned-checkout', {
  trigger: onEvent('checkout.started', { where: ref('trigger.data.total').gt(20) }),
  concurrency: 'one-per-subscriber',
  cancelOn: [onEvent('order.placed', { sources: ['server'] })],       // only your server can say "bought"
  steps: (w) => { w.wait('1h'); w.send({ topic: 'reminders', title: 'Still thinking about it?',
                  body: '{{ trigger.data.itemName }} is waiting in your cart.', data: { deepLink: 'app://cart' }, skipIfSentWithin: '1d' }); },
});
```

#### Transactional with preferences — "your order shipped"

*Without*: a settings screen, a `notification_preferences` table, an endpoint, a check on every send path. Most teams ship an all-or-nothing toggle.

*With*: topic `orders`, `BuzzkitPreferencesView()` in the app, `buzz.send({ to, topic: 'orders', title: 'Shipped', body: 'Arrives Thursday.' })`. No event, no workflow. "Remind about delivery only if it wasn't opened" later is a workflow on `$notification.delivered` with `opened("shipped")` — the event the app never had.

#### Re-engagement — segments, scheduled sends, and knowing when to stop

*Without*: an analytics export for 14-day-inactive users, a Monday script in their timezone, and no way to know a push was delivered, let alone that the last three were ignored.

*With*:

```ts
export const dormant = defineSegment('dormant', { where: all(channel('push'), lastSeen().olderThan('14d'), attribute('marketingFatigue').neq(true)) });
export const winback = defineWorkflow('winback', {
  trigger: onSchedule('0 10 * * MON', { timezone: 'subscriber', segment: dormant }),
  steps: (w) => w.send({ topic: 'marketing', title: 'We kept your spot', body: 'Three new routes near {{ subscriber.attributes.$city }}.' }),
});
export const fatigue = defineWorkflow('marketing-fatigue', {
  trigger: onEvent('$notification.delivered', { where: ref('trigger.data.topic').eq('marketing') }),
  steps: (w) => w.branch(all(count('$notification.delivered', { where: { topic: 'marketing' }, within: '30d' }).gte(3),
                             count('$notification.opened',    { where: { topic: 'marketing' }, within: '30d' }).eq(0)),
                         (w) => w.set({ attribute: 'marketingFatigue', value: true })),
});
```

The segment is one Tinybird endpoint (the builder's count updates as you toggle rows); the schedule trigger starts one run per dormant user at their own 10:00 and `send` is the normal fan-out; `$notification.delivered` from the NSE makes the third definition possible at all; `set` removes the user from the segment next Monday.

#### A platform — one app builder, a thousand tenant apps

*Without*: per-customer APNs keys, a pipeline that picks the right one, and every workflow above multiplied by every customer.

*With*: each customer's app is a tenant with its own key (as today); provisioning creates its definitions from a code template:

```ts
await buzz.tenant('acme-pod').workflows.upsert(newEpisode({ topic: 'new-episodes' }));

export const newEpisode = ({ topic }) => defineWorkflow('new-episode', {
  trigger: onEvent('episode.published', { sources: ['server'] }),
  steps: (w) => {
    w.send({ topic, title: '{{ trigger.data.show }}', body: 'New: {{ trigger.data.title }}', data: { episodeId: '{{ trigger.data.id }}' } });
    w.wait('3d');
    w.branch(not(occurred('episode.played', { since: 'trigger', where: { episodeId: ref('trigger.data.id') } })),
             (w) => w.send({ topic, title: 'Missed one?', body: '{{ trigger.data.title }} is {{ trigger.data.minutes }} minutes.' }));
  },
});
```

One server event per publish; each listener's app tracks `episode.played`; a thousand tenants share one engine, one dashboard, one bill.

### 2.3 In one line

> **buzzkit turns your app's events into perfectly timed notifications — on your own providers, open source, iOS-native first.** Track from the app or the server; define timing once; buzzkit keeps the state, the clocks, the preferences and the receipts.

---

## Decisions taken (2026-08-26)

- **Actor window**: 90 days or 10k events, whichever is smaller; `within` on conditions is bounded by it, longer windows are answered by a Tinybird query inside a `step.do`.
- **One-off timing belongs to messages** (`schedule` on `POST /v1/messages`: a moment in a timezone, or each subscriber's own); **recurring timing belongs to workflows** (schedule triggers over a segment, E6). Nothing is expressible twice. Campaigns as an entity were built (E4, 2026-08-28) and removed the same day: a campaign was a message with a schedule, and every peer (OneSignal Messages + Journeys, Knock Broadcasts + Workflows, Braze Campaigns + Canvas) has exactly segment, scheduled send and workflow, never a fourth object. **Broadcasts** (a dashboard composer over `POST /v1/messages { segment, schedule }`) arrive with email; a campaign as a segment-bound history of periodic sends is a later idea, not a v1 object.
- **`deliver: "local"`** shipped with E8: a `waitUntil` followed by a `send { deliver: "local" }` is fused — the message is created and sent as a silent push (`bk.local`, wall-clock fire time in the subscriber's zone, `cancelOn` from the unconditional cancel rules) when the wait *begins*, the run sleeps as usual, and canceling the run sends a `bk.cancel` push (the actor's `cancelLocal` port). A standalone local send fires immediately on the device. Every outbound push now carries `bk.messageId` (and `bk.image`), and `POST /v1/client/identify` accepts merged `attributes`.
- **Retention**: events and run history 13 months in Tinybird (TTL); delivery attempts stay in Postgres for now.
- **Audit log stays in Postgres; subscriber lifecycle moves to the stream** (1.3). Webhooks read both sources.
- **OSS floor**: a Tinybird free workspace; `tb local` for development.
- **A deleted subscriber's actor is orphaned** (2026-08-27): the actor is keyed by the subscriber's numeric id, so an `externalId` that is deleted and later seen again gets a new subscriber row and a fresh actor; the old timeline stays in Tinybird under the old id and the old actor's storage is unreferenced. Deletion severs history on purpose; reclaiming the old actor's storage is a follow-up (a final flush, then `deleteAll`).
- **Ids order within a request, `sequence` orders the stream**: `uuidv7` is monotonic per isolate and millisecond (a 12-bit counter); across isolates or after 4096 ids in one millisecond only `sequence` is authoritative.
- **Nothing is parked, nothing loops forever** (2026-08-27): the events dead-letter queue re-drives into the main queue every ten minutes with an error log per cycle for seven days from the first failure, then drops the batch with a final error log, the actor never prunes above its watermark, and rollups are at-least-once (exact counts come from `events FINAL`); a replay that repopulates a rollup is an incident runbook, not a product feature.

## E5 plan — Workflows I (drafted 2026-08-29, for review before code)

The phase builds the smallest workflow that is real end to end: an event starts a run for one subscriber, the run sleeps, waits for another event, branches, sends through the normal message pipeline, and every step lands on the stream and in the dashboard. Everything that needs data from outside (`fetch`, templates beyond plain paths, `set`, projection conditions, local-time waits, schedule triggers, the dry run) is E6 and is designed for here, not built.

### The spec

One JSON document per version, validated by `@buzzkit/schema/workflows` (a lint that checks paths, step names and references, exactly like `buzzkit/expressions`) plus the API's TypeBox schema, so the API and the dashboard share one definition.

```jsonc
{
  "trigger": { "event": "trial.started", "sources": ["server"], "where": { "ref": "trigger.data.plan", "eq": "monthly" } },
  "concurrency": "one-per-subscriber",          // or "per-event" (default)
  "cancelOn": [{ "event": "subscription.started" }],
  "steps": [
    { "name": "settle", "wait": "2h" },
    { "name": "cancel", "waitFor": { "event": "trial.canceled", "until": { "after": "trigger", "plus": "1d" } } },
    { "name": "outcome", "branch": { "if": { "ref": "steps.cancel.matched", "eq": true },
        "then": [{ "name": "sorry", "send": { "title": "Your trial is canceled", "body": "Alerts continue until the end." } }],
        "else": [{ "name": "nudge", "send": { "topic": "trial", "title": "Your trial ends tomorrow" } }] } },
    { "name": "final", "waitUntil": { "after": "trigger", "plus": "2d", "at": "09:00", "timezone": "UTC" } },
    { "name": "bye", "send": { "title": "Thanks for trying" } },
    { "exit": true }
  ]
}
```

- **Steps** carry a `name` (unique within the version, `[a-z0-9-]`, the address of everything about the step: its `$run.step` events, `steps.<name>.*` references, the per-step counts on the workflow page). `wait` takes a duration (`30m`, `2h`, `3d`, max 365d). `waitUntil` takes an anchor (`after: "trigger" | "steps.<name>"`, `plus`, optional `at` wall-clock and an IANA `timezone`; `"subscriber"` as the timezone is E6). `waitFor` takes an event name, an optional `where` over `{ event }`, and `until` (an anchor, or a duration); the step records `matched` and the event's `data` under `steps.<name>`. `branch` takes an expression over `{ trigger, subscriber, steps }` and two step lists. `send` is the message payload plus `topic`, `channel` (push only in E5), `deliver` (accepted, only `"push"` acts in E5). `exit` ends the run early.
- **Expressions** are the segment grammar over refs into `trigger.data.*`, `subscriber.attributes.*`, `steps.<name>.*`; no projections yet. The `buzzkit/expressions` lint gains the ref namespaces so an unknown root is an error at publish time.
- **Templates** in E5 are plain path lookups (`{{ trigger.data.endsAt }}`, `{{ subscriber.attributes.name }}`), no filters; a missing path renders empty and is recorded on the step.

### Data

- **Postgres**: `workflow` (tenant, `slug`, `name`, `description`, `status` `draft | active | paused`, `current_version_id`, timestamps, soft delete) and `workflow_version` (workflow, `version` int, `spec` jsonb, `published_at`, `created_by`), one immutable row per publish, `(workflow_id, version)` unique. Ids `wf_…`, `wfv_…`. A run is never a Postgres row.
- **KV `defs:{tenantId}`**: the active specs of a tenant as one JSON document `{ version: n, workflows: [{ id, slug, versionId, spec }] }`, written on every publish / pause / delete, read by the actor on first use and re-read when the actor sees a newer `version` on the next ingest (a cheap `defs-version:{tenantId}` key checked at most once a minute per actor). No actor holds a spec that was not published.
- **Attribute mirror in the actor**: the actor keeps the subscriber's current attributes in its own SQLite, replayed from the stream (`$subscriber.created` / `$subscriber.updated` replace, `$identify` merges), for the same reason Tinybird has `subscriber_attributes`: trigger `where` clauses over `subscriber.attributes.*` are evaluated on every ingest without touching Postgres, and a run pins the attributes it started with in its params, so branches and templates see one consistent snapshot even across Workflow replays. Postgres stays the source of truth for the profile; the mirror is derived and converges on the next attribute event.
- **Actor tables** (added to `ACTOR_SCHEMA`): `runs` (`run_id`, `workflow_id`, `version_id`, `status` `running | sleeping | waiting | completed | canceled | failed`, `step`, `started_at`, `updated_at`, `trigger_sequence`) and `waits` (`run_id`, `path`, `event`, `where`, `expires_at`, `type`). `concurrency` and `cancelOn` are answered from `runs`; the profile's "active runs" reads `runs` through a new `runs()` RPC.
- **Tinybird**: `runs_current` (ReplacingMergeTree by `run_id` fed by `$run.*`: tenant, workflow, version, subscriber, status, step, started, updated), endpoints `runs` (by workflow or one run id, optional status, keyset by `started_at, run_id`), `run_counts` (live runs per workflow, status and step: the list's numbers and the workflow page's per-step numbers) and `run_steps` (every event of one run in order, read from `events_by_subscriber` since the run id names the subscriber). Every `$run.*` event carries `workflowId`, `versionId` and `startedAt` so the view is built from any one of them. Existing `events` rows already carry `run_id` and `step`, so sends inside a run are on the timeline with no new column.

### Runtime

- **`ENGINE`**: a Cloudflare Workflows binding (`wrangler.jsonc` `workflows: [{ name: "buzzkit-workflows", binding: "ENGINE", class_name: "EngineWorkflow" }]`), one class interpreting the spec pinned in its params: `{ tenantId, subscriberId, externalId, workflowId, versionId, spec, trigger: { name, data, sequence, source }, runId }`. Instance id = run id = `${tenantId}:${workflowId}:${subscriberId}:${triggerSequence}`; `createBatch` with an existing id is a no-op, which is the duplicate-trigger guard.
- **Trigger matching** in `ingest()` after the event is accepted: for each active workflow, `trigger.event` equals the name, `sources` allow the source, `where` passes; `concurrency: one-per-subscriber` skips when `runs` has a live run of that workflow; `cancelOn` matches terminate live runs (`instance.terminate()`, `$run.canceled`). Then the run row, `$run.started` on the outbox, `env.ENGINE.createBatch`.
- **Step interpreter** (from 1.5): `wait` → `step.sleep`; `waitUntil` → `step.do` resolves the instant → `step.sleepUntil`; `waitFor` → `step.do` registers the wait on the actor → `step.waitForEvent(name, { type: "evt:<step>", timeout })` in try/catch → deregister; the actor forwards a matching event with `instance.sendEvent` and records `matched`. `branch` → `step.do` evaluates and records the side. `send` → `step.do` → `createMessage({ to: [externalId], idempotencyKey: "<runId>:<step>" })` + `enqueueFanout`, the message row carries `run_id` and `run_step` (serialized as `run: { id, step }`). `exit` returns. Each step ends with `record(runId, step, status, summary)` on the actor → `$run.step`; the run ends with `$run.completed` or `$run.failed` (an unhandled error after the step's retries), `$run.canceled` on terminate.
- **Time in tests**: durations are parsed once (`packages/schema/src/workflows/parse/duration.ts`), and the Worker reads `WORKFLOW_TIME_SCALE` (a `.dev.vars` number, `1` in production, `0.001` in the test API) applied at the sleep boundary, so "2h" sleeps 7.2s under test and the trial workflow runs end to end in under a minute without a fake clock. Deterministic anchors (`after: trigger`) are computed then scaled the same way.

### API

Tenant routes, `workflows:read` (member, key-grantable) and `workflows:write` (admin, key-grantable), files mirroring the paths:

| Method | Path | Notes |
|---|---|---|
| GET | `/v1/workflows` | Every workflow with `status`, `trigger`, `currentVersion`, and live counts (`running`, `sleeping`, `waiting`, from `runs_current`) |
| POST | `/v1/workflows` | `{ slug, name, description?, spec }` → 201 `draft` with version 1 (spec validated, not published) |
| GET | `/v1/workflows/:slug` | The workflow with its current version's spec and the version list |
| PATCH | `/v1/workflows/:slug` | Name/description, or a new `spec` → version n+1 as draft (the published version keeps running) |
| POST | `/v1/workflows/:slug/publish` | Activates the latest version: `status: active`, `current_version_id`, KV rewritten; `workflow.published` |
| POST | `/v1/workflows/:slug/pause` | `paused`, removed from KV; live runs continue to completion (a pause is not a cancel) |
| DELETE | `/v1/workflows/:slug` | Soft delete, removed from KV, live runs terminated (`$run.canceled`, reason `workflow_deleted`) |
| GET | `/v1/workflows/:slug/runs` | Tinybird `runs`, `?status=` filter, keyset paged |
| GET | `/v1/runs/:id` | One run: the row from `runs_current` plus its `run_steps`, and, while live, the actor's fresh view |

Audit + webhook events: `workflow.created / updated / published / paused / deleted`. Stream events (`$run.started / step / completed / canceled / failed`) are what the run pages and webhooks on the data plane read. Errors: `invalid_spec` (with the lint's path), `slug_taken`, `slug_reserved`, `workflow_not_active`, `event_reserved` (a trigger on `$run.*`).

### Dashboard (Messaging → Workflows)

- **List**: name with the trigger summary underneath ("on `trial.started` from server"), `WorkflowStatusBadge` (Draft gray / Active green / Paused amber), the live counts as three quiet numbers, Updated. **Create workflow** opens the editor.
- **Workflow page** (`/:slug/workflows/:workflowSlug`): header with Publish / Pause; the **Steps** tab renders the current version's spec as the vertical step list (one row per step, its kind glyph, its summary in words, the count of runs currently at that step from `runs_current`), the **Code** tab is the JSON spec in the design system's code editor with the lint's problems inline and Save → new draft version, **Versions** lists them with the published one marked, **Runs** is the runs table (subscriber, status, current step, started, updated) linking to the run page. E5 ships the JSON definition editor with a live preview (the same step list the workflow page renders) as the way to write a spec; a visual step builder is not planned before every workflow phase has landed, and is not considered mandatory (decided 2026-08-29).
- **Run page**: the timeline (trigger with its data, every step with its recorded outcome and time, the sends linking to their messages), the subscriber, the version.
- **Subscriber profile**: a **Runs** table (every run of the subscriber, newest first: workflow, step, status, updated) from the actor's `listRuns()`, each row linking to the run.

### Order of work

1. `@buzzkit/schema/workflows` (types, lint, duration parsing, unit tests).
2. Postgres tables + migration, `api/workflows` domain (CRUD, versions, publish → KV), routes, scopes, audit, tests.
3. Actor: `runs` / `waits` tables, defs loading, trigger matching, `$run.*` events, `runs()` RPC.
4. `EngineWorkflow` + `ENGINE` binding, the interpreter for the six steps, time scaling, the trial-minus-fetch workflow test end to end.
5. Tinybird `runs_current`, `runs`, `run_steps`; the runs and run endpoints.
6. Dashboard: list, workflow page (steps, code, versions, runs), run page, profile card.

Done when the E5 row below holds, plus: a paused workflow stops starting runs but a sleeping run of it still finishes; deleting a workflow cancels its runs; a spec with an unknown ref, a duplicate step name or a wait over a year is refused with the offending path; the KV document is rewritten on every publish and an actor picks it up on its next ingest.

## E6 plan — Workflows II (drafted 2026-08-29, for review before code)

E5 made a workflow a sequence in time. E6 gives it data (`fetch`, `set`, templates with filters), memory (conditions over what the subscriber did and what the run sent), a clock of its own (schedule triggers, local-time waits), manners (`afterBackground`, `skipIfSentWithin`), and a way to test a version without sending (`POST …/test`). Everything stays inside the E5 shape: a spec, pinned per run, interpreted by `EngineWorkflow`, decided by the actor.

### The spec, what grows

- **`fetch`**: `{ name, fetch: { url, as?, body?, onError?: "fail" | "skip" | "continue", timeout?: "30s" } }`. A signed `POST` (the webhook signature scheme from `buzzkit/webhooks`, so the customer verifies it the same way) carrying `{ subscriber, trigger, steps }`; the JSON reply (≤ 64 KB) lands under `steps.<name>.data` (and `vars.<as>` when `as` is given). `step.do` with the runtime's retries (limit 3, exponential from 10s) for 5xx / network errors; a 4xx is permanent. `onError` decides what a permanent failure does: `fail` (default) fails the run, `skip` records `steps.<name>.failed = true` and continues, `continue` continues with `data: null`. Only `https:` URLs; the tenant's outbound allowlist (a `workflow_fetch_hosts` tenant setting, default: any) guards it.
- **`set`**: `{ name, set: { attribute: "marketingFatigue", value: true } }` or `{ set: { var: "checks", value: "{{ steps.status.data.checks }}" } }`. Attribute writes go through the subscriber API (`$subscriber.updated` on the stream, the mirror and Tinybird follow); vars live in the run only.
- **Templates** get filters and a ternary: `{{ trigger.data.endsAt | date }}`, `{{ steps.status.data.checks | number }}`, `{{ subscriber.attributes.name | default: "there" }}`, `{{ vars.cancel ? "Resubscribe to keep your alerts." : "Your alerts continue." }}`. Filters use Liquid's names and take comma-separated arguments: text (`upcase`, `downcase`, `capitalize`, `strip`, `truncate`, `append`, `prepend`, `replace`, `pluralize`, `url_encode`, `json`), lists (`size`, `first`, `last`, `join`), numbers (`number`, `round`, `ceil`, `floor`, `abs`, `plus`, `minus`, `times`, `divided_by`, `modulo`, `at_least`, `at_most`), dates (`date`, `time`, `plus`/`minus` with a duration, `until`, `ago`) and `default`; `now` is a bare path. Not Liquid itself (no tags, no loops): every filter and argument is linted at save time. A template that fails to render records the step and renders empty, as today.
- **Conditions** over the subscriber's history, evaluated by the actor from its own tables (no Tinybird on the hot path): `{ count: "workout.completed", within: "30d" | { since: "trigger" | "localMidnight" }, gte: 5 }`, `{ occurred: "$app.opened", since: "trigger" }`, `{ opened: "<step>" }` (a `$notification.opened` for the message that step sent), `{ delivered: "<step>" }`. Usable in `trigger.where`, `branch.if`, `waitFor.where` and `cancelOn.where`; the same nodes in a segment keep meaning Tinybird.
- **Local-time `waitUntil`**: `timezone: "subscriber"` reads `$timezone` from the run's subscriber snapshot at the step, falling back to the spec's `defaultTimezone`, then to UTC; the step records which zone it used.
- **Schedule triggers**: `trigger: { schedule: { cron: "0 10 * * MON" } | { daily: "19:00" }, timezone: IANA | "subscriber", segment?: "<slug>", where? }`. The Worker's minute tick (E4's) finds the workflows whose schedule is due, zone by zone for `subscriber` timezones exactly like scheduled messages, resolves the segment (every subscriber when absent), applies `where` through the actor, and starts one run per member with the id `${tenant}-${workflow}-${subscriber}-${fireTime}` (idempotent: a tick that runs twice starts nothing twice). Runs start at the runtime's 100/s per workflow; the tick keeps a cursor so a million-member segment drains over hours instead of failing.
- **`afterBackground: "5m"`**: sugar for `waitFor $app.backgrounded` then `wait`, so a send lands when the user is not looking; a foreground `$app.opened` during the wait restarts it.
- **`skipIfSentWithin: "1d"`** on `send`: the step is skipped (recorded as `skipped`) when the run's subscriber already received a message with the same `topic` (or the same step name when there is no topic) inside the window; the actor answers it from its events.
- **`POST /v1/workflows/:slug/test`**: `{ version?: n, externalId | attributes, event: { name, data, source? }, at? }` runs the interpreter in **dry-run mode**: every wait resolves to the instant it would end (no sleeping), `waitFor` takes `assume: { "<step>": { matched, data } }` from the request or times out, `fetch` uses `assume` or is recorded as "would call `url`", `send` renders the payload and records it without creating a message, `set` records the write. The reply is the trace: the path taken, each step's summary, instants and payloads, the lint of the version it used. Works on drafts and old versions.

### As built (2026-08-29, steps 1 to 5)

**Grammar (`@buzzkit/schema/workflows`, `buzzkit/expressions`).** Decided the same day: workflows are never defined from customer code, so the workflow language left the public SDK for the private `@buzzkit/schema/workflows` package (types, lint, the parsers the lint needs, `describeDuration` / `describeSchedule`), the public `buzzkit/expressions` went back to the segment grammar (types + lint + `isExpression`, no TypeBox, no evaluator) with a `checkers` option through which the workflow lint plugs in `occurred`, `opened`, `delivered` and `since`, and everything that runs (TypeBox schemas in `api/segments/schema.ts` and `api/workflows/schema.ts`, `actor/evaluate.ts`, `engine/template.ts`, `api/workflows/cron.ts`, `libs/timezone.ts`) lives in the API. The three waits are `wait` (how long), `waitUntil` (which moment: `{ delay?, time?, timezone? }`, `delay` from the run's start) and `waitFor` (which event, with `timeout`); the quiet moment is `waitFor` with `settleFor` + `resetOn` (the event starts a clock, reset events restart it, an event that already happened more recently than any reset event starts it at once — and completes the step matched from that occurrence once the clock runs out, immediately if it already has; the actor's `quietAnchor` RPC returns that occurrence), decided with Christo on 2026-08-29 after `afterBackground` and a `wait` object form were tried and dropped. `branch` is a list of cases `{ name, when?, steps }`, first match wins, at most one `when`-less fallback and it is last, `taken` is the case name (`else` when nothing matched and there is no fallback); `exit` is the last step of its list, redundant at the top level, the way out of a branch case. `fetch` is a full request (`method`, `headers`, `body`, `expect.status`) with `{{ secrets.<name> }}` from the write-only `secrets` tenant setting in `url` and `headers`, and records `{ status, headers, data }`. Deviations from the sketch above: `since` is a sibling of `within` on `count` and `occurred` (`{ count: "workout.completed", since: "localMidnight", eq: 0 }`), not a nested `within: { since }`; workflows validate against `WorkflowExpressionSchema` (`ref`, `count`, `never`, `occurred`, `opened`, `delivered`) while segments keep `ExpressionSchema`, so a segment never sees a run-only node and the compiler refuses one; `opened` / `delivered` are checked against earlier send steps and are not available in triggers or cancel rules; `fetch.timeout` is `1s` to `60s`; `set.value` is a scalar (a lone-placeholder template keeps its type, `renderTemplateValue`); templates read `trigger`, `subscriber`, `steps` and `vars` only and `vars.<name>` must be written by a `set` or a `fetch … as` somewhere in the workflow; `http://localhost` and `http://127.0.0.1` pass the `https` rule so a self-hoster can fetch a local service; the package owns the cron parser (`parseCron`, `cronProblem`) and `describeSchedule` so the API and the dashboard read one schedule the same way; `nextScheduleInstant` and the zone helpers (`localTime`, `localInstant`, `localMidnight`) are the API's.

**History (actor).** `count`, `occurred`, `never`, `opened` and `delivered` are answered by the subscriber's actor from its own `events` table (`countEvents(name, from)`, `hasMessageEvent(name, runId, step)` joining a `$notification.*` event's `message_id` to the `$run.step` row that recorded the send; `message_id` is filled from `data.messageId` on ingest). `evaluateExpression` takes `{ history, now, since: { trigger, localMidnight } }` and the actor builds those options per event (`historyOptions`), with the zone from `$timezone`, then the spec's `defaultTimezone`, then UTC. The engine never evaluates a branch itself: `branch.if` goes through the actor's `evaluate(runId, expression, scope, timezone)` RPC so history conditions and `vars` resolve in one place (a dry run without a subscriber evaluates locally against an empty history). The Tinybird fallback for windows older than the actor's retained rows is **not built**: a history condition reads the last `ACTOR_RETAINED_ROWS` (10,000) events.

**Engine.** The quiet wait asks the actor `quietSince(after, unless)` and registers one wait row per `unless` event (the actor's `waits` table is keyed by run, step and event). `fetch` sends `webhook-id` (`{runId}:{step}`) and `webhook-timestamp` and authenticates with the tenant's write-only `secrets` in headers, sealed at rest like credentials and re-wrapped by the same sweep (the separate signing secret was dropped on 2026-08-30); an address that is not `https` (or `http://localhost`) fails the step with `fetch_blocked: …` before any request (the per-tenant host allowlist was dropped on 2026-08-30: set by the tenant, it protected nobody); 5xx and network errors retry three times from 10 seconds (scaled by `WORKFLOW_TIME_SCALE`), a 4xx is final and `onError` decides. `set` on an attribute reads the subscriber, merges the key (`null` removes it) and writes through `upsertSubscriber`, so `$subscriber.updated` reaches the stream and the mirror. `skipIfSentWithin` is answered from Postgres, not the actor: a message in the window with the same topic (or the same step of the same workflow) that has a delivery for the subscriber or was sent to them by a run. `afterBackground` asks the actor `inBackground()` (last `$app.backgrounded` after the last `$app.opened`), registers `$app.backgrounded` / `$app.opened` waits on the step and restarts on every reopen (at most 50 rounds). A skipped step is recorded with status `skipped` and the run stays `running`.

**Schedules.** `workflow_schedule` keeps one row per (version, fire instant, zone); every minute the tick records the fires of the last 10 minutes for each active schedule workflow (all IANA zones for `timezone: "subscriber"`, so idempotent across double ticks by the unique index) and drains open rows in rounds of 50, at most 3,000 starts per tick, paging members 500 at a time (a segment through Tinybird with the zone scoped in like scheduled messages, everyone else through Postgres with `attributes->>'$timezone'`, unknown zones falling into the workflow's `defaultTimezone`) and advancing `member_cursor` with a compare-and-set. Each member's actor gets `startScheduledRun`, which checks `where` (history included, `localMidnight` relative to the fire instant) and `concurrency`, and creates the run with id `{tenant}-{workflow}-{subscriber}-{fire epoch ms}`, so a repeated tick is a duplicate. The run's trigger is `$schedule` with `{ firedAt, zone }`. A schedule over a segment that does not exist is refused at create / update with `segment_not_found`; `GET /v1/workflows/:slug/schedule` lists the next fires per zone and the recent rows.

**Dashboard (step 6).** The flow draws fetch, set and after-background cards, a schedule head instead of the trigger card, the default timezone under the rules, and `skipped` steps in amber on a run's path; the workflow page gains a **Schedule** tab (`GET …/schedule`) for schedule workflows and a **Test** dialog (Code tab, every version) that posts to `POST …/test` and draws the dry run on the flow with its trace ([dashboard.md](dashboard.md)).

**Dry run.** `POST /v1/workflows/:slug/test` runs the same step files with `mode: "test"` on the `RunContext`: `do` calls through, `sleep` returns at once, `listen` reads `assume[step]` (`matched`, `data`), `fetch` reads `assume[step]` (`status`, `data`) or records `Would call host`, `send` renders the payload, checks the topic exists and records `Would send “title”` without a message, `set` records `Would set …` without writing, `afterBackground` records the wait. The reply is the trace (`steps` in order with status, summary and detail), `path`, `vars`, `outcome` / `error`, the version number and the lint of that version; works on drafts and old versions, for a real subscriber (history conditions answered by the actor) or for `attributes` alone.

### Data and runtime

- **Actor**: `runs` gains `vars` (JSON) is not needed, vars travel in the instance; `sends` per run are already events. New lookups over its own events table for `count / occurred / opened / delivered / skipIfSentWithin` (indexed by name and timestamp, bounded by `ACTOR_RETAINED_ROWS`, so a window longer than what the actor retains falls back to Tinybird's `subscriber_timeline` once and caches the count on the run).
- **Schedules**: a `workflow_schedule` cursor table in Postgres (`workflow_version_id`, `fire_at`, `zone`, `member_cursor`, `finished_at`), the minute tick's bookkeeping, mirroring `message.scheduled_zones` from E4.
- **`EngineWorkflow`**: `steps/fetch.ts`, `steps/set.ts`, template filters in `buzzkit/workflows/template.ts`, `resolveAnchor` reads the subscriber zone from the run's snapshot, and a `mode: "run" | "test"` on the context so the same step files produce the dry run.
- **Tinybird**: `$run.step` rows already carry everything the test trace and the run page need; `runs_current` gains nothing.

### API

| Method | Path | Notes |
|---|---|---|
| POST | `/v1/workflows/:slug/test` | The dry run above, `workflows:read`, never sends |
| GET | `/v1/workflows/:slug/schedule` | The schedule's next fire times per zone and the last tick's progress |
| PATCH | `/v1/tenants/:tenantSlug` | `workflowFetchHosts` allowlist |

Errors: `fetch_blocked` (not https), `schedule_invalid` (bad cron or daily time), `segment_required` for a schedule over a segment that does not exist.

### Dashboard

- The workflow page's flow renders the new step kinds (`fetch` with the host, `set` with the write, a schedule trigger card with its next fire and the segment chips) and the run page's path shows skipped steps and fetch outcomes.
- **Test** on the Code tab and on every version row: a dialog with the sample event, a subscriber picker (or attributes), assumptions per `waitFor` / `fetch`, and the result drawn on the flow: the path taken, each card annotated with what it would do, sends rendered in full.
- The Overview's Runs count schedule-started runs like any other.

### Order of work

1. `buzzkit/workflows`: schema, lint and types for `fetch`, `set`, templates with filters, the new conditions, schedule triggers, `afterBackground`, `skipIfSentWithin`; unit tests.
2. Actor: history lookups for the conditions and `skipIfSentWithin`, the subscriber snapshot with `$timezone` in run params; unit tests.
3. Engine: `fetch` (signing, retries, `onError`, the allowlist), `set`, filters, local-time `waitUntil`, `afterBackground`, `skipIfSentWithin`; the trial workflow **with** both fetches end to end.
4. Schedule triggers: the tick, the cursor table, zone batches, the segment membership feed, `GET …/schedule`; the streak and winback workflows end to end with compressed clocks.
5. Dry run: `mode: "test"` in the context, `POST …/test`, the trace shape; tests on drafts and old versions.
6. Dashboard: the new cards in the flow, the Test dialog and its result on the flow, schedule details on the workflow page.

Done when the E6 row below holds, plus: a fetch to a plain-http host fails the step with `fetch_blocked` and nothing leaks; a schedule over a 10k-member segment starts every run exactly once even when the tick runs twice; a dry run of the trial workflow shows both fetches, both branches' payloads and the local 09:00 instant for a Paris subscriber without creating a message.

## Phases

**E2 is implemented** (2026-08-27): [webhooks.md](webhooks.md) and [api/webhooks.md](api/webhooks.md). Deviations from the table: the actor has no second watermark, it sends every flushed batch to `buzzkit-webhooks` next to `buzzkit-events` under the one watermark (both sends must succeed); the reconciliation sweep runs on the existing five-minute cron with a one-hour lookback; every attempt is its own row (`webhook_attempt`), the payload lives once on `webhook_event`, and a rotation keeps the previous secret verifying for 24 hours with both signatures sent. Retries are explicit delayed queue messages, not consumer retries, so the schedule is exact and a replay is the same path.

**E1 is implemented** (2026-08-26): `packages/tinybird` (TypeScript SDK project, `bun run build` into Tinybird Local, `bun run deploy` to the cloud), the subscriber actor (`apps/api/src/actor/subscriber.ts`, Agents SDK, ingest → watermark → `buzzkit-events` queue → gzipped Events API batches), `POST /v1/events`, `POST /v1/client/events`, `GET /v1/events` (+ `/names`, `/names/:name`, `/volume`, `/token`), `GET /v1/subscribers/:id/timeline`, the subscriber lifecycle as `$` events, the audit ledger narrowed to the control plane (`GET /v1/workspaces/:slug/audit`, `aud_` ids, `audit:read`), and the dashboard's Events pages (catalog, volume, live tail through the JWT), Settings → Audit log and the profile timeline. Details in [api/events.md](api/events.md), [api/audit.md](api/audit.md), [configuration.md](configuration.md). Deviations from the table: Tinybird's build validates endpoint SQL with placeholder parameters, so time parameters are `DateTime64` and the API formats them (`YYYY-MM-DD HH:MM:SS.mmm`); the dashboard JWT is self-signed (HS256 with the workspace admin token, the workspace id read from the token's claims) because Tinybird Forward's token API does not mint JWTs on Local; the actor keeps one write per event and a single `flushed_sequence` watermark, exactly as costed in 1.8.

Each phase ships API, docs (`docs/api/*`, this file, `data-model.md`), tests (vitest over HTTP against `wrangler dev` — Durable Objects and Workflows run locally — plus `tb local` in docker compose) and its dashboard page, and is reviewed before the next starts.

| # | Phase | Build | Done when |
|---|---|---|---|
| **E1** ✅ built, reviewed 2026-08-27 | **Events** — the foundation | `packages/tinybird` (TypeScript SDK): `events` data source, MVs `events_by_subscriber`, `event_names_hourly`, `subscriber_attributes`; endpoints `subscriber_timeline`, `event_catalog`, `event_volume`, `live_tail`; `tb local` in docker compose and CI, `tb deploy` from CI. **Actor**: `SubscriberActor extends Agent` (inbox, projections, watermark, runs, waits, schedules tables), `ingest()` RPC, flush → `buzzkit-events` queue → consumer → Events API. **API**: `POST /v1/events`, `POST /v1/client/events` (batched, dedupe, sources, `$` names), `GET /v1/events` (catalog), `GET /v1/events/:name`, `GET /v1/subscribers/:id/timeline`, `GET /v1/events/token` (JWT with `fixed_params`). Subscriber lifecycle moves from the audit ledger to `$` events; the profile Activity feed reads the stream. **Dashboard**: Events → the product stream (catalog, volume chart, live tail through the JWT); audit log → Settings → Audit log. **SDK contract** documented (what the Swift SDK sends, batching, offline). | 100 client events with duplicates land once, in order, on the right actor and are queryable in Tinybird within seconds; killing the queue consumer mid-flush loses nothing; catalog, per-name page and timeline render; the audit log shows only control-plane rows |
| **E2** ✅ built 2026-08-27 | **Webhooks** | Feedbase port over two sources: control-plane from the Postgres ledger (awaited insert → `waitUntil` enqueue → idempotent consumer → hourly reconciliation diff) and data-plane from the actor (`$` public events, a second watermark, payload on the queue message). Standard-webhooks signing, `whsec_` rotate, Stripe retry schedule, 3-day auto-disable, replay; endpoints workspace-level with optional `tenant` filter. **Dashboard**: Developers → Webhooks | An endpoint receives `tenant.created` and `$subscription.invalidated` for real actions, retries on a 500, auto-disables after the streak, replays from the dashboard; the reconciliation sweep re-enqueues a deliberately dropped event |
| **E3** ✅ built 2026-08-27 | **Segments** | `buzzkit/expressions` (the grammar, TypeBox schema, shape validation, `isExpression` / `expressionProblem`, shared with workflow conditions later); `segment` + `segment_version` in Postgres, a new version per changed expression; compiler → one ClickHouse query over `subscriber_attributes`, `events`, `subscriber_activity` and `subscription_state` (attribute predicates require the key, `neq` is the complement of `eq`, event predicates as `IN (… GROUP BY subscriber_id HAVING count() …)`, last seen from device sources only, channel from the encoded subscription state) through the Query API, keyset-paged by `subscriber_id`; `POST /v1/segments/preview` (count + a 20-member sample), `GET /v1/segments/:slug/members` (paged members with `total`); `POST /v1/messages { segment }` pins the version and fans out page by page, resolving each page's subscriptions in Postgres and continuing through pages nobody on can receive. **Dashboard**: Audience → Segments: list, and a builder page (rows over attribute / did event / never / activity / channel with an all-or-any match, a JSON tab for nested expressions, the count and a member sample refreshing 400ms after every edit through the route action, Send to segment, delete) | A five-leaf segment (attribute + event count + never + last seen + channel) previews the right people and a send reaches exactly them; a 520-member segment whose first page holds no reachable subscriber still delivers to the two on the second page; 17 integration tests, 26 compiler tests, 57 package tests |
| **E4** ✅ built 2026-08-28 | **Scheduled messages** | `schedule` on `POST /v1/messages` (`at` wall-clock time, `timezone` IANA or `subscriber`, `defaultTimezone`), stored on the message with `scheduledFor` (the first instant it can fire), `scheduledZones` and `canceledAt`; statuses `scheduled` and `canceled`; the Worker's `* * * * *` cron releases due messages: a fixed zone is queued into the normal fan-out, a `subscriber` schedule is released zone by zone as each timezone reaches the moment (fan-out batches carry `zones`, an expression send is narrowed to `attributes.$timezone in [...]`, direct and topic sends filter the attribute in Postgres, unknown zones go with the fallback, a batch marks its zones done only when it finishes so a dead batch is retried, deliveries stay unique per subscription), completing once UTC−12 has passed; `POST /v1/messages/:id/cancel`; `message.canceled` audit + webhook. Replaced the campaign entity built earlier the same day (`campaign` + `campaign_run`, `/v1/campaigns`, the cron engine and the editor; the cron parser lives in git history for E6). **Dashboard**: the Send dialog's **Timing** field (Immediately / Scheduled with a `datetime-local` and a searchable timezone combobox led by "Each subscriber's local time"), Scheduled and Canceled statuses and filters, the Scheduled row and **Cancel message** on the message page | A scheduled message is held through a tick, refuses the past and unknown zones, fires when due and completes; a `subscriber` schedule sends Berlin and the no-timezone fallback now, not New York, never twice, and cancel mid-way keeps what was sent; a canceled message stays canceled across ticks and refuses a second cancel; a released fixed-zone send whose fan-out job was lost is recovered by the stalled sweep; an idempotency-key replay returns the same scheduled message; topic and inline-condition sends follow the subscriber timezone (the latter through the Tinybird attribute mirror); cancel is tenant-scoped and audited; 43 message tests, the cancel suite, 6 schedule unit tests (DST edges, calendar validation) |
| **E5** | **Workflows I — time and events** | Spec + `workflow` / `workflow_version` in Postgres, `POST|GET|PATCH /v1/workflows`, publish → KV `defs:{tenant}`; `EngineWorkflow` with `wait`, `waitUntil`, `waitFor`, `branch`, `send`, `exit`; actor trigger matching (`where`, `sources`, `concurrency`), waits, `cancelOn`; `$run.*` events, Tinybird `runs_current` + `runs` / `run_steps` endpoints; `GET /v1/workflows/:slug/runs`, `GET /v1/runs/:id`. **Dashboard**: Workflows (list with live counts, workflow page as a step list with per-step numbers, code tab, versions, runs; run timeline), active runs on the profile | The trial workflow minus `fetch` runs end to end against real events with real waits (compressed clocks in tests); a cancel event terminates a sleeping run; a redeploy mid-run changes nothing; a duplicate trigger is one run; 10k concurrent runs create without hitting the per-workflow rate limit |
| **E6** | **Workflows II — data and time** | `fetch` (signed, retried, `onError`), templates, `set`, `opened(step)` / `since: trigger` / `count` conditions, local-time `waitUntil`, **schedule triggers** (actor `schedule()`), quiet waits (`wait: { for, after, unless }`), `skipIfSentWithin`, `POST …/test` (dry run), **schedule triggers over a segment** (the recurring send, taking over the cron parser E4 carried) | The full trial workflow (both fetches) and the streak workflow deliver the right pushes to a phone in the right local hour; the dry run reproduces the trace without sending |
| **E7** ✅ built 2026-08-30 | **Sources — inbound webhooks** | A **source** (`source` + `source_delivery` tables, `/v1/sources`, [api/sources.md](api/sources.md)) is an inbound webhook endpoint of a tenant that turns another service's webhooks into stream events. Providers are templates, `stripe`, `superwall`, `revenuecat`, `custom`: each fills in a **verification** (Stripe's `Stripe-Signature` HMAC, Superwall's Standard Webhooks headers verified with the same code as `buzzkit/webhooks`, a shared `x-buzzkit-secret` header for custom) and a default **mapping**, both stored on the source and editable, so a custom source can verify any of the three ways and adding a provider is a preset file plus a logo; the grammar in `@buzzkit/schema/sources` shared with the dashboard: paths for the provider's `type`, `id` (deduplication) and `timestamp`, the `subscriber` as an external-id path or `{ path, attribute }` matched against a subscriber attribute (`stripeCustomerId`), `events` renaming provider types to event names (or `*` pass-through), `data` picked by path and a `where` in the segment expression grammar over the payload (`livemode`). Every request is recorded as a delivery with one outcome, `unverified` (no secret yet: recorded with the detected provider, no event), `rejected` (401), `dropped` with a reason (`no_type`, `unlisted_type`, `filtered`, `no_subscriber`, `invalid_data`, `paused`), `duplicate` or `event`, and events reach the stream through `trackEvents` with `source: 'webhook'` and `data.$provider`, so segments and workflow triggers see `subscription.started` from Stripe the same as from your backend. Secrets are sealed like credentials; deliveries are purged after 30 days. **Dashboard**: Developers → Sources (list with provider, status and last delivery; Add source ending on the ingest URL; the source page with the mapping editor linted inline, a sample payload rendered live into the event it becomes with path suggestions, the delivery ledger with the raw payload and Use as sample, pause / resume, secret replacement) | A signed Stripe `invoice.paid` for a known customer lands as `payment.succeeded` on the subscriber's timeline with `$provider`, the same body replayed is a duplicate, a forged or unsigned delivery is 401 and recorded, test-mode events are filtered, unknown customers and unlisted types are dropped, a stale provider timestamp is dropped rather than failing, an unverified source records without creating and a paused one drops; unit tests for the three verification schemes and the mapping grammar |
| **E8** | **iOS SDK + local delivery** | Swift package: `configure` / `identify` / `registerForPush` / `track`, automatic `$app.opened` / `$app.backgrounded` / `$session.ended` / `$notification.opened` / `$permission.changed`, SQLite offline queue with batching, `BuzzkitNotificationService` (NSE: `$notification.delivered`, rich media, **`deliver: "local"` scheduling with `cancelOnLocal`**), `BuzzkitPreferencesView`; SDK docs and a sample app | The streak reminder is scheduled on the phone at 19:00 local, is canceled by a workout logged in airplane mode, and receipts flow back when online; a foreground push shows with `showWhileActive` |
| **E9** | **Workflows III — control** | Grammar settled key by key on the capabilities page 2026-09-01: `repeat: { steps, until, every, max }` (until evaluated when the loop would repeat; `since: "iteration"` anchor) and `forEach: { items, as, max, steps }` as the data loop; `waitFor` on several events (`events: [{ event, where? }]`, first match wins, `steps.x.event` in scope), `endOn` entries that end the wait unmatched (the run continues — distinct from `cancelOn`, which kills the run), `where` on `resetOn` entries; tenant send policy `settings.sendPolicy` (`quietHours { from, to, timezone: "subscriber" \| IANA }` defers, `dailyCap` skips and records `capped`; off by default, applies to every send incl. the API, `policy: "ignore"` opt-out); `subscriber.channels` / `subscriber.topics` in scope; the full E8 payload (actions, imageUrl, sound, badge, threadId, interruptionLevel, collapseId, deepLink, action) in workflow sends; the dashboard cross-linking pass (every entity reference links, run-page style). Later still: aggregates over event fields, Tinybird deep history, segment enter/leave triggers, collect-and-digest, per-subscriber locale. |
| **E10** | **Experiments** | Deferred out of E9 by decision (2026-09-01) to ship whole as a first-class face: the Experiment entity (ratio-weighted variants, industry hash assignment, one goal with `within`), referenced from messages (`experiment` + per-variant overrides — the campaign face, campaigns stay absorbed per E4), the workflow `split` step, and the server SDK; inline variants materialize an experiment so nothing runs unmeasured; Experiments pages with per-variant funnels, uplift, significance (Bayesian headline + chi-squared), manual Conclude with a recommended winner. Full design: [experiments.md](experiments.md). |

Later, only with usage behind it: frequency caps and quiet hours as topic settings (the actor already sees every `$send`), `collect` (batch / debounce / digest), aggregates beyond count, maintained segment membership and `onSegmentEnter`, the device runtime for the simple subset of the spec, sandboxed code steps.
