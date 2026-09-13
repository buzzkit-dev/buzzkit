# Topics and preferences

A topic is a named category of notification (`gym-reminders`, `order-updates`, `marketing`). Subscribers hold a preference per topic **and per channel**, so the app gets a notification settings screen with no table of its own and no endpoint in front of it. Reading and writing need `topics:read` / `topics:write` on the backend; the app uses the client key. Docs: `https://docs.buzzkit.dev/audience/topics`.

Any notification preference in the product is a topic. Never a column on the user, never a custom endpoint, never a boolean attribute.

## Create a topic

```ts
await buzzkit.topics.create({
  slug: 'gym-reminders',
  name: 'Gym reminders',
  description: 'Nudges before a scheduled workout.',
  category: 'Training',
  channels: ['push'],
  defaultOptedIn: true,
  dailyCap: 3,
});
```

| Field | What it does |
| --- | --- |
| `slug` | Stable address used in sends; `new` and `preview` are reserved (`400 slug_reserved`), a taken slug is `409 slug_taken`. |
| `name`, `description` | The row's title and footnote on the settings screen. |
| `category` | A section heading on the screen, found or created by name; manage names through `/v1/topic-categories` (`list`, `update(id, { name })`, `remove`). |
| `channels` | The channels it is offered on, each needing a live credential (`400 channel_not_connected`). Omit for every connected channel. |
| `defaultOptedIn` | The baseline for subscribers who never chose (default `true`). |
| `channelDefaults` | Per-channel overrides of the baseline, e.g. `{ "push": false }`; only offered channels (`400 channel_not_offered`). |
| `dailyCap` | 1 to 50 messages per subscriber per local day from this topic, or `null`. Sends past it record `capped`. |

`GET /v1/topics` pages the catalog; `GET`/`PATCH`/`DELETE /v1/topics/:slug` manage one. Narrowing `channels` keeps the subscribers' stored preferences for the dropped channel, so re-offering it restores them. Deleting a topic removes it from every preference list.

## How preferences resolve

A preference list is always the full catalog with a resolved state per offered channel:

```json
{ "id": "tpc_…", "slug": "gym-reminders", "name": "Gym reminders", "description": "…", "category": "Training",
  "channels": { "push": { "optedIn": true, "isDefault": true } } }
```

Resolution order: the subscriber's explicit choice, then `channelDefaults[channel]`, then `defaultOptedIn`. `isDefault: true` means the person never chose, so the topic's default applies and keeps following it if the dashboard changes it.

## Reading and writing

Backend (`subscribers:read` / `subscribers:write`):

```ts
const list = await buzzkit.subscriber('user_42').preferences();
await buzzkit.subscriber('user_42').updatePreferences({ marketing: false, 'gym-reminders': { push: true } });
```

`PATCH /v1/subscribers/:externalId/preferences { "preferences": { … } }` merges: a boolean applies to every offered channel, a map to named channels. Unknown topic `404`, unknown or unoffered channel `400`.

App, with the client key: `GET /v1/client/preferences` and `PATCH /v1/client/preferences` with `BuzzKit-Subscriber: <externalId>` and `BuzzKit-Identity: <hash>` (required once verification is enforced). Wrapped by `BuzzKitPreferencesView` / `BuzzKit.preferences` on iOS and `usePreferences` / `client.preferences()` on the web. Identify before showing the screen so it works even when push permission was denied.

## Sending to a topic

```ts
await buzzkit.messages.send({ topic: 'gym-reminders', title: 'Leg day', body: '6:00 with Maya.' });
await buzzkit.messages.send({ to: 'user_42', topic: 'order-updates', title: 'Shipped' });
```

Alone, `topic` is the audience: every opted-in subscriber through their enabled, active subscriptions on the message's channel. With `to`, `segment` or `where` it is a filter. A send reaches a subscription only when the subscription is enabled and active **and** the topic and channel preference is opted in: muting a device and opting out of a topic are separate controls that compose. A message with no topic ignores preferences, which is right only for transactional and security notices.

## Caps and quiet hours

A topic's `dailyCap` sits on top of the tenant's `sendPolicy.dailyCap` (all topics, per subscriber per local day). The tenant policy also carries `quietHours`, which defers a delivery to the next allowed local time instead of failing it, with `timezone: "subscriber"` or an IANA name. Both are off by default and set per tenant (`references/tenants.md`); `policy: "ignore"` on a message bypasses them.

## Designing the catalog

- One topic per kind of notification a person could reasonably want off separately: orders, reminders, social, digests, marketing. Not one per message.
- Categories that read as sections: "Orders", "Training", "Social", "Updates".
- Transactional topics default on; marketing defaults to what the law requires where the users live; chatty topics get a `dailyCap`.
- Every non-critical send names a topic. Adding a topic later means every existing subscriber follows its default, so choose defaults you can live with.
- Show per-channel controls when more than one channel is connected; the drop-in iOS view already does.
