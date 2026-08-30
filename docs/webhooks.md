# Webhook delivery

Webhooks are deliveries of the two ledgers buzzkit keeps: the control-plane **audit log** ([api/audit.md](api/audit.md)) and the subscriber **event stream** ([api/events.md](api/events.md)). One endpoint receives both, filtered by name, signed the same way, retried on the same schedule, and reachable through the same delivery ledger. The design follows what Stripe and Svix converge on, and the code is a port of feedbase's engine extended for buzzkit's two producers and multi-tenancy.

```
control plane:  mutation → audit INSERT (awaited, durable before the response)
                          → waitUntil(enqueue {audit id})            ← lost enqueues healed by the sweep
subscribers:    actor write → flush batch → buzzkit-events queue (Tinybird)
                                          → buzzkit-webhooks queue (same rows, same watermark)
consumer:       hydrate the event once → webhook_event row → one webhook_delivery per matching endpoint
                → sign + POST → webhook_attempt row → success | retry (delayed queue message) | exhausted
sweep (5 min):  public audit rows without a webhook_event + stale deliveries → re-enqueued
```

- **Two producers, one watermark each.** The audit logger enqueues after its awaited insert, fire-and-forget; the actor sends every flushed batch to the webhooks queue next to the Tinybird queue and only advances its watermark when both sends succeeded. Both paths are at-least-once; the consumer is idempotent: `webhook_event` is unique per `(source, sourceId)` and `webhook_delivery` per `(endpoint, event)`, so a duplicate message never delivers twice.
- **Event objects, not notifications.** Every delivery carries an immutable event with its own id (`whe_…`), `type`, `apiVersion`, `createdAt`, the workspace and tenant, and `data.object`, the resource the event concerns: for control-plane events the hydrated tenant, topic, message, credential, member, invite or workspace (with `previousAttributes` and `changes` on `*.updated`); for stream events the event record itself with its `subscriber`. The payload is built once and stored; retries and replays re-send the exact snapshot (Stripe semantics). `GET /v1/workspaces/:slug/webhooks/events/:id` returns the same object, so a receiver can fetch instead of trusting the body.
- **Signing per [Standard Webhooks](https://www.standardwebhooks.com).** Headers `webhook-id` (the event id, stable across retries), `webhook-timestamp` (unix seconds) and `webhook-signature` (`v1,<base64 HMAC-SHA256 over "id.timestamp.body">`). Secrets are `whsec_<base64>`; a rotation keeps the previous secret valid for 24 hours and sends both signatures, space separated, so a receiver rolls over without a gap. `buzzkit/webhooks` ships `verifyWebhook(body, headers, secret)` (five-minute tolerance, constant-time compare) and `signWebhook` for tests.
- **Every attempt is claimed atomically.** Before a request goes out, the consumer bumps `attempts` with a compare-and-set on the number it read (`UPDATE … WHERE attempts = n AND status IN (pending, failed)`); a duplicate queue message processed concurrently loses the claim and does nothing, so no delivery is ever attempted twice with the same attempt number, and the event object is written and stamped with its id in one transaction, so a concurrent duplicate never sees a half-written event.
- **Redirects are never followed.** A 3xx answer is a failed attempt like any other non-2xx (Stripe and Svix do the same): following one would let a public URL bounce a delivery to a private address the URL check refused.
- **A deliver message is a no-op before its time.** The consumer only attempts a delivery whose `nextAttemptAt` has passed, so a duplicated, replayed or batch-retried queue message can never double-attempt. That matters because workerd reports an unresolvable receiver as an uncaught internal error even when the fetch rejection is caught, which fails the whole consumer invocation and makes the queue redeliver the batch; every other delivery in that batch stays untouched.
- **Retries** (Stripe parity): non-2xx, a timeout (30 s) or a network error is a failed attempt; retries follow 5 m, 30 m, 2 h, 5 h, 10 h, then every 12 h, ten attempts in all over about three days, then `exhausted`. Every attempt is a row: status, error, duration, the first 4 KB of the response.
- **Auto-disable**: an endpoint that has failed continuously for three days is disabled (`disabledReason: failing for three days`, an audit entry `webhook.disabled` by the system actor); any success resets the streak; `PATCH { enabled: true }` re-enables, clears it, and re-enqueues the deliveries that were left pending or failed, so recovery is immediate rather than waiting for the sweep. A replay against a disabled endpoint is refused (`endpoint_disabled`).
- **Reconciliation**: every five minutes the sweep re-enqueues public audit rows of the last hour that have no `webhook_event` and that at least one enabled endpoint of their workspace (respecting its tenant filter) subscribes to, and re-enqueues deliveries whose retry never came (queue hiccups); both capped at 500 per sweep, oldest first, so a backlog heals over a few sweeps without starving the cron. A lost enqueue heals in minutes.
- **An endpoint receives what happened after it existed.** Matching happens when a queue message is consumed, so the consumer also checks that the endpoint was created before the event occurred; the sweep goes one step further and heals only events newer than the endpoint's last change, so creating, editing or re-enabling an endpoint never back-delivers the past hour (re-enabling retries its own pending and failed deliveries instead).
- **Ordering is not promised** (nor by Stripe): receivers dedupe on `webhook-id` and order on `createdAt` or the stream `sequence` inside `data.object`.
- **Endpoints are workspace-level** with an optional tenant filter; subscriptions are exact names, `resource.*` patterns, `*`, or the tenant's own event names (`order.completed`, `order.*`). Private audit names (`key.*`, `webhook.*`, `profile.*`) can never be subscribed. In production, URLs must be `https` and publicly routable.

Workflow run events (`$run.started`, `$run.step`, `$run.completed`, `$run.canceled`, `$run.failed`) are stream events like any other: subscribe to `$run.*` and every run of every workflow reaches the endpoint with its `runId`, `workflow`, `workflowId`, `versionId` and `startedAt` ([api/workflows.md](api/workflows.md#runs)).

## Payload

```json
{
  "id": "whe_…",
  "type": "$subscription.registered",
  "apiVersion": "v1",
  "createdAt": "2026-08-27T10:00:00.000Z",
  "workspace": { "id": "ws_…", "slug": "acme" },
  "tenant": { "id": "tnt_…", "slug": "default" },
  "data": {
    "object": {
      "id": "evt_…", "sequence": 3, "name": "$subscription.registered", "source": "system",
      "timestamp": "…", "receivedAt": "…",
      "data": { "externalId": "user_42", "channel": "push", "platform": "ios", "endpoint": "…" },
      "subscriber": { "id": "sub_…", "externalId": "user_42" }
    }
  }
}
```

Control-plane events add `actor` (`{ type, display }`), `target` (`{ type, id }`) and `request` (`{ id }`, the API request that caused it, Stripe's `request.id`), and spread the audit entry's own data next to `object` (`changes`, `previousAttributes`, `name`, …).

## Verifying

```ts
import { verifyWebhook } from 'buzzkit/webhooks';

const { id } = await verifyWebhook(rawBody, request.headers, process.env.BUZZKIT_WEBHOOK_SECRET);
```

Read the raw body before parsing it, verify, then dedupe on `id`. The helper accepts an array of secrets while you rotate.

Both horizons (an endpoint's `createdAt` against the event's time, its `updatedAt` against the audit row's time in the sweep) compare exactly: endpoint and audit timestamps are both Postgres `now()`, so there is no clock to reconcile. An earlier 5-second slack "for clock skew" let a freshly created tenant-filtered endpoint receive the `tenant.created` and `credential.created` rows from the seconds before it existed whenever the queue consumer ran later than that, which the edges test caught (2026-08-29).
