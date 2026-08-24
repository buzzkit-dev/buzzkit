# Subscribers & Subscriptions

Subscribers are YOUR users, addressed everywhere by YOUR id (`externalId`) — buzzkit is the subscriber table, so apps need no user bookkeeping of their own. A **subscription** is one way to reach a subscriber on one channel: a push subscription is a device (platform + token), an email subscription is an address, a future SMS subscription is a phone number. Nothing channel-specific ever lands on the subscriber row — new channels are new subscription shapes, and a subscriber can hold several per channel (two phones, two emails). Tenant-context routes (`buzzkit-tenant` selects the tenant; default when absent).

## Subscribers — scopes `subscribers:read` / `subscribers:write`

- `PUT /v1/subscribers/:externalId` — identify/upsert: `{ attributes?, email? }` → 201 on create, 200 after. `attributes` is free-form JSONB (object-typed, enforced in the DB) (tag data; segments filter on it in Phase 8), replaced wholesale when present, capped at 64KB serialized. `email` is sugar that upserts an email subscription.
- `GET /v1/subscribers` — keyset-paginated list, newest first. Each item also carries `lastSeenAt` (the newest `lastSeenAt` across the subscriber's live subscriptions, `null` with none) `channels` (the distinct channels with a live subscription, e.g. `["push", "email"]`) and `platforms` (the distinct push platforms registered, e.g. `["ios", "android"]`).
- **System attributes.** Keys starting with `$` are set by buzzkit, never by you: `$country`, `$city`, `$region`, `$timezone` come from Cloudflare's view of the device request, `$language` from its `Accept-Language`, and they refresh on every `POST /v1/client/identify` and `POST /v1/client/subscriptions` (newest wins). They ride along in `attributes` on every read, survive a wholesale `attributes` replace from the server side, and a `$` key in a `PUT` body is a 400 `system_attribute`. `externalId` in paths must be URL-encoded (emails, slashes, spaces all work).
- `GET /v1/subscribers/:externalId` — with embedded subscriptions; includes `verified` / `identityVerifiedAt` (see [client.md](client.md)).
- `DELETE /v1/subscribers/:externalId` — soft-deletes the subscriber and all their subscriptions.
- `GET|PATCH /v1/subscribers/:externalId/preferences` — see [topics.md](topics.md).
- `GET /v1/subscribers/:externalId/subscriptions` — list object of the subscriber's subscriptions.

Subscriber ids (`sub_…`) are 32-char sqids (the most exposed id class).

## Subscriptions — scopes `subscriptions:read` / `subscriptions:write`

- `POST /v1/subscriptions` — channel-shaped registration, creating the subscriber implicitly if new:

```json
{ "externalId": "user_42", "channel": "push", "platform": "ios", "token": "…" }
{ "externalId": "user_42", "channel": "email", "address": "jane@acme.com" }
```

Idempotent by (tenant, channel, endpoint): re-registering refreshes `lastSeenAt`, reactivates an invalidated endpoint, and **moves it** if the externalId changed (device changed hands) → 201 on create, 200 on refresh. A refresh never resets `enabled` — a muted subscription stays muted.

- `PATCH /v1/subscriptions/:id` — `{ enabled: bool }`. **Per-subscription control**: mute one device (the work iPhone) while every other subscription keeps receiving. Composes with topic×channel preferences: a send goes out only via subscriptions that are `enabled`, `active`, AND whose topic×channel preference is opted in.
- `DELETE /v1/subscriptions/:id` — soft delete; the endpoint can re-register fresh.

`status: active | invalid` — Phase 4's delivery feedback (APNs 410 / FCM UNREGISTERED) flips push subscriptions to `invalid` automatically.

Push subscriptions carry `environment` (`production` default, `sandbox` for debug builds — the app knows its own build via `aps-environment`); it selects the APNs credential slot at delivery time. Re-registering with a different environment is a change and is written.
