# Engine

Events, segments, campaigns, workflows and webhooks — the engagement layer on top of the send API. **Status: proposal (2026-08-26), awaiting review.** Once approved it supersedes roadmap Phases 8–10 (the roadmap keeps the phase numbering and points here).

## The model

> **Events are facts about a subscriber. Workflows react to them with time and state. Segments are saved filters over subscribers. Campaigns send to a segment on a schedule. Webhooks tell your server what buzzkit did. Only workflows are an engine.**

buzzkit is an open-source notification orchestration layer over your own providers. iOS first, and on iOS the SDK does everything: registration, preferences, *and events*. `Buzzkit.track("workout.completed")` from the app, `buzzkit.events.track(...)` from the server, and the timing, state, preferences and delivery live in buzzkit. Where the logic needs data only your backend has, a workflow asks your server one signed question (a `fetch` step) instead of your backend running the schedule.

Three objects, two of them thin:

| Object | What it is | Engine? |
|---|---|---|
| **Segment** | A saved filter over subscribers: attributes, subscriptions, event history. A *target* (`POST /v1/messages { segment }`), never a thing that runs | no — compiles to SQL at use time |
| **Campaign** | Send this message (later: start this workflow) to this segment, now, at a time, or on a cron. Each run is a `message` row with a segment target | no — a schedule over the send API |
| **Workflow** | `trigger (event) → steps` with waits, branches, event waits, fetches and sends. One **run** per triggering event per subscriber | **yes** |

Events don't replace direct sends. A price drop is `POST /v1/messages` from your server, no workflow needed. A three-day trial sequence is a workflow. Use whichever is simpler; both go through the same fan-out, preferences and ledger.

Deliberately **not** objects: policies, audiences, journeys, templates. Frequency caps and quiet hours arrive later as *settings* on a topic or a `send` step, never as a fourth engine.

## Two event streams

The ledger that exists today records what buzzkit and operators did (`tenant.created`, `message.completed`, `subscription.invalidated`). Product events record what the customer's users did (`trial.started`, `workout.completed`). They have different shapes, volumes, readers and retention, so they are two tables:

| | Audit ledger | Product events |
|---|---|---|
| Table | `audit_event` (today's `event`, renamed — nothing is deployed yet, and `tables.event` must mean the product stream once it exists) | `event` |
| Scope | workspace (+ tenant) | tenant + subscriber |
| Written by | every mutation endpoint, queues, crons | `POST /v1/events`, `POST /v1/client/events`, the SDK's `$` events |
| Read by | audit log (`GET /workspaces/:slug/events` → dashboard **Settings → Audit log**), webhooks | workflows, segments, subscriber timeline, dashboard **Events** |
| Names | catalog, closed (`object.verb`) | customer-defined, open; `$`-prefixed names reserved for the SDK |

### Event shape

```json
POST /v1/events                      (tenant context, secret key; source = "server")
POST /v1/client/events               (client key; source = ios | android | web; batched, ≤100 per call)
{
  "id": "evt_client_9f1c…",          // optional idempotency id, chosen by the sender; a replay is a 200 no-op
  "externalId": "user_42",
  "name": "workout.completed",
  "occurredAt": "2026-08-26T14:02:11Z",   // optional, defaults to receivedAt; the SDK preserves the original time
  "data": { "workoutId": "w_1", "duration": 42 }
}
```

- Columns: `id` (bigint identity, the global order), `tenant_id`, `subscriber_id`, `name`, `source` (enum `server | ios | android | web | system`), `idempotency_key`, `occurred_at`, `received_at`, `data` JSONB (object-typed, ≤8KB). Unique `(tenant_id, idempotency_key)` where not null. Indexes `(tenant_id, subscriber_id, id)` for timelines and counts, `(tenant_id, name, id)` for catalogs, BRIN on `received_at` for retention. Append-only, no soft delete.
- An unknown `externalId` creates the subscriber (like `POST /v1/subscriptions` does). Names are `[a-z0-9_.-]`, ≤100 chars; names starting with `$` are refused from `POST /v1/events` and accepted from the client route only for the reserved list.
- **Reserved SDK events** (the `$` convention of system attributes): `$app.opened`, `$notification.delivered` (from the Notification Service Extension — real delivery receipts for push, which APNs never confirms), `$notification.opened` (tap), `$permission.changed` (`{ status }`). Each carries `messageId` where it applies. These are what let a workflow say "on the next app open" or "if they opened the welcome push".
- **Trust is declared, not assumed.** A trigger names the sources it accepts: `sources: ["server"]` for anything financial or security-relevant, the default (all sources) for behavioral events. A client-sourced `trial.started` never starts a server-only workflow. Identity verification (`identityHash`) applies to `/v1/client/events` exactly as to every client call.
- **Order is the id.** Two `workout.completed` events for the same subscriber arriving together must not both see "four so far": counts and "since trigger" conditions are computed in SQL against `event.id <= trigger event id` (a count at the moment of *that* event), never "now". Runs for one subscriber execute one at a time (lease per run, `concurrency` below).
- Mobile SDK contract: queue offline, batch on launch and every N seconds, one UUID per event, keep `occurredAt`, drop after the API acknowledges. Buzzkit dedupes on the id, so a retry after a lost response is harmless.

The dashboard **Events** page becomes the product stream (catalog of names with volume and last seen, recent events, the workflows listening to each); the subscriber profile's Activity feed merges both streams into one timeline (`14:02 workout.completed · 14:02 workflow "review-ask" started · 17:31 $app.opened · 17:31 push sent`).

## Segments

A segment is a versioned filter spec, compiled to one SQL query over `subscriber` (+ `subscription`, + `event` aggregates), evaluated **when it is used** — sending, previewing, a campaign run. No membership tables in v1.

```json
{
  "slug": "engaged-free",
  "where": { "all": [
    { "attribute": "plan", "eq": "free" },
    { "event": "workout.completed", "count": { "gte": 5 }, "within": "30d" },
    { "event": "subscription.started", "never": true },
    { "lastSeen": { "within": "7d" } },
    { "channel": "push" }
  ]}
}
```

- Leaves: `attribute` (`eq | neq | in | gt | gte | lt | lte | exists | contains`, on `attributes` incl. `$country` etc.), `event` (`count` within a window, `never`, `last` within/olderThan), `lastSeen`, `channel` / `platform` (has a live subscription), `verified`, `createdAt`. Combinators `all | any | not`, nesting allowed. The **same expression module** serves workflow conditions.
- API: `POST|GET|PATCH|DELETE /v1/segments`, `GET /v1/segments/:slug/preview` (count + sample page; keyset-paginated members with `total`). Tables `segment` (tenant, slug, name, `current_version_id`) and `segment_version` (immutable spec, checksum, created_by). A campaign run pins the version it used.
- **`POST /v1/messages { segment: "engaged-free" }`** — the third target kind next to `to` and `topic`, filterable by topic like `to` is. Fan-out pages the segment's query by `subscription.id` exactly like a topic; `message.targets` stores `{ segment, segmentVersionId }`.
- Dashboard **Segments**: list with live count, a builder over the leaves (rows, not a canvas), preview table, "Send to segment" opening the message dialog.
- Later: maintained membership (`segment_member` projection updated from event/attribute writes) unlocks `onSegmentEnter` as a workflow trigger ("live audiences"). Not before real usage asks for it.

## Campaigns

```json
{ "slug": "summer-offer", "segment": "engaged-free", "topic": "marketing",
  "message": { "title": "…", "body": "…", "data": {} },
  "schedule": null | { "at": "2026-09-01T12:00:00Z" } | { "cron": "0 10 * * MON", "timezone": "Europe/Berlin" },
  "status": "draft | scheduled | active | paused | completed" }
```

- `POST /v1/campaigns/:slug/run` sends now; the scheduler (the existing 5-minute cron, or a per-minute one) starts due runs. A **run is a `message`** (`campaign_run`: campaign, message id, segment version, scheduled/started/finished) and shows up in Messages with a campaign badge; the campaign page lists runs with their funnels. Idempotent per (campaign, scheduled tick).
- Once workflows exist, `"workflow": "summer-upgrade"` is an alternative to `"message"`: the run starts one workflow run per member.
- Dashboard **Campaigns**: list, the create dialog (segment, topic, message, schedule), the campaign page with runs. Templates over subscriber attributes (`{{ subscriber.attributes.name }}`) arrive with the workflow templating module.

## Workflows

### Spec

The source of truth is a **versioned JSON spec stored in buzzkit** (`workflow` + immutable `workflow_version`). Every client produces the same document and calls the same API: the `buzzkit` SDK's builder (`defineWorkflow` → spec → `POST /v1/workflows`), `buzzkit push` (diff + apply of a directory of definitions), the dashboard, an agent. There is no deploy step; a workflow exists the moment the API accepts it. The builder is DX; the spec is the contract.

```json
{
  "slug": "trial",
  "trigger": { "event": "trial.started", "sources": ["server"], "where": { "ref": "trigger.data.plan", "neq": "lifetime" } },
  "concurrency": "one-per-subscriber",
  "cancelOn": [{ "event": "subscription.started" }],
  "steps": [
    { "type": "wait", "for": "2h" },
    { "type": "fetch", "as": "status", "url": "https://api.example.com/buzzkit/trial-status" },
    { "type": "branch", "if": { "ref": "status.checks", "gt": 0 },
      "then": [{ "type": "send", "name": "progress", "topic": "trial", "title": "Already {{ status.checks }} checks", "body": "We're watching {{ status.product }} for you." }] },
    { "type": "waitFor", "event": "trial.cancelled", "as": "cancel", "until": { "after": "trigger", "plus": "1d" } },
    { "type": "branch", "if": { "ref": "cancel", "exists": true },
      "then": [{ "type": "send", "title": "Your trial is cancelled", "body": "You keep access until {{ trigger.data.endsAt | date }}." }],
      "else": [{ "type": "fetch", "as": "status", "url": "https://api.example.com/buzzkit/trial-status" },
               { "type": "send", "body": "We checked {{ status.product }} {{ status.checks }} times so far." }] },
    { "type": "waitUntil", "after": "trigger", "plus": "2d", "at": "09:00", "timezone": "subscriber" },
    { "type": "send", "title": "Your trial ends tomorrow", "body": "{{ cancel ? 'Resubscribe to keep watching.' : 'Nothing to do — you keep everything.' }}" }
  ]
}
```

The same thing from code, which is what most people will write:

```ts
export const trial = defineWorkflow('trial', {
  trigger: onEvent('trial.started', { sources: ['server'] }),
  concurrency: 'one-per-subscriber',
  cancelOn: [onEvent('subscription.started')],
  steps: (w) => {
    w.wait('2h');
    const status = w.fetch('status', 'https://api.example.com/buzzkit/trial-status');
    w.branch(status.get('checks').gt(0), (w) => w.send('progress', { topic: 'trial', title: 'Already {{ status.checks }} checks' }));
    const cancel = w.waitFor('trial.cancelled', { as: 'cancel', until: w.trigger.plus('1d') });
    w.branch(cancel.exists(), (w) => w.send({ title: 'Your trial is cancelled' }), (w) => { /* … */ });
    w.waitUntil(w.trigger.plus('2d'), { at: '09:00', timezone: 'subscriber' });
    w.send({ title: 'Your trial ends tomorrow', body: '…' });
  },
});
```

### The closed set of steps

| Step | Semantics |
|---|---|
| `wait` | Sleep a duration. |
| `waitUntil` | Sleep until an **anchored** time (`after: trigger | step:<name>`, `plus`, optional `at` local time via `$timezone`) so a chain of waits never drifts. The 9am-local send is this. |
| `waitFor` | Suspend until an event for this subscriber arrives (filterable) or `until` passes; stores the event (or `null`) under `as`. Multiple `waitFor` steps per run, one pending at a time. |
| `fetch` | Signed `POST` to your URL with `{ workflow, run, subscriber, trigger, variables }`; the JSON response (≤64KB) is stored under `as`. 30s timeout, 3 attempts with backoff, then `onError: fail | skip` (default fail). This is how a workflow reads data that lives in your database. |
| `branch` | `if` (expression) → `then` / `else` step lists. Nested freely. |
| `send` | Creates a `message` for this subscriber (`to: [externalId]`, optional `topic`, channel), rendered from templates over `trigger`, `subscriber`, `variables`. Idempotent per (run, step index). Records the message id so later conditions can ask `opened("welcome")`. |
| `set` | Write a variable or a subscriber attribute (`attributes.trialState = "reminded"`). |
| `exit` | End the run (optionally with a reason). |

Expressions: the segment leaf grammar plus `ref` (`trigger.data.x`, `subscriber.attributes.plan`, `status.checks`, `cancel`) with `eq | neq | gt | gte | lt | lte | in | exists | contains`, event conditions relative to the run (`{ event: "$app.opened", since: "trigger" }`, `{ opened: "welcome" }`), and `all | any | not`. Templates are path lookups with a handful of filters (`date`, `number`, `default`) and a ternary; no loops, no code.

Triggers: `event` only. Schedules belong to campaigns (a campaign can start a workflow per member), so nothing is expressible two ways. `cancelOn` ends the run from any wait. `concurrency`: `per-event` (default; a run per triggering event) or `one-per-subscriber` (a second trigger while a run is active is ignored, or `restart`).

### Runner: Postgres + Queue, like deliveries

The roadmap's pending decision leaned towards Cloudflare Workflows. Recommendation: **run workflows the way deliveries already run** — rows in Postgres are the truth, a queue carries the work, delays are `delaySeconds` on the queue message *and* a `wake_at` column, and the reconcile cron re-drives anything due, stale or lost.

Why not Cloudflare Workflows: its state would have to be mirrored into Postgres anyway for the dashboard (run timeline, variables, which runs are waiting for which event), event routing needs a Postgres index of pending waits regardless, instance retention is 30 days, plan limits (100 concurrent on free) bind self-hosters, and the interpreter we'd put inside a Workflow step is the same interpreter either way. The Postgres runner is one more queue consumer in a shape the codebase has already proven, and a self-hoster needs nothing beyond what they have. The runner sits behind a small interface (`start`, `resume`, `wake`) so Cloudflare Workflows can be swapped in later if precision or scale ever demands it.

- Tables: `workflow` (tenant, slug, name, status `active | paused | archived`, `current_version_id`, `trigger_event` denormalized for matching, `concurrency`), `workflow_version` (spec JSONB, checksum, created_by, immutable), `workflow_run` (tenant, workflow, version, subscriber, `trigger_event_id`, status `queued | running | sleeping | waiting | completed | cancelled | failed`, `cursor` (step path), `variables` JSONB, `wake_at`, `waiting_event`, `concurrency_key`, `lease_expires_at`, timestamps, `error`), `workflow_run_step` (append-only: run, path, type, status, input/output, `message_id`, started/finished — the timeline). Unique `(workflow_id, trigger_event_id)`; partial unique `(workflow_id, concurrency_key) where status in (queued, running, sleeping, waiting)` for `one-per-subscriber`; partial indexes on `wake_at` (due), `(tenant_id, subscriber_id, waiting_event) where status = 'waiting'` (event routing), `coalesce(lease_expires_at, updated_at)` (stale).
- Queue `buzzkit-workflows`: `{ type: "run", runId, eventId? }`. Consumer: claim the lease, interpret from `cursor` until the next wait or the end, persist each step, on `wait`/`waitUntil` set `wake_at` and enqueue with `delaySeconds` (≤12h per hop, chained), on `waitFor` set `waiting_event` + `wake_at` (the timeout). Duplicate jobs lose the lease and are no-ops.
- On event insert (awaited, in the request): match active workflows by `(tenant_id, trigger_event)` → evaluate `where` + `sources` → insert runs (`ON CONFLICT DO NOTHING`) → enqueue (`waitUntil`); match waiting runs by `(tenant, subscriber, waiting_event)` → enqueue resume with the event id; match `cancelOn` → cancel. The reconcile cron re-drives `queued` runs never picked up, due `wake_at`, and expired leases — the same loss-proof construction as webhooks.
- Versioning: a run pins its version; publishing a new version affects new triggers only. `paused` stops new runs and freezes sleeping ones; `archived` cancels them.
- Every `send` is a normal `message` (targets `{ to, workflowRunId }`), so preferences, kill-switches, TTLs, retries and the attempt ledger apply unchanged and the Messages page shows workflow sends with a badge.

### Visibility

`GET /v1/workflows/:slug/runs` (status filter, per subscriber), `GET /v1/runs/:id` with its steps, `POST /v1/workflows/:slug/test` (run against a synthetic event with waits collapsed; no sends, returns the step trace — the simulator, minimal). Dashboard **Workflows**: list with active/waiting counts, the workflow page (spec rendered as a vertical step list — the same rows-not-canvas language as segments — code tab with the JSON, versions, runs), the run page (timeline of steps, variables, the messages it sent), and the subscriber profile showing their runs.

## Webhooks

A port of feedbase's delivery engine over the **audit ledger** (`docs/webhooks.md` there is the spec): endpoint + delivery tables, `waitUntil` enqueue after the awaited ledger insert, idempotent consumer (one delivery row per (event, endpoint)), Stripe-schedule retries over ~3 days, 3-day auto-disable, hourly reconciliation diff, standardwebhooks.com signing (`webhook-id/-timestamp/-signature`, `whsec_` secrets, rotate), snapshot payloads with `data.object` hydrated and `previousAttributes` on `*.updated`. Routes `GET|POST /v1/workspaces/:slug/webhooks`, `GET|PATCH|DELETE …/:id`, `…/rotate`, `…/deliveries`, `…/deliveries/:id/replay`; scopes `webhooks:read` (member) / `webhooks:write` (admin), key-grantable; `wh_` ids.

What differs from feedbase: endpoints are workspace-level with an optional `tenant` filter (a platform can route one customer's events to one URL); every payload carries `tenant { id, slug }`; the public catalog is today's `webhook: true` flags (`message.completed`, `subscription.invalidated`, `subscriber.*`, `preferences.updated`, …) plus, from the engine phases, `workflow.run.completed | failed`, `campaign.run.completed`. Product events are never webhooked (they are the customer's own data; they'd echo). Later, `fetch` steps reuse the signing and the secret model.

## Phases

Each phase ships its API, docs (`docs/api/<resource>.md`), tests and its dashboard page, and is reviewed before the next starts. Order follows dependencies: webhooks need nothing, events feed everything else, segments need events, campaigns need segments, workflows need events and (for `send`) nothing new.

| # | Phase | Build | Done when |
|---|---|---|---|
| **E1** | **Webhooks** | Port from feedbase as above; `EVENT_CATALOG` gains `workflow.*` / `campaign.*` names later. Dashboard **Developers → Webhooks** (endpoints, secret reveal/rotate, deliveries with replay) | An endpoint receives `message.completed` for a real send, retries on a 500, auto-disables after the streak, replays from the dashboard |
| **E2** | **Events** | Rename `event` → `audit_event`; new `event` table; `POST|GET /v1/events`, `GET /v1/events/names` (catalog with counts), `POST /v1/client/events` (batched, dedupe, sources, `$` names); events in the subscriber timeline; **Events** page becomes the product stream, the audit log moves to **Settings → Audit log**; iOS SDK contract documented (`$app.opened`, `$notification.delivered/opened`, `$permission.changed`) | 100 client events with duplicates land once, in order, on the right subscriber; the profile timeline shows them; docs describe what the Swift SDK must send |
| **E3** | **Segments** | Expression module (shared with workflows), `segment` + versions, compile-to-SQL, preview/members, `POST /v1/messages { segment }` through fan-out; **Segments** page with the builder and "Send to segment" | A five-leaf segment (attribute + event count + never + lastSeen + channel) previews the right people and a send reaches exactly them |
| **E4** | **Campaigns** | `campaign` + `campaign_run`, run-now / at / cron via the scheduler, runs as messages with a badge; **Campaigns** page | A cron campaign fires on schedule, once per tick, and its run funnel is visible in both Campaigns and Messages |
| **E5** | **Workflows I — time and events** | Spec + versions + API, the runner (`buzzkit-workflows` queue, leases, wake/reconcile), steps `wait`, `waitUntil`, `waitFor`, `branch`, `send`, `exit`, `cancelOn`, `concurrency`, trigger `where` + `sources`; runs API; **Workflows** page (list, workflow page with the step list and versions, run timeline) | The trial workflow minus `fetch` runs end to end against real events with real waits (compressed clocks in tests); a cancel event cancels a sleeping run; a redeploy mid-run changes nothing for in-flight runs; a duplicate trigger is one run |
| **E6** | **Workflows II — data** | `fetch` (signed, retried), templates over `trigger` / `subscriber` / variables, `set`, `opened(step)` and `since: trigger` conditions, local-time `waitUntil`, `POST …/test` (dry run), `campaign.workflow` | The full trial workflow above, including the two fetches, delivers the right three pushes to a phone in the right local hour; the dry run reproduces the trace without sending |
| **E7** | **Code** | `buzzkit` SDK: `defineWorkflow` / `defineSegment` / `defineCampaign` builders compiling to specs, `buzzkit.workflows.create/…` typed over the contract; `buzzkit push` / `diff` (directory of definitions → API); then the Swift SDK's `track`, offline queue, `$` events and the Notification Service Extension for `$notification.delivered` | The trial workflow defined in a demo repo, `buzzkit push`, phones buzz; a changed body shows a real diff and a new version |

After E7, the things below are worth revisiting, in this order, and only with usage behind them.

## Explicitly later

- **Frequency caps and quiet hours** — as a topic setting (`maxPerDay`, `quietHours` in `$timezone`) enforced at fan-out, and `send { skipIfSentWithin }` on a step. One atomic reservation before delivery, not a policy object hierarchy.
- **Batch / debounce / digest** — a `collect` step (`{ event, window | quietPeriod, by }`) that accumulates events into a run variable. The run model already supports it (a waiting run that keeps absorbing events); it needs the templating loop it was deliberately left without.
- **Aggregates beyond count** — `sum`, `distinctCount`, `crosses` on the expression module.
- **Maintained segment membership** and `onSegmentEnter` triggers ("live audiences"); recurring-audience campaigns become a special case.
- **Code steps** — a sandboxed transform (`inputs → JSON`) with no network and no provider access. The `fetch` step covers the real need (your data) without running your code in our workers; Cloudflare's Dynamic Workflows make this feasible for the hosted product but not for a self-hoster, which is the reason to keep it last.
- **Anonymous ids / aliasing**, device attestation, an agent-facing management surface (the API already is one; MCP is a thin wrapper).

## Decisions to confirm

1. **Runner** — Postgres + Queue (recommended, above) vs Cloudflare Workflows. Changes the roadmap's leaning.
2. **Rename `event` → `audit_event`** so the product stream owns `event` / `/v1/events`. Mechanical, pre-launch; the alternative (`subscriber_event` and a forever-confusing `tables.event`) costs more later.
3. **The API is the source of truth, code is a client.** `defineWorkflow` compiles to the spec the API stores; the dashboard may create the same objects. The CLI is diff + apply, built last (E7), not a gate. `overview.md`'s "code is the source of truth" becomes "the spec is the source of truth; code is the best way to write it".
4. **`fetch` is the answer to "my data lives in my database"**, not code execution inside buzzkit. Your endpoint answers one signed question per step; buzzkit keeps the clock, the retries, the preferences and the ledger.
5. **Names**: segments (a filter; "audience" is the list, which is the subscriber table), campaigns, workflows (not journeys). The sidebar already says so.
6. **Cut for now**: policies, batching, digests, aggregates beyond count, code steps, live audiences, a simulator beyond the dry run.
