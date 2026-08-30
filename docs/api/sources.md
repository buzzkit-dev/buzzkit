# Sources

A source is an inbound webhook endpoint of a tenant that turns another service's webhooks into events on the subscriber's stream. Stripe posts `customer.subscription.created`, the source verifies the signature, finds the subscriber the payload is about, and records `subscription.started` on their timeline as if your backend had tracked it (`source: "webhook"`, `data.$provider: "stripe"`), so segments, workflow triggers and cancel rules see it without any code on your side. Tenant-context routes: a tenant key implies its tenant; workspace keys and sessions select one with `buzzkit-tenant`.

A provider is a template, nothing more: `stripe`, `superwall`, `revenuecat` and `custom` each fill in a verification scheme and a default mapping when the source is created (and give it a label and a logo), and both are stored on the source and editable afterwards. Anything a Stripe source does, a custom source can be configured to do. The grammar lives in `@buzzkit/schema/sources` and is validated by the API and the dashboard alike.

## The source object

```jsonc
{
  "id": "src_…",
  "name": "Stripe billing",
  "provider": "stripe",                          // stripe | superwall | revenuecat | custom
  "status": "active",                            // unverified | active | paused
  "url": "/v1/sources/src_…/ingest",             // the ingest path, relative to the API origin
  "verification": { "scheme": "stripe" },        // how deliveries are verified, filled by the preset, editable
  "hasSecret": true,
  "mapping": { … },                              // below
  "lastDeliveryAt": "2026-08-30T16:54:52.367Z",
  "createdAt": "…",
  "updatedAt": "…"
}
```

`status` starts `unverified` when no secret was given: the endpoint answers every delivery, records it with what it looks like, and creates no events. Setting a secret activates the source; `paused` keeps verifying and recording but drops every delivery (`reason: "paused"`). Activating without a secret is refused (`source_unverified`).

Where the secret comes from: Stripe shows the endpoint's signing secret (`whsec_…`) under Developers → Webhooks after you add the ingest URL; Superwall shows it with **Copy Secret** on the webhook you create in its dashboard (`whsec_…`, base64 after the prefix, [their verification guide](https://superwall.com/docs/integrations/webhooks/verify)); RevenueCat shows it once when **HMAC webhook signing** is toggled on for the integration ([their guide](https://www.revenuecat.com/docs/integrations/webhooks)); for `custom` you choose the value and send it in `x-buzzkit-secret`.

## Verification

```jsonc
{ "scheme": "stripe", "header": "stripe-signature" }                                         // t=…,v1=… HMAC in one header; the header is configurable (RevenueCat signs the same way under x-revenuecat-webhook-signature)
{ "scheme": "standard-webhooks", "headers": { "id": "svix-id", "timestamp": "svix-timestamp", "signature": "svix-signature" } }
{ "scheme": "header", "header": "x-buzzkit-secret" }                                         // a shared secret in one header
```

The `stripe` preset uses the first (RevenueCat too, under its own header), `superwall` the second with Svix header names (Standard Webhooks senders use `webhook-id`, `webhook-timestamp`, `webhook-signature`), `custom` the third. Any source may switch (`PATCH { verification }`); a shape that fails lint is refused with `invalid_verification` and `details.problems`.

How each scheme works: Stripe's `Stripe-Signature` header (`t=…,v1=…`, HMAC-SHA256 hex over `${t}.${body}`, five minutes of tolerance, several `v1` values accepted during a rotation); Superwall's Standard Webhooks headers `svix-id`, `svix-timestamp`, `svix-signature`, verified with the same code as `buzzkit/webhooks`; `custom` compares the `x-buzzkit-secret` header with the secret in constant time. Secrets are sealed at rest like credentials and workflow secrets (a data key per source, re-wrapped by the five-minute sweep after a rotation) and never returned.

## The mapping

```jsonc
{
  "type": "type",                                  // path to the provider's event type (required)
  "id": "id",                                      // path to the provider's event id: deduplication
  "timestamp": "created",                          // path to when it happened: seconds, milliseconds or ISO
  "subscriber": { "path": "data.object.customer", "attribute": "stripeCustomerId" },
  "events": {                                      // provider type → event name; true keeps the provider's name (lowercased to fit event names); { "*": true } passes every type through
    "customer.subscription.created": "subscription.started",
    "invoice.paid": "payment.succeeded"
  },
  "data": { "status": "data.object.status", "plan": "data.object.plan.nickname" },   // event data, key → path
  "where": { "ref": "livemode", "eq": true }       // the segment expression grammar over the payload
}
```

`subscriber` is a path to the subscriber's external id, or `{ path, attribute }` to match the value at `path` against a subscriber attribute (Stripe's customer id kept as `stripeCustomerId` on identify). Paths are dotted, `a.b.0.c`; at most 50 mapped types and 20 picked data paths; event names follow the tracking rules (never `$`-prefixed). `where` uses the expression grammar of segments with bare payload paths as references (`buzzkit/expressions` lint with `any` refs). A mapping that fails lint is refused with `invalid_mapping` and `details.problems: [{ path, message }]`.

## What happens to a delivery

Every request to the ingest URL is recorded as a delivery with one outcome:

| Outcome | When | Response |
| --- | --- | --- |
| `unverified` | The source has no secret; recorded with `detail: "Looks like stripe"` when the provider is recognizable | 200 |
| `rejected` | The signature or secret is wrong, missing or stale (`reason`: `missing_headers`, `invalid_signature`, `timestamp_out_of_tolerance`) | 401 |
| `dropped` | The mapping did not produce an event: `no_type`, `unlisted_type`, `filtered` (by `where`), `no_subscriber`, `invalid_data` (not a JSON object, or the events API refused it, for instance a timestamp older than 7 days), `paused` | 200 |
| `duplicate` | The provider's event id already became an event on this source | 200 |
| `event` | Tracked on the subscriber: `event` (name), `eventId`, `subscriberId` | 200 |

The body is `{ outcome, reason }`; providers only need the status. Bodies above 256 KB are refused with `payload_too_large` (400). An unknown or deleted source answers 404. Deliveries keep the raw payload for 30 days (the five-minute sweep purges older rows).

## Endpoints

- `GET /v1/sources` — the tenant's sources.
- `POST /v1/sources` — `{ name, provider, verification?, mapping?, secret? }`. Without `verification` or `mapping` the preset's are used; with `secret` the source is `active` at once, otherwise `unverified`. 201.
- `GET /v1/sources/:id`
- `PATCH /v1/sources/:id` — `{ name?, provider?, verification?, mapping?, secret?, status? }` (`status`: `active` | `paused`). A new `secret` replaces the old one and activates an unverified source.
- `DELETE /v1/sources/:id` — soft delete; the ingest URL answers 404 from then on.
- `POST /v1/sources/:id/ingest` — the provider's endpoint. Unauthenticated: the provider's signature is the credential. Raw body and headers are verified exactly as received.
- `POST /v1/sources/:id/preview` — `{ payload, headers?, mapping? }` runs a mapping (the stored one, or the `mapping` given) over a sample exactly as ingest would, subscriber lookup included: `{ outcome: event | dropped, event? (with the resolved externalId), reason?, detail?, suggestions }`. The signature check and deduplication are skipped, so a stored delivery's payload previews cleanly; `suggestions` carries the detected provider and candidate paths for `type`, `id`, `timestamp`, `subscriber` and `data`, the same detection the dashboard runs on a pasted payload.
- `GET /v1/sources/:id/deliveries` — newest first, cursor-paginated (`limit`, `cursor`), filterable with `outcome` and carrying `total`: `{ id: "sdl_…", providerEventId, providerType, outcome, reason, detail, subscriberId, event, eventId, payload, receivedAt }`. `providerType` and `providerEventId` are read through the mapping's `type` and `id` paths on every outcome the payload allows, so a rejected or filtered delivery still says what it was.

Scopes: `sources:read` (members, keys), `sources:write` (admins, keys). Audit: `source.created`, `source.updated` (`changes` plus `previousAttributes` with the old values, Stripe style, and `secret: "replaced"` when one was set; secret material is never diffed), `source.deleted`, all delivered to webhooks.
