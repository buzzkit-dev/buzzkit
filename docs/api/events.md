# Events

The event stream: facts about a subscriber, tracked from your server or from the app, kept forever-ish in Tinybird, and — from the next engine phases on — what workflows react to and segments filter on. Tenant-context routes; scopes `events:write` (track) and `events:read` (read). The design is in [engine.md](../engine.md); the audit log of control-plane changes is a different thing ([audit.md](audit.md)).

## The event

```json
{
  "id": "evt_01j6…",                       // buzzkit's id (uuidv7); the sender's `id` is only a dedupe key
  "sequence": 4127,                              // this subscriber's sequence, the order of arrival
  "externalId": "user_42",
  "name": "workout.completed",              // yours; `$…` is reserved for buzzkit
  "source": "ios",                          // server | ios | android | web | system
  "timestamp": "…", "receivedAt": "…",     // when it happened (the sender's clock), when buzzkit took it
  "data": { "workoutId": "w_1", "duration": 42 },
  "runId": null, "messageId": null, "step": null   // set on engine events
}
```

- Names: `[a-z0-9][a-z0-9_.-]{0,99}`, dot-separated by convention (`workout.completed`). Names starting with `$` are buzzkit's: the SDK may send `$app.opened`, `$app.backgrounded`, `$session.ended`, `$notification.delivered`, `$notification.opened`, `$permission.changed`, `$identify`; the engine writes `$subscriber.created / updated / deleted`, `$subscription.registered / muted / unmuted / removed / invalidated`, `$preferences.updated`, and later `$run.*` and `$send`. A `$` name from `POST /v1/events` is a 400 `reserved_event`; from the app, only the SDK names are accepted.
- `data` is a free-form object, at most 8KB serialized (`event_data_too_large`). It is stored as a native JSON column, so a field is addressable in queries as `data.total` (typed dynamically per row: cast before comparing, `toFloat64OrNull(toString(data.total)) > 50`); that is what segment predicates on event data (E3) will compile to. Reads never return the JSON column: Tinybird's Events API stores every value inside an array as a string (`[1, 2]` becomes `["1", "2"]`, nested objects become JSON text), so the consumer also writes the serialized payload verbatim to `data_raw`, and `event_recent` / `subscriber_timeline` return that. `data` is for filtering, `data_raw` for reading. `timestamp` is optional (defaults to now), may be up to 7 days in the past (offline queues) and never in the future (`invalid_timestamp`).
- `id` is an optional dedupe key, unique per subscriber: sending the same `id` again returns the original event with `status: "duplicate"` and stores nothing. Buzzkit always assigns its own `evt_…` id.
- An unknown `externalId` creates the subscriber, like a registration does; the stream then also carries a `$subscriber.created`.

## How it works

`POST /v1/events` → one RPC per subscriber to that subscriber's **actor** (a Durable Object) → SQLite write → 202. The actor's write is the durability point (the response never precedes it); a Durable Object is single-threaded per subscriber, so events for one person are processed in arrival order and `sequence` is that order. The actor then streams everything above its watermark to the `buzzkit-events` queue, whose consumer posts gzipped NDJSON batches to Tinybird's Events API with `wait=true`, so a batch is acknowledged only once Tinybird has committed it (at-least-once; Tinybird dedupes on `id`, readers use `FINAL`). A batch Tinybird cannot commit, or quarantines, is retried and after ten attempts parked on the dead-letter queue; the rows stay in the actor either way. Reads are seconds behind writes: the catalog, the list and the timeline come from Tinybird. Locally, `bun db:up` runs Tinybird Local next to Postgres and the API picks up its token by itself ([configuration.md](../configuration.md)).

## POST /v1/events → 202

`events:write`. One event, or `{ "events": [ … ] }` with up to 100. Each item: `{ externalId, name, data?, timestamp?, id? }`. Returns the tracked event (or the list, in input order) with `status: "accepted" | "duplicate"`.

## POST /v1/client/events → 202

Client keys only ([client.md](client.md)): `{ externalId, identityHash?, source: "ios" | "android" | "web", events: [{ name, data?, timestamp?, id? }] }`, up to 100 per call. Identity verification applies as on every client call; a valid hash stamps the subscriber verified. System attributes (`$country`, `$timezone`, …) are refreshed from the request like on identify.

## GET /v1/events

`events:read`. The newest events of the tenant, keyset-paginated by `receivedAt` (`cursor` = the previous page's `nextCursor`; `limit` up to 100). Filters: `name`, `source`, `after` (ISO date-time: only events received after it — the live tail).

## GET /v1/events/names

`events:read`. The catalog: every name the tenant has seen, ordered by 7-day volume: `{ name, counts: { last24h, last7d, last30d, total }, subscribers7d, sources[], lastAt, firstAt }`. Counts are exact to the hour (the rollup is hourly).

## GET /v1/events/names/:name

`events:read`. One name: the catalog entry plus `volume` (`?range=24h|7d|30d`, default `7d`: `{ range, bucketSeconds, from, to, buckets: [{ at, count, subscribers }] }` bucketed by `timestamp`, empty buckets omitted) and `samples` (the 20 newest events). Unknown name → 404.

## GET /v1/events/volume

`events:read`. The tenant-wide volume series, same shape and `range` as above, optionally `?name=`.

## GET /v1/subscribers/:externalId/timeline

`subscribers:read`. One subscriber's events, newest first, keyset-paginated by `sequence` (`cursor` = the previous page's `nextCursor`). This replaces the old per-subscriber audit listing: identifies, registrations, mutes, preference changes and every tracked event are here, in order.

## GET /v1/events/token

`events:read`. A short-lived Tinybird JWT (`{ token, expiresAt, url }`, one hour, cached) that can read the catalog, volume, recent and timeline endpoints **for this tenant only**: the tenant is a fixed parameter of the token and cannot be overridden. The dashboard uses it to query Tinybird directly for charts and the live tail; the same token lets you embed those views. It cannot ingest.
