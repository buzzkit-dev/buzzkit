# Sources and webhooks

Two directions of integration. A **source** turns another service's webhooks into events on a subscriber's stream (inbound). A **webhook endpoint** pushes what happened in BuzzKit to a URL the user owns (outbound).

## Sources (inbound)

A source is an inbound webhook endpoint of a tenant. Stripe posts `customer.subscription.created`, the source verifies the signature, finds the subscriber, and records `subscription.started` on their timeline with `source: "webhook"` and `data.$provider: "stripe"`, so segments, workflow triggers and cancel rules see it with no backend code. Scopes `sources:read` / `sources:write`. Grammar: `buzzkit/sources`. Docs: `https://docs.buzzkit.dev/automation/sources`.

```ts
const source = await buzzkit.sources.create({ name: 'Stripe billing', provider: 'stripe', secret: 'whsec_…' });
```

`provider` is `stripe`, `superwall`, `revenuecat` or `custom`; each fills in a verification scheme and a default mapping, both stored on the source and editable. The response carries the ingest `url`, `verification`, `mapping`, `hasSecret` and `status`:

| Status | Meaning |
| --- | --- |
| `unverified` | No secret. The endpoint records what each delivery looks like but creates no events. |
| `active` | Deliveries are verified and mapped into events. |
| `paused` | Verified and recorded, then dropped with reason `paused`. |

Create the source without a secret first, point the provider at the ingest URL, read the deliveries it records to see real payloads, then add the secret to activate it (`source_unverified` if you activate without one).

**Verification** (`PATCH { verification }`): `{ "scheme": "stripe", "header": "stripe-signature" }` (HMAC with a timestamp and tolerance; RevenueCat signs the same way), `{ "scheme": "standard-webhooks", "headers": { "id": "svix-id", "timestamp": "svix-timestamp", "signature": "svix-signature" } }` (Superwall), or `{ "scheme": "header", "header": "x-buzzkit-secret" }` (custom shared secret, constant-time compared). A shape that fails lint is `invalid_verification` with `details.problems`. Secrets are sealed at rest and never returned.

**Mapping** — how one provider payload becomes one event:

```json
{
  "type": "type",
  "id": "id",
  "timestamp": "created",
  "subscriber": { "path": "data.object.customer", "attribute": "stripeCustomerId" },
  "events": { "customer.subscription.created": "subscription.started", "invoice.paid": "payment.succeeded" },
  "data": { "status": "data.object.status", "plan": "data.object.plan.nickname" },
  "where": { "ref": "livemode", "eq": true }
}
```

| Key | Does |
| --- | --- |
| `type` | Path to the provider's event type. Required. |
| `id` | Path to the provider's event id, for dedupe. |
| `timestamp` | Path to when it happened (seconds, ms or ISO). |
| `subscriber` | A path to the external id, or `{ path, attribute }` to match the value at `path` against a subscriber attribute. |
| `events` | Provider type to event name. `true` keeps the provider's name; `{ "*": true }` passes every type. |
| `data` | Event data, each key a path in the payload. |
| `where` | The segment grammar over the payload, bare paths as references. |

Paths are dotted and index arrays (`a.b.0.c`). At most 50 mapped types and 20 data paths; produced names follow the tracking rules (no `$`). A bad mapping is `invalid_mapping` with `details.problems`. `POST /v1/sources/:id/preview { payload, mapping? }` runs a mapping over a sample exactly as ingest would (signature and dedupe skipped) and returns `{ outcome, event?, reason?, detail?, suggestions }`, where `suggestions` carries the detected provider and candidate paths.

**Ingest and deliveries**: the provider's signature is the credential, so `POST /v1/sources/:id/ingest` is unauthenticated and verifies the raw body and headers as received. Every request is a delivery with one outcome: `unverified` (200), `rejected` (401, reason `missing_headers` / `invalid_signature` / `timestamp_out_of_tolerance`), `dropped` (200, reason `no_type` / `unlisted_type` / `filtered` / `no_subscriber` / `invalid_data` / `paused`), `duplicate` (200), `event` (200). `GET /v1/sources/:id/deliveries?outcome=` lists them with the raw payload kept 30 days. Changes are audit entries and public webhook events (`source.created`, `source.updated`, `source.deleted`); a replaced secret shows only as `secret: "replaced"`.

Sources are the way to get `subscription.*`, `payment.*` and paywall events onto the timeline without writing or maintaining backend webhook handlers, so workflows and segments can use billing state directly.

## Webhook endpoints (outbound)

Endpoints belong to the workspace, so routes take the workspace slug and a workspace-context key; tenant keys are refused. `webhooks:read` is member-level, `webhooks:write` admin. Docs: `https://docs.buzzkit.dev/platform/webhooks`.

```ts
const endpoint = await buzzkit.workspace('acme').webhooks.create({
  url: 'https://hooks.example.com/buzzkit',
  description: 'Production receiver',
  events: ['$subscription.registered', 'message.*'],
  tenant: 'gymly',
});
```

The signing secret (`whsec_`) is returned in full only at creation. `tenant` narrows the endpoint to one tenant. At most 50 endpoints; in production the URL must be `https` and publicly routable (`400 invalid_url` for credentials or a private address). `events` takes exact names, `resource.*` patterns, `*` for everything public, or the tenant's own names (`order.completed`, `order.*`); omit for every public event. `GET …/webhooks/catalog` returns the subscribable events grouped by resource. Private audit names (`key.*`, `webhook.*`, `profile.*`) cannot be subscribed (`400 invalid_event`). An endpoint only receives what happened after it existed. Both ledgers flow through one endpoint: the control-plane audit log and the subscriber event stream, including `$run.*`.

**Payload**: an immutable event object built once and stored, so retries and replays re-send the same snapshot.

```json
{ "id": "whe_…", "type": "$subscription.registered", "apiVersion": "v1", "createdAt": "…",
  "workspace": { "id": "ws_…", "slug": "acme" }, "tenant": { "id": "tnt_…", "slug": "gymly" },
  "data": { "object": { "id": "evt_…", "sequence": 3, "name": "$subscription.registered", "source": "system",
    "data": { "externalId": "user_42", "channel": "push", "platform": "ios" }, "subscriber": { "id": "sub_…", "externalId": "user_42" } } } }
```

Control-plane events add `actor`, `target`, `request`; `*.updated` events add `changes` and `previousAttributes`. Ordering is not promised: dedupe on the `webhook-id` header and order on `createdAt` or the `sequence` inside `data.object`.

**Verifying** (Standard Webhooks): every request carries `webhook-id` (the event id, stable across retries), `webhook-timestamp` (unix seconds) and `webhook-signature` (`v1,<base64 HMAC-SHA256 over "id.timestamp.rawBody">`).

```ts
import { verifyWebhook } from 'buzzkit/webhooks';
const rawBody = await request.text();
const { id } = await verifyWebhook(rawBody, request.headers, process.env.BUZZKIT_WEBHOOK_SECRET);
```

Verify the exact bytes before parsing, then dedupe on `id`. `verifyWebhook` rejects anything older than five minutes and accepts an array of secrets during rotation.

**Deliveries and retries**: `GET …/webhooks/:id/deliveries?status=pending|success|failed|exhausted`, `GET …/:id/deliveries/:deliveryId`, `POST …/:id/deliveries/:deliveryId/replay`. A 2xx is success; anything else (non-2xx, a 30s timeout, a network error, a followed-nowhere 3xx) is a failed attempt. Retries run at 5m, 30m, 2h, 5h, 10h then every 12h, ten attempts over about three days, then `exhausted`. An endpoint failing continuously for three days is disabled; any success resets the streak; `PATCH { enabled: true }` clears it and re-enqueues what was pending. `POST …/rotate` gives a new `whsec_`; the old one keeps verifying for 24 hours and both signatures are sent, so pass both to `verifyWebhook` until it expires.

Use an outbound webhook when a backend must react to what BuzzKit did (a delivery bounced, a run completed, a subscriber was created). Use a source when BuzzKit should react to what another service did.
