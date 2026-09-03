---
name: buzzkit
description: Integrate BuzzKit push notifications into an app. Register devices with the iOS SDK, identify subscribers, send messages from a backend, and set up topics, segments, scheduled sends and workflows through the REST API.
---

# Integrating BuzzKit

BuzzKit is the open source notification orchestration layer: a REST API, a dashboard and an iOS SDK that send, segment, schedule and automate push on the workspace's own APNs and FCM credentials, self-hosted or hosted. Use this skill when a user wants push notifications in their app, wants to send push from their backend, or asks for segments, notification preferences, scheduled sends or lifecycle automation.

## Keys and authentication

Every server call carries `Authorization: Bearer <key>`. Keys come from the dashboard:

- Workspace keys reach every tenant of the workspace.
- Tenant keys are scoped to one tenant. Prefer them in application backends.
- Client keys (`bk_pk_…`) are safe to ship inside an app binary and only work on `/v1/client/*`.

Tenant-context routes take a `buzzkit-tenant` header when the key is not already tenant-scoped. All paths below are relative to `/v1` on the BuzzKit host (the hosted API or a self-hosted deployment).

## Server quickstart

1. Identify a subscriber (idempotent upsert, addressed by your own user id):

```
PUT /v1/subscribers/user_42
{ "attributes": { "name": "Maya", "plan": "pro" }, "timezone": "Europe/Berlin" }
```

2. Send a message:

```
POST /v1/messages
{
  "to": "user_42",
  "title": "Leg day",
  "body": "Let's go. 6:00 with Maya.",
  "deepLink": "app://workouts/legs",
  "idempotencyKey": "workout-2026-09-01-user_42"
}
```

Targeting is one of `to` (up to 1000 ids), `topic`, `segment` (a saved segment's slug) or `where` (an inline expression using the segment grammar), optionally combined with `topic`. The API answers 202 with the message and asynchronous delivery. Always send an idempotency key from server code; a replay returns the original message and sends nothing.

3. Read results: `GET /v1/messages/:id` for status and counts, `GET /v1/messages/:id/deliveries` for per-device outcomes, `GET /v1/deliveries/:id/attempts` for the full attempt ledger.

4. Track events that segments and workflows react to:

```
POST /v1/events
{ "events": [{ "externalId": "user_42", "name": "workout.completed", "data": { "duration": 42 }, "id": "<uuid>" }] }
```

Give every event a unique `id` and retry on 429 or 5xx until a 202 arrives; replays are answered as duplicates.

## iOS quickstart

Add the package from https://github.com/buzzkit-dev/buzzkit-ios, then:

```swift
BuzzKit.configure(apiKey: "bk_pk_…")
BuzzKit.identify("user_42")
try await BuzzKit.registerForPush()
BuzzKit.track("workout.completed", data: ["duration": 42])
```

The SDK registers the device token, queues events offline with replay, handles notification action buttons and deep links, and renders notification preferences from the client API.

## Common tasks

- Notification settings screen: `GET /v1/client/preferences` returns the resolved topic list per channel; `PATCH` with `{ "preferences": { "gym-reminders": false } }` saves a choice. Topics are created with `POST /v1/topics`.
- Local-time delivery: add `"schedule": { "at": "2026-09-02T09:00", "timezone": "subscriber" }` to a send and each subscriber receives it as their own clock reaches 9:00.
- Segments: `POST /v1/segments` with an expression such as `{ "all": [{ "ref": "attributes.plan", "eq": "pro" }, { "count": "workout.completed", "within": "7d", "gte": 3 }] }`; preview membership with `POST /v1/segments/preview`.
- Workflows: `POST /v1/workflows` with a spec (trigger, steps with `wait`, `waitUntil`, `waitFor`, `branch`, `fetch`, `send`), then `POST /v1/workflows/:slug/publish`. Test any version first with `POST /v1/workflows/:slug/test`, which runs the spec without sending.
- Inbound webhooks: `POST /v1/sources` turns Stripe, Superwall, RevenueCat or custom webhooks into subscriber events.

## Reference

- API Reference: https://docs.buzzkit.dev
- Full endpoint docs: https://github.com/buzzkit-dev/buzzkit/tree/main/docs/api
- llms.txt: https://buzzkit.dev/llms.txt
