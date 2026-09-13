# Messages

Everything sent goes through `POST /v1/messages` (scope `messages:send`, inside a tenant). It takes an audience, content and options, answers `202` with the message and `status: "queued"`, then resolves who is reachable and fans out in the background. The `202` says accepted, not delivered. Docs: `https://docs.buzzkit.dev/sending/messages`, `sending/scheduling`, `sending/delivery`.

```ts
const message = await buzzkit.messages.send({
  to: 'user_42',
  topic: 'order-updates',
  title: 'Your order shipped',
  body: 'Arrives Thursday',
  data: { orderId: 'ord_1' },
  deepLink: 'app://orders/ord_1',
  idempotencyKey: 'order-ord_1-shipped',
});
```

## Audience

At least one of these; `to`, `segment` and `where` are mutually exclusive (`400 targets_conflict`), `topic` combines with any of them as a filter.

| Field | Reaches |
| --- | --- |
| `to` | One subscriber id, or an array of up to 1000 ids. |
| `topic` | Every subscriber opted in to the topic on the message's channel. With another target, narrows it to those whose preference allows the message. |
| `segment` | Every member of a saved segment, evaluated at send time and pinned to the version used (`targets.segmentVersion`). |
| `where` | An inline expression in the segment grammar, evaluated once and stored verbatim as `targets.where`. |

An unknown topic or segment is `404`; a topic not offered on the channel is `400 channel_not_offered`; an invalid expression is `400 invalid_expression` with `param` naming the node.

## Content

At least one of `title`, `body`, `data` (`400 payload_missing`).

| Field | Purpose |
| --- | --- |
| `title`, `subtitle`, `body` | The text. |
| `data` | Your JSON, delivered alongside the notification, at the payload root on iOS. |
| `badge` | App icon badge number. |
| `sound` | Sound to play. |
| `imageUrl` | Image attached to the notification (needs the iOS service extension). |
| `threadId` | Groups related notifications. |
| `collapseId` | The provider's collapse identifier: a newer message replaces the older one. |
| `targetContentId` | The app content the notification refers to. |
| `priority` | `high` (default) or `normal`. |
| `interruptionLevel` | `passive`, `active`, `timeSensitive`, `critical`. |
| `relevanceScore` | 0 to 1. |
| `category` | The notification category. |
| `actions` | Up to four buttons, each `{ id, title, destructive?, foreground?, input?, placeholder? }` (needs the service extension). |
| `deepLink` | A link the app opens on tap. |
| `action` | `{ name, data }`, a handler the app registered. |
| `policy` | `"ignore"` bypasses the tenant send policy (quiet hours, daily cap): the security-alert class of message. |
| `channel` | `push` (default) or `email`. |
| `ttlSeconds` | 60 to 2,419,200 (28 days), default 86,400. Becomes `expiresAt`; passed through as `apns-expiration` / `android.ttl`; deliveries still pending when it passes fail with `expired`. |
| `apns.payload`, `apns.environment` | Merged into the APNs payload; `sandbox` or `production` (default production, falling back to whichever exists). |
| `fcm.android`, `fcm.payload` | Merged into the FCM Android block / message. |

## Idempotency

`Idempotency-Key` header or `idempotencyKey` field; unique per tenant, never expires. A replay returns the original message with `202` and `Idempotent-Replayed: true` and sends nothing. The same key with a different body is `409 idempotency_key_reused`. Creation is insert-first, so simultaneous identical requests create one message. The SDK generates a random key when none is given; pass a meaningful one from server code (`order-${id}-shipped`).

## Scheduling

```json
"schedule": { "at": "2026-09-04T18:00", "timezone": "Europe/Berlin" }
"schedule": { "at": "2026-09-04T09:00", "timezone": "subscriber", "defaultTimezone": "UTC" }
```

`at` is a wall-clock time with no offset; `timezone` (IANA, default `UTC`, or `"subscriber"`) says whose clock. With `"subscriber"` the message reaches each person as their own `$timezone` reaches `at` (set from the device, or from the backend's `timezone` on identify); `defaultTimezone` covers subscribers without one. The response is `202` with `status: "scheduled"` and `scheduledFor`; zones are released by a minute cron and never sent twice. A moment already past everywhere is `400 schedule_in_past`; a subscriber schedule partly in the past sends the passed zones at once. Invalid calendar times, unknown zones, or `defaultTimezone` outside a subscriber schedule are `400 invalid_schedule`. `ttlSeconds` counts from the last moment the message can go out.

`POST /v1/messages/:id/cancel` (scope `messages:send`): a `scheduled` message becomes `canceled`; a subscriber schedule mid-fan-out keeps what went out and finishes `completed` with `canceledAt`; anything else is `400 message_not_cancelable`. Recurring or reactive sends are workflows.

## Delivery

Fan-out resolves who is reachable: the subscriber is enabled, has an active subscription on the channel, the topic and channel preference allows it, the channel is enabled for the tenant. One delivery per surviving subscription, in pages of 500 with a persisted cursor. Each attempt is one provider call under a 60-second lease (no double sends), recorded with `outcome`, `errorCode`, `providerReason`, `providerStatus`, `request`, `response` (first 4 KB), `latencyMs`, `nextAttemptAt`; credentials are never stored.

| Code | Retried | Effect |
| --- | --- | --- |
| `rate_limited`, `provider_unavailable`, `transport`, `timeout` | Yes | `retrying` at 5s, 30s, 2m, 10m, 30m, 1h, 2h (±20% jitter, `Retry-After` honored, 60s floor for rate limits and timeouts) |
| `invalid_endpoint` (APNs 410 / `BadDeviceToken`, FCM `UNREGISTERED`) | No | Delivery `invalid`, subscription flipped to `invalid`, `$subscription.invalidated` emitted |
| `invalid_credential`, `payload_invalid`, `payload_too_large`, `unknown` | No | `failed` |
| `no_credential`, `expired`, `unsupported`, `unsubscribed` | No | `failed` immediately (`unsubscribed` is checked at attempt time, so a mute between fan-out and a retry stops it) |

Delivery statuses: `pending`, `retrying`, `sent` (the provider accepted it, the most push confirms), `delivered` and `bounced` (asynchronous confirmations on channels that report them), `failed`, `invalid`. A reconciliation cron every five minutes re-drives lost jobs and expires overdue deliveries.

## Reading results

```
GET /v1/messages/:id                       → status, expiresAt, completedAt, run, counts { total, pending, sent, delivered, bounced, failed, invalid }
GET /v1/messages/:id/deliveries?status=failed  → one per subscription: provider, status, attempts, lastErrorCode, lastErrorMessage, nextAttemptAt, sentAt, settledAt, providerMessageId, externalId, platform, endpoint
GET /v1/deliveries/:id                     → one delivery
GET /v1/deliveries/:id/attempts            → the full ledger
GET /v1/messages?status=&channel=&topic=&q=&from=&to=  → the tenant's messages
GET /v1/subscribers/:externalId/deliveries → what one person received, with a message summary
```

Message statuses: `scheduled`, `queued`, `processing`, `completed`, `canceled`. Counts advance while `processing` and are recounted exactly at completion, when `sent + failed + invalid = total`.

Debug a send in this order: the message's `counts` for the shape of the failure, then the deliveries filtered by `status` for who it hit, then one delivery's attempts for what the provider said. `counts.total: 0` means nobody was reachable. Device-side receipts (`$notification.delivered`, `$notification.opened`) are events on the subscriber, not delivery statuses; open rates come from them.

## Live Activities

`POST /v1/live-activities/send` (scope `messages:send`): `to`, `event` (`start` | `update` | `end`), `activityId` (update/end) or `attributesType` (start), `contentState` (required), `attributes` (start), `alert { title, body, sound }` (required for start, else `alert_missing`), `staleDate`, `dismissalDate`, `priority`, `timestamp` (epoch seconds; iOS ignores updates older than one applied). The reply is `{ results: [{ id, ok, code?, reason? }] }`, one per registered token. In the SDK: `buzzkit.liveActivities.send(params)`.

## Errors specific to sending

`targets_conflict`, `payload_missing`, `invalid_expression`, `channel_not_offered`, `channel_disabled`, `channel_not_connected` (no credential; refused before anything is queued), `channel_unsupported`, `schedule_in_past`, `invalid_schedule`, `idempotency_key_reused`, `message_not_cancelable`, `alert_missing`.
