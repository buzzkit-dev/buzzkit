# Topics & Preferences

Topics are named notification categories — `gym-reminders`, `running-reminders`, `marketing` — the native answer to "let users choose which notifications they get" without a custom table or a backend proxy. Preferences are **per topic × per channel** (`push`, `email`, more later): a user can keep running-reminder pushes but kill running-reminder emails. Each topic has a `defaultOptedIn` baseline plus optional per-channel overrides (`channelDefaults: { "push": false }`); subscribers store only their deviations. Sending targets a topic + channel and buzzkit filters to opted-in subscribers automatically.

## Topics — scopes `topics:read` / `topics:write` (tenant context)

- `POST /v1/topics` — `{ slug, name, description?, category?, dailyCap?, channels? (every channel), defaultOptedIn? (true), channelDefaults? }` → 201 `tpc_…`. `channels` is the list of channels the topic is offered on (at least one, each of them connected to the tenant, otherwise 400 `channel_not_connected`; omitted, the topic gets every connected channel): an email-only digest is `channels: ['email']`. `channelDefaults` may only name offered channels (400 `channel_not_offered`). `category` groups the topic under a heading in notification settings (find-or-create by name; manage names via `/v1/topic-categories`). `dailyCap` (1 to 50, `null` clears) caps how many messages from this topic one subscriber receives per local day — the send past it fails as `capped` in the delivery ledger, independent of the tenant-wide `sendPolicy.dailyCap`.
- `GET /v1/topics` — paginated (newest first, `limit` / `cursor`, `total`) · `GET /v1/topics/:topicSlug`
- `PATCH /v1/topics/:topicSlug` — any field; slug renames are checked for conflicts. Narrowing `channels` drops the `channelDefaults` entries for channels no longer offered; the stored preferences for those channels are kept and come back if the channel is offered again.
- `DELETE /v1/topics/:topicSlug` — soft delete; it disappears from every preference list.

## Preferences

A subscriber's preference list is always the full topic catalog with resolved states for each channel the topic is offered on (a channel the topic does not offer is absent from `channels`, and setting it is a 400 `channel_not_offered`; the boolean shorthand applies to the offered channels only):

```json
[
  {
    "id": "tpc_…", "slug": "running-reminders", "name": "Running reminders", "description": null,
    "channels": {
      "push":  { "optedIn": true,  "isDefault": true },
      "email": { "optedIn": false, "isDefault": false }
    }
  }
]
```

`isDefault: true` means the subscriber never chose for that channel — the topic's channel default applies (and follows the topic if its defaults change). Resolution: explicit choice → `channelDefaults[channel]` → `defaultOptedIn`.

- Server-side: `GET|PATCH /v1/subscribers/:externalId/preferences` — PATCH body values are a boolean (all channels) or a per-channel map, merge semantics:

```json
{ "preferences": { "marketing": false, "running-reminders": { "email": false } } }
```

Unknown topic → 404; unknown channel → 400.
- Client-side (from the app): `GET|PATCH /v1/client/preferences` — see [client.md](client.md). This is the endpoint a notification-settings screen is built on.
