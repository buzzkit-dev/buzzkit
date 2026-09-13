# Events

An event is a fact about a subscriber: they finished a workout, started a trial, opened the app. Tracked from the backend or the app, kept on the subscriber's stream, and that stream is what segments filter on, what workflows trigger on and wait for, and what a subscriber's timeline shows. Tracking needs `events:write`, reading `events:read`, both inside a tenant. Docs: `https://docs.buzzkit.dev/automation/events`.

## Tracking from the backend

```ts
await buzzkit.track({ externalId: 'user_42', name: 'workout.completed', data: { workoutId: 'w_1', duration: 42 }, id: 'w_1-done' });
await buzzkit.track([
  { externalId: 'user_42', name: 'streak.extended', data: { days: 7 }, id: 'streak-user_42-7' },
  { externalId: 'user_43', name: 'trial.started', data: { plan: 'monthly' }, id: 'trial-user_43' },
]);
await buzzkit.subscriber('user_42').track('cart.abandoned', { value: 79 });
```

`POST /v1/events` takes up to 100 events per call (a bare object is a list of one) and answers `202` with the list in input order, each with `status: "accepted"` or `"duplicate"`. An unknown `externalId` creates the subscriber (and a `$subscriber.created`).

## The event

| Field | Rules |
| --- | --- |
| `name` | Yours, `[a-z0-9][a-z0-9_.-]{0,99}`, dot-separated `object.action` by convention, never `$`-prefixed (`400 reserved_event`). Stable forever: segments and workflows reference it by name. |
| `externalId` | The subscriber's own id. |
| `data` | A JSON object of the facts to branch on, at most 8 KB (`event_data_too_large`). Arrays or scalars at the root are a validation error. |
| `timestamp` | When it happened, on the sender's clock; optional, default now; up to seven days back and one hour ahead (`400 invalid_timestamp`). |
| `id` | Your dedupe key, unique per subscriber. A replay returns the original with `status: "duplicate"` and stores nothing. BuzzKit assigns its own `evt_` id. |
| `sequence` | The subscriber's arrival order, assigned by BuzzKit. |
| `source` | `server`, `ios`, `android`, `web`, `system`, `webhook`. |
| `runId`, `messageId`, `step` | Set on engine events, linking a step to its run. |

Give every server-sent event an `id` and retry the whole request on `429`, `5xx` or a network failure until you get `202`; replays are deduped. Never retry another `4xx`.

## Tracking from the app

The iOS SDK (`BuzzKit.track`) and `buzzkit/client` (`client.track`) post to `POST /v1/client/events` as `{ externalId, identityHash?, source, events }` with the client key. The iOS queue is on disk and drains in batches with original timestamps when the device is back online. See `references/ios-sdk.md` and `references/browser-react.md`.

## Reserved events

Names starting with `$` belong to BuzzKit. The SDK emits `$app.installed`, `$app.updated`, `$app.opened`, `$app.backgrounded`, `$session.ended`, `$notification.delivered`, `$notification.opened`, `$notification.dismissed`, `$activity.started`, `$activity.ended`, `$activity.dismissed`, `$activity.stale`, `$local.scheduled`, `$deeplink.opened`, `$action.triggered`, `$permission.changed`, `$identify`. The engine writes `$subscriber.created`, `$subscriber.updated`, `$subscriber.deleted`, `$subscriber.merged`, `$subscription.registered`, `$subscription.muted`, `$subscription.unmuted`, `$subscription.removed`, `$subscription.invalidated`, `$preferences.updated`, `$run.started`, `$run.step`, `$run.completed`, `$run.canceled`, `$run.failed`, `$send`.

Reserved events are as usable as your own: `$app.opened` can trigger a workflow, `$notification.opened` can decide a branch, `$permission.changed` can build a segment of people who said no.

## Reading

Reads come from the event stream, not Postgres: seconds behind writes, keyset pagination, no `total`.

| Endpoint | SDK | Returns |
| --- | --- | --- |
| `GET /v1/events?name=&source=&provider=&after=&limit=` | `buzzkit.events.list(params)` | The tenant's newest events. |
| `GET /v1/events/names` | `buzzkit.events.names()` | The catalog: every name seen, with `counts { last24h, last7d, last30d, total }`, `subscribers7d`, `sources`, `providers`, `firstAt`, `lastAt`. |
| `GET /v1/events/names/:name?range=24h|7d|30d` | `buzzkit.events.name(name, { range })` | One entry plus a volume series and the 20 newest samples. |
| `GET /v1/events/volume?range=&name=` | `buzzkit.events.volume(params)` | Buckets with `count` and `subscribers`, empty buckets omitted. |
| `GET /v1/subscribers/:externalId/timeline?name=&source=&provider=` | `buzzkit.subscriber(id).timeline(params)` | One person's whole stream, newest first: tracked events plus every lifecycle event BuzzKit wrote for them. |
| `GET /v1/events/token` | | A one-hour JWT with a `url` that reads the catalog, volume, recent and timeline endpoints for one tenant, safe in a browser (cannot ingest, tenant fixed). |

## What to track

See `references/best-practices.md` §3. In short: lifecycle (`signup.completed`, `trial.started`, `subscription.canceled`), core value moments named for the product, funnel steps, and anything a notification should react to or be canceled by. Flat `data` with ids of related things, not whole records.
