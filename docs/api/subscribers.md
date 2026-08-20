# Subscribers & Devices

Subscribers are YOUR users, addressed everywhere by YOUR id (`externalId`) — buzzkit is the subscriber table, so apps need no user/device bookkeeping of their own. Devices are push tokens with lifecycle. Tenant-context routes (`buzzkit-tenant` selects the tenant; default tenant when absent).

## Subscribers — scopes `subscribers:read` / `subscribers:write`

- `PUT /v1/subscribers/:externalId` — identify/upsert: `{ attributes?, email? }` → 201 on create, 200 after. `attributes` is free-form JSONB, replaced wholesale when present, untouched when omitted; segments will filter on it (Phase 7). `email` is the subscriber's **email-channel endpoint** (channels have different endpoint shapes: push delivers to devices, email delivers to this address); nullable to clear.
- `GET /v1/subscribers` — keyset-paginated list.
- `GET /v1/subscribers/:externalId` — with embedded devices.
- `DELETE /v1/subscribers/:externalId` — soft-deletes the subscriber and all their devices.
- `GET|PATCH /v1/subscribers/:externalId/preferences` — see [topics.md](topics.md).

Subscriber ids (`sub_…`) are 32-char sqids (extra-long: the highest-volume, most exposed id class).

## Devices — scopes `devices:read` / `devices:write`

- `POST /v1/devices` — `{ externalId, platform: ios|android, token }`. Creates the subscriber implicitly if new. Idempotent by (tenant, token): re-registering refreshes `lastSeenAt`, reactivates, and **moves the token** if the externalId changed (device changed hands) → 201 on create, 200 on refresh.
- `GET /v1/subscribers/:externalId/devices`
- `DELETE /v1/devices/:id` — soft delete; the token can re-register fresh.

Status `active | invalid` — Phase 4's delivery feedback (APNs 410 / FCM UNREGISTERED) flips devices to `invalid` automatically.
