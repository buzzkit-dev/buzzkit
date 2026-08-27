# Engine

Events, workflows, segments, campaigns — the engagement layer over the send API. **Status: design (2026-08-26), decided stack, no phases yet.** Part 1 is the architecture, part 2 is the developer and product experience through real apps. Roadmap Phases 8–10 are superseded by this.

> **Events are facts about a user. Workflows react to them with time and state. Segments are filters over users. Campaigns send to a segment on a schedule. Every send goes through the same preferences, providers and ledger.**

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
| **Postgres** (existing) | *What is*: tenancy, credentials, subscribers, subscriptions, topics, preferences, messages/deliveries, the audit ledger, and the **definitions** (workflow / segment / campaign + immutable versions) | Relational, transactional, modest volume. Unchanged. |
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
- **Reserved SDK events**: `$app.opened`, **`$app.backgrounded`** (the quiet moment — a push waiting on `$app.opened` lands while the app is foregrounded and iOS suppresses the banner, so "background + 5 min" is the useful anchor), `$session.ended`, `$notification.delivered` (from the Notification Service Extension: real receipts that APNs never provides), `$notification.opened` (`{ messageId, action }`), `$permission.changed`, `$identify` (attributes snapshot). **Engine events**: `$run.started / step / completed / cancelled / failed`, `$send`, `$campaign.sent`, and the **subscriber lifecycle** that today lives in the audit ledger: `$subscriber.created`, `$subscription.registered / muted / removed / invalidated`, `$preferences.updated`, `$delivery.sent / failed / invalid`. Rule: **the actor is the source of truth for anything about a subscriber; Postgres for anything about the workspace or tenant.** The audit ledger keeps control-plane facts only (who did what: tenants, keys, members, credentials, webhooks, definitions published) plus tenant-level `message.completed` for API and campaign messages — workflow sends are per-subscriber `$send` + receipts, never a million `message.completed` rows.
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
3. **Cancels** — `cancelOn` match → `instance.terminate()`, `$run.cancelled`.
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

**Limits that shape the product, not the code**: instance creation is 100/s per workflow — event triggers never notice; a campaign that starts a workflow for a million people takes ~3 hours by design, so broadcasts are messages (the existing fan-out) and workflows are per-user timing. 50k *running* instances at once; sleeping and waiting ones do not count. Steps are metered (~$45 per million six-step runs).

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

Materialized views (incremental, on ingest — "insert triggers"): `events_by_subscriber` (sorted by subscriber then time: the timeline), `event_names_hourly` (`AggregatingMergeTree`: tenant × name × source × hour → count, uniq subscribers, sources: the catalog and the charts), `subscribers_current` (`ReplacingMergeTree` fed by `$identify`: the **attribute mirror**, so a segment never joins Postgres), `runs_current` (fed by `$run.*`: the runs list), `sends_current` (fed by `$send` + `$notification.delivered/opened`: per-message engagement, the fatigue signal). Endpoints, each a typed pipe with parameters, for the fixed shapes: `subscriber_timeline`, `event_catalog`, `event_volume`, `runs`, `run_steps`, `live_tail`. **Segments are not static pipes** — an arbitrary boolean tree cannot be a templated endpoint — so the segment compiler emits ClickHouse SQL (attribute predicates on `subscribers_current`, event predicates as `GROUP BY subscriber_id HAVING`, keyset-paged by `subscriber_id`) and runs it through Tinybird's **Query API** (`POST /v0/sql`, a `DATASOURCES:READ` token held by the API only). Queries time out at 10s and return ≤100MB — segment previews answer in tens of milliseconds.

A campaign run pages `segment_members` (500 ids at a time), resolves subscriptions in Postgres, and hands them to the existing fan-out; the message stores `{ segment, segmentVersionId, campaignRunId }`. Tinybird is seconds behind the actor; segments and dashboards accept that, and anything that must be exact and immediate (conditions, concurrency, caps) asks the actor. Sinks (S3 / GCS / Kafka) give customers their own events back later without us building an export.

Self-hosting: the OSS deploy needs a Tinybird workspace (free tier for small deployments; `tb local` for development). The two seams — `append(batch)` through the Events API and reads through published endpoints — are deliberately narrow so a plain ClickHouse adapter could exist one day; nothing is built for it now.

### 1.7 The iOS side: quiet moments and local notifications

The Swift SDK is not a token registrar with a `track()` bolted on; it is half the engine.

- **Quiet-moment delivery.** `w.waitFor('$app.backgrounded'); w.wait('5m')` (sugar: `w.afterBackground('5m')`) is the right way to say "the next time the user is not looking", and a foreground-arriving push can be shown as a banner only if the delegate opts in, which the SDK exposes as `showWhileActive: true` per message.
- **`deliver: "local"`.** A `send` can be delivered **as an on-device local notification**: the cloud sends a silent push (`content-available`) carrying the content plus a fire time (or a local-time rule); the SDK schedules it with `UNCalendarNotificationTrigger` — exact to the second, in the device's own timezone, and it fires with the radio off. The SDK cancels pending local notifications tagged with a run when the run is cancelled (a cancel push) or when a local event the rule names occurs (`cancelOnLocal: ["workout.completed"]`) — the streak reminder disappears the moment the workout is logged, no round trip. Delivered/opened still flow back as `$notification.delivered/opened`.
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

**Definitions** — one JSON spec from whichever door: `defineWorkflow` in a `buzzkit/` folder and `bunx buzzkit push` (diff, then apply); `buzz.workflows.upsert(spec)` from any script or agent; the dashboard's step editor. A workflow exists when the API accepts it. There is no deploy.

**Dashboard**:

- **Events** — the catalog: every name with 24h / 7d volume, unique users, sources, last seen, listening workflows; a live tail; a per-name page with the volume chart, sample payloads and the inferred field list (what `where` and templates can reference). Backed by `event_names_hourly`; charts and tail query Tinybird directly with the session's JWT.
- **Workflows** — list with active / sleeping / waiting counts; the workflow page renders the spec as a **vertical step list** with live numbers per row ("1,204 sleeping here · 87 waiting for `trial.cancelled`"), a code tab, versions, runs. The run page is a timeline: trigger, every step with its recorded output ("branch → else", "fetch → 200 in 340ms", "send → msg_… delivered 17:31, opened 17:32"), variables, subscriber. **Test** runs the spec against a pasted event with waits collapsed and sends stubbed.
- **Subscriber profile** — one timeline merging product events, engine events and deliveries; active runs ("`trial` · sleeping until Thu 09:00 local · step 5 of 7"). Recent rows from the actor, history from Tinybird.
- **Segments** — a builder of rows (attribute · event count · never · last seen · channel), the count updating as you edit; a members preview; "Send to segment". **Campaigns** — segment + topic + message + schedule, runs with funnels.

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
await buzz.events.track({ externalId, name: 'trial.cancelled' });
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
    const cancel = w.waitFor('trial.cancelled', { as: 'cancel', until: w.trigger.plus('1d') });
    w.branch(cancel.exists(),
      (w) => w.send({ title: 'Your trial is cancelled', body: 'Alerts continue until {{ trigger.data.endsAt | date }}.' }),
      (w) => { const s = w.fetch('status', '…/trial-status'); w.send({ body: 'We have checked {{ s.product }} {{ s.checks }} times so far.' }); });
    w.waitUntil(w.trigger.plus('2d'), { at: '09:00', timezone: 'subscriber' });
    w.send({ title: 'Your trial ends tomorrow', body: "{{ cancel ? 'Resubscribe to keep your alerts.' : 'Nothing to do — your alerts continue.' }}" });
  },
});
```

`trial.started` → actor → run created → the instance sleeps two hours → `fetch` asks your server, retried on failure → branch → `waitFor` parks the instance while the actor watches for `trial.cancelled`; Apple's cancellation eighteen hours later is forwarded and the cancelled branch runs, otherwise the wait times out at exactly trigger + 1 day → the final wait snaps to 09:00 in the user's timezone → send. `subscription.started` at any point terminates the run. The run page shows every step including both fetch responses. Price drops are `buzz.send(...)` from the scraper: no timing, no workflow.

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

#### Re-engagement — segments, campaigns, and knowing when to stop

*Without*: an analytics export for 14-day-inactive users, a Monday script in their timezone, and no way to know a push was delivered, let alone that the last three were ignored.

*With*:

```ts
export const dormant = defineSegment('dormant', { where: all(channel('push'), lastSeen().olderThan('14d'), attribute('marketingFatigue').neq(true)) });
export const winback = defineCampaign('winback', { segment: dormant, topic: 'marketing', schedule: cron('0 10 * * MON', { timezone: 'subscriber' }),
  message: { title: 'We kept your spot', body: 'Three new routes near {{ subscriber.attributes.$city }}.' } });
export const fatigue = defineWorkflow('marketing-fatigue', {
  trigger: onEvent('$notification.delivered', { where: ref('trigger.data.topic').eq('marketing') }),
  steps: (w) => w.branch(all(count('$notification.delivered', { where: { topic: 'marketing' }, within: '30d' }).gte(3),
                             count('$notification.opened',    { where: { topic: 'marketing' }, within: '30d' }).eq(0)),
                         (w) => w.set({ attribute: 'marketingFatigue', value: true })),
});
```

The segment is one Tinybird endpoint (the builder's count updates as you toggle rows); the campaign pages ids into the normal fan-out at each user's 10:00; `$notification.delivered` from the NSE makes the third definition possible at all; `set` removes the user from the segment next Monday.

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
- **Schedules belong to workflows** (per-user, conditional, in the actor); **crons belong to campaigns** (audience-wide). Nothing is expressible twice.
- **`deliver: "local"`** ships with the iOS SDK phase (E7), designed in from E5 (the `send` step carries `deliver`).
- **Retention**: events and run history 13 months in Tinybird (TTL); delivery attempts stay in Postgres for now.
- **Audit log stays in Postgres; subscriber lifecycle moves to the stream** (1.3). Webhooks read both sources.
- **OSS floor**: a Tinybird free workspace; `tb local` for development.

## Phases

**E1 is implemented** (2026-08-26): `packages/tinybird` (TypeScript SDK project, `bun run build` into Tinybird Local, `bun run deploy` to the cloud), the subscriber actor (`apps/api/src/actor/subscriber.ts`, Agents SDK, ingest → watermark → `buzzkit-events` queue → gzipped Events API batches), `POST /v1/events`, `POST /v1/client/events`, `GET /v1/events` (+ `/names`, `/names/:name`, `/volume`, `/token`), `GET /v1/subscribers/:id/timeline`, the subscriber lifecycle as `$` events, the audit ledger narrowed to the control plane (`GET /v1/workspaces/:slug/audit`, `aud_` ids, `audit:read`), and the dashboard's Events pages (catalog, volume, live tail through the JWT), Settings → Audit log and the profile timeline. Details in [api/events.md](api/events.md), [api/audit.md](api/audit.md), [configuration.md](configuration.md). Deviations from the table: Tinybird's build validates endpoint SQL with placeholder parameters, so time parameters are `DateTime64` and the API formats them (`YYYY-MM-DD HH:MM:SS.mmm`); the dashboard JWT is self-signed (HS256 with the workspace admin token, the workspace id read from the token's claims) because Tinybird Forward's token API does not mint JWTs on Local; the actor keeps one write per event and a single `flushed_sequence` watermark, exactly as costed in 1.8.

Each phase ships API, docs (`docs/api/*`, this file, `data-model.md`), tests (vitest over HTTP against `wrangler dev` — Durable Objects and Workflows run locally — plus `tb local` in docker compose) and its dashboard page, and is reviewed before the next starts.

| # | Phase | Build | Done when |
|---|---|---|---|
| **E1** ✅ built, awaiting review | **Events** — the foundation | `packages/tinybird` (TypeScript SDK): `events` data source, MVs `events_by_subscriber`, `event_names_hourly`, `subscribers_current`; endpoints `subscriber_timeline`, `event_catalog`, `event_volume`, `live_tail`; `tb local` in docker compose and CI, `tb deploy` from CI. **Actor**: `SubscriberActor extends Agent` (inbox, projections, watermark, runs, waits, schedules tables), `ingest()` RPC, flush → `buzzkit-events` queue → consumer → Events API. **API**: `POST /v1/events`, `POST /v1/client/events` (batched, dedupe, sources, `$` names), `GET /v1/events` (catalog), `GET /v1/events/:name`, `GET /v1/subscribers/:id/timeline`, `GET /v1/events/token` (JWT with `fixed_params`). Subscriber lifecycle moves from the audit ledger to `$` events; the profile Activity feed reads the stream. **Dashboard**: Events → the product stream (catalog, volume chart, live tail through the JWT); audit log → Settings → Audit log. **SDK contract** documented (what the Swift SDK sends, batching, offline). | 100 client events with duplicates land once, in order, on the right actor and are queryable in Tinybird within seconds; killing the queue consumer mid-flush loses nothing; catalog, per-name page and timeline render; the audit log shows only control-plane rows |
| **E2** | **Webhooks** | Feedbase port over two sources: control-plane from the Postgres ledger (awaited insert → `waitUntil` enqueue → idempotent consumer → hourly reconciliation diff) and data-plane from the actor (`$` public events, a second watermark, payload on the queue message). Standard-webhooks signing, `whsec_` rotate, Stripe retry schedule, 3-day auto-disable, replay; endpoints workspace-level with optional `tenant` filter. **Dashboard**: Developers → Webhooks | An endpoint receives `tenant.created` and `$subscription.invalidated` for real actions, retries on a 500, auto-disables after the streak, replays from the dashboard; the reconciliation sweep re-enqueues a deliberately dropped event |
| **E3** | **Segments** | Expression module (shared with workflow conditions); `segment` + `segment_version` in Postgres; compiler → ClickHouse SQL via the Query API (`segment_count`, `segment_members` keyset-paged); `POST /v1/messages { segment }` through fan-out (page ids → Postgres subscriptions); `GET /v1/segments/:slug/preview`. **Dashboard**: Segments (row builder with the count updating as you edit, members preview, Send to segment) | A five-leaf segment (attribute + event count + never + last seen + channel) previews the right people and a send reaches exactly them; a 500k-subscriber segment fans out at the existing rate |
| **E4** | **Campaigns** | `campaign` + `campaign_run` in Postgres; a per-minute scheduler (partial index on due runs; `timezone: subscriber` runs once per timezone bucket as each reaches the hour); run-now / at / cron; runs are messages with a badge; `$campaign.sent` per subscriber. **Dashboard**: Campaigns (create dialog, campaign page with runs and funnels) | A cron campaign fires once per tick, at 10:00 in three timezones, and its run funnel is visible in Campaigns and Messages |
| **E5** | **Workflows I — time and events** | Spec + `workflow` / `workflow_version` in Postgres, `POST|GET|PATCH /v1/workflows`, publish → KV `defs:{tenant}`; `EngineWorkflow` with `wait`, `waitUntil`, `waitFor`, `branch`, `send`, `exit`; actor trigger matching (`where`, `sources`, `concurrency`), waits, `cancelOn`; `$run.*` events, Tinybird `runs_current` + `runs` / `run_steps` endpoints; `GET /v1/workflows/:slug/runs`, `GET /v1/runs/:id`. **Dashboard**: Workflows (list with live counts, workflow page as a step list with per-step numbers, code tab, versions, runs; run timeline), active runs on the profile | The trial workflow minus `fetch` runs end to end against real events with real waits (compressed clocks in tests); a cancel event terminates a sleeping run; a redeploy mid-run changes nothing; a duplicate trigger is one run; 10k concurrent runs create without hitting the per-workflow rate limit |
| **E6** | **Workflows II — data and time** | `fetch` (signed, retried, `onError`), templates, `set`, `opened(step)` / `since: trigger` / `count` conditions, local-time `waitUntil`, **schedule triggers** (actor `schedule()`), `afterBackground`, `skipIfSentWithin`, `POST …/test` (dry run), `campaign.workflow` | The full trial workflow (both fetches) and the streak workflow deliver the right pushes to a phone in the right local hour; the dry run reproduces the trace without sending |
| **E7** | **iOS SDK + local delivery** | Swift package: `configure` / `identify` / `registerForPush` / `track`, automatic `$app.opened` / `$app.backgrounded` / `$session.ended` / `$notification.opened` / `$permission.changed`, SQLite offline queue with batching, `BuzzkitNotificationService` (NSE: `$notification.delivered`, rich media, **`deliver: "local"` scheduling with `cancelOnLocal`**), `BuzzkitPreferencesView`; SDK docs and a sample app | The streak reminder is scheduled on the phone at 19:00 local, is cancelled by a workout logged in airplane mode, and receipts flow back when online; a foreground push shows with `showWhileActive` |
| **E8** | **Code** | `buzzkit` builders (`defineWorkflow` / `defineSegment` / `defineCampaign` → spec), `buzz.workflows.upsert`, `bunx buzzkit push` / `diff` over a definitions directory | The trial and streak workflows defined in a demo repo, `buzzkit push`, phones buzz; a changed body shows a real diff and a new version |

Later, only with usage behind it: frequency caps and quiet hours as topic settings (the actor already sees every `$send`), `collect` (batch / debounce / digest), aggregates beyond count, maintained segment membership and `onSegmentEnter`, the device runtime for the simple subset of the spec, sandboxed code steps.
