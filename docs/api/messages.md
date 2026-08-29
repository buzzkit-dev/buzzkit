# Messages & Deliveries

The send API — the product promise. One call targets subscribers by your ids, by topic or by segment; buzzkit resolves who is reachable (enabled, active subscriptions on the channel, topic×channel preferences, channel kill-switch), fans out through a durable queue, delivers via the tenant's provider credentials with progressive retries, and keeps endpoints clean from provider feedback. Every attempt — request, response, classification, latency — is kept. Nothing is lost. Tenant-context routes; scopes `messages:send` / `messages:read`.

## POST /v1/messages → 202 Accepted

```json
{
  "to": ["user_42", "user_43"],
  "topic": "gym-reminders",
  "title": "Leg day", "body": "Let's go.",
  "data": { "deepLink": "app://workouts/legs" },
  "ttlSeconds": 3600,
  "idempotencyKey": "workout-2026-08-20-user_42"
}
```

- **Targeting**: `to` (one id or up to 1000), `topic` (every opted-in subscriber), `segment` (every member of a [segment](segments.md), evaluated at send time and pinned to its current version, `targets.segmentVersion`), `where` (an inline [expression](segments.md#expressions), the same grammar as a segment, evaluated once for this send and stored verbatim in `targets.where` so the audience stays explainable; nothing is saved as a segment), or one of those combined with `topic` (filtered by the topic's preferences). At least one is required; `to`, `segment` and `where` are mutually exclusive (400 `targets_conflict`); an invalid `where` is a 400 `invalid_expression` whose `param` points at the node (`where.all[1]`); an unknown topic or segment is a 404, and a topic that is not offered on the message's channel is a 400 `channel_not_offered`.
- **Channel**: `channel` defaults to `push` (email sending arrives with the next phase → 400 for now). A channel disabled in tenant settings is a 400 `channel_disabled`; a channel the tenant has no credential for is a 400 `channel_not_connected` before anything is queued (`no_credential` on a delivery is reserved for a credential removed mid-flight).
- **Content**: at least one of `title`, `body`, `data`. Optional `subtitle`, `badge`, `sound`, `imageUrl`, `collapseId`, `priority` (`high` default | `normal`), and raw escape hatches `apns.payload` / `fcm.android` / `fcm.payload`. `apns.environment` picks sandbox vs production credentials (default production; falls back to whichever exists).
- **Expiry**: `ttlSeconds` (60s … 28 days, default 24h) → `expiresAt`. Passed to APNs (`apns-expiration`) and FCM (`android.ttl`); deliveries still pending at expiry are failed with `expired` — stale pushes never go out.
- **Idempotency**: send an `Idempotency-Key` header (or the `idempotencyKey` body field) — unique per tenant, never expires. A replay of the same request returns the original message with `202` + `Idempotent-Replayed: true` and sends nothing; the same key with a different request is a `409 idempotency_key_reused`.

- **Schedule**: `schedule: { at, timezone?, defaultTimezone? }` holds the message until a moment instead of sending now. `at` is a wall-clock time without an offset (`2026-09-01T10:00`); `timezone` is an IANA name (default `UTC`) or **`"subscriber"`**, in which case the message reaches each subscriber as their own clock reaches `at`, read from the `$timezone` attribute the SDK stamps on identify, and subscribers without one go out with `defaultTimezone` (default `UTC`). A moment that has already passed everywhere is a 400 `schedule_in_past`; a time that is not on the calendar (`2026-02-30T10:00`, `T24:00`), an unknown zone or a `defaultTimezone` outside a `subscriber` schedule is a 400 `invalid_schedule`. A `subscriber` schedule whose moment has already passed in some zones sends to those subscribers right away and waits for the rest (OneSignal's rule for per-user delivery). `ttlSeconds` counts from the last moment the message can go out, not from creation.

Returns the message (`msg_…`) immediately with `status: "queued"` (or `"scheduled"`, with `schedule` and `scheduledFor`, the first instant it can fire); delivery is asynchronous.

## Scheduled messages

A scheduled message is held with `status: "scheduled"` and released by the Worker's minute cron: a fixed-timezone message is queued when `scheduledFor` arrives and then behaves like any send; a `subscriber` schedule is released zone by zone, every minute fanning out to the subscribers whose timezone has just reached `at` (an expression send narrows the audience to `attributes.$timezone in [...]`, a direct or topic send filters by the same attribute in Postgres), so one message spreads over the 26 hours between UTC+14 and UTC−12 while its status reads `processing` and its counts grow. A zone is never sent twice: the message records the zones it has fanned out (`scheduledZones`), a batch that dies is retried on the next tick, and deliveries are unique per subscription. A fixed-timezone message whose fan-out job is lost after release is picked up by the five-minute stalled-fan-out sweep like any send; subscriber-timezone messages never need it, the tick re-releases any zone not yet marked done. Fan-out completes once the last timezone on earth has passed the moment.

`POST /v1/messages/:id/cancel` (`messages:send`) stops a message that has not been sent: a `scheduled` message becomes `canceled` (`canceledAt` set, nothing delivered); a `subscriber` schedule mid-way keeps the deliveries it already made and stops releasing zones, finishing as `completed` with `canceledAt` set. Anything else is a 400 `message_not_cancelable`. Both are audit entries (`message.created` carries `scheduledFor`, `message.canceled` the status it left).

## How delivery works

```
POST /v1/messages ──► queue: fanout(page) ──► deliveries (one per reachable subscription)
                                │                       │
                                └─ next page … ──►      ▼
                                              queue: deliver(attempt n) ──► provider.send()
                                                                              │
                                               ┌──────────────────────────────┴──────────────┐
                                            sent                       error → classified code
                                                                              │
                                                               retryable? ──► retrying, next_attempt_at,
                                                                              delayed re-enqueue (backoff)
                                                               endpoint dead? ──► invalid + subscription invalidated
                                                               else ──► failed
                                   every 5 min: reconciliation re-drives due retries, lost jobs,
                                                stalled fan-outs; expires overdue deliveries
```

- **Fan-out pages chain themselves** (500 subscriptions per job, cursor persisted on the message) — a million-subscriber topic is 2000 small jobs, resumable from the cursor if anything dies.
- **Retries are durable**: the next attempt is written to the row (`nextAttemptAt`) *and* scheduled on the queue with a delay; if the queue ever loses it, the reconciliation cron re-enqueues it. The schedule is explicit (Svix-style, tuned for push TTLs): retries at `5s, 30s, 2m, 10m, 30m, 1h, 2h` after the first attempt (8 attempts, ~3h45m total), each with ±20% jitter; provider `Retry-After` is honoured, and `rate_limited`/`timeout` carry a 60s floor so an overloaded provider is never hammered.
- **Exactly one provider call per attempt**: before calling the provider, the worker claims the attempt with an atomic lease (`UPDATE … WHERE attempts = n−1 AND lease expired`, 60s); a duplicate job — queue redelivery, or the cron racing the delayed retry — loses the claim and is skipped, so a duplicate can neither double-send nor double-count. Attempts are additionally unique per (delivery, attempt). A worker that dies mid-attempt leaves an expired lease, which the cron re-drives after 10 minutes.
- **Idempotent creation under concurrency**: `POST` with an `idempotencyKey` is insert-first (`ON CONFLICT DO NOTHING` on the per-tenant unique index) — five simultaneous identical requests create one message and all five get `202` with the same object (four carry `Idempotent-Replayed: true`). The request fingerprint is stored with the key, so a reused key with a different payload can never silently drop a send.
- **Counters are batched**: the consumer aggregates outcomes per message per batch (one update per message per 100 deliveries, no hot-row contention) and completion is checked once fan-out has finished.
- **Dead-letter queue** (`buzzkit-deliveries-dlq`) catches jobs that crash repeatedly — application-level exhaustion is always recorded in the DB, the DLQ only exists for bugs.

## One error language for every provider

Providers classify their native reasons into a shared taxonomy; **policy lives in the core, never in a provider**:

| Code | Retried | Effect |
|---|---|---|
| `invalid_endpoint` | no | delivery `invalid`, **subscription flipped to `invalid`** (+ `subscription.invalidated` event) — APNs 410/`BadDeviceToken`, FCM `UNREGISTERED` |
| `rate_limited`, `provider_unavailable`, `transport`, `timeout` | yes | `retrying` with backoff |
| `invalid_credential`, `payload_invalid`, `payload_too_large`, `unknown` | no | `failed` |
| `no_credential`, `expired`, `unsupported` | no | `failed` immediately |
| `unsubscribed` | no | `failed` immediately — the subscription was muted, removed, or invalidated between fan-out and this attempt; checked at attempt time so a retry hours later never reaches a user who opted out |

## Delivery statuses (Twilio/SendGrid-aligned)

`pending` (queued) → `retrying` (deferred) → **`sent`** (provider accepted — the most a push provider ever confirms) → `delivered` / `bounced` (asynchronous confirmations, for channels that report them — email/SMS webhooks, later) · `failed` (terminal) · `invalid` (endpoint dead).

## Reading results

- `GET /v1/messages/:id` — `status`, `counts { total, pending, sent, delivered, bounced, failed, invalid }`, `expiresAt`, `completedAt`, and `run: { id, step } | null` when a workflow step sent it ([workflows.md](workflows.md#runs)).

**Counter semantics.** `delivery` rows are the ground truth; `counts` is a projection of them. While a message is `processing`, counters advance incrementally (once per message per queue batch) so progress is visible; `pending` is derived (`total − sent − failed − invalid`, Stripe's `pending_webhooks`). Completion is **derived, never counted**: a message completes when fan-out has finished and no delivery is still `pending`/`retrying` (an index-backed existence check), at which point every counter is **recounted from the deliveries** and written exactly — so final numbers are correct even if a batch crashed mid-update. The reconciliation cron re-derives completion for any message left `processing` with nothing unsettled. Counters are a funnel: `total ≥ sent ≥ delivered`, `bounced ≤ sent`, and `sent + failed + invalid = total` at completion (`delivered`/`bounced` are sub-states of `sent`, written only by channels that confirm asynchronously).
- `GET /v1/messages/:id/deliveries?status=` — keyset-paginated deliveries (`total` included): `provider`, `status`, `attempts`, `lastErrorCode`, `lastErrorMessage`, `nextAttemptAt`, `firstAttemptedAt`, `lastAttemptedAt`, `sentAt`, `settledAt`, `providerMessageId`, plus who it went to: `externalId` (the subscriber's id) and the subscription's `platform` and `endpoint`.
- `GET /v1/deliveries/:id` — one delivery.
- `GET /v1/deliveries/:id/attempts` — **the ledger**: every attempt with `outcome`, `errorCode`, `providerReason`, `providerStatus`, the exact `request` payload sent, the captured `response` (first 4KB), `latencyMs`, `nextAttemptAt`. Credentials and auth headers are never stored.
- `GET /v1/messages` — newest-first, keyset-paginated with `total`. Filters combine with AND: `q` (case-insensitive match on title, body, topic and the target ids), `status` (`scheduled` / `queued` / `processing` / `completed` / `canceled`), `channel`, `topic` (slug), `from` / `to` (ISO timestamps on `createdAt`).
