# Events

The event stream: facts about a subscriber, tracked from your server or from the app, kept forever-ish in Tinybird, and — from the next engine phases on — what workflows react to and segments filter on. Tenant-context routes; scopes `events:write` (track) and `events:read` (read). The design is in [engine.md](../engine.md); the audit log of control-plane changes is a different thing ([audit.md](audit.md)).

## The event

```json
{
  "id": "evt_01j6…",                       // buzzkit's id (uuidv7); the sender's `id` is only a dedupe key
  "sequence": 4127,                              // this subscriber's sequence, the order of arrival
  "externalId": "user_42",
  "name": "workout.completed",              // yours; `$…` is reserved for buzzkit
  "source": "ios",                          // server | ios | android | web | system | webhook (a source, sources.md)
  "timestamp": "…", "receivedAt": "…",     // when it happened (the sender's clock), when buzzkit took it
  "data": { "workoutId": "w_1", "duration": 42 },
  "runId": null, "messageId": null, "step": null   // set on engine events
}
```

- Names: `[a-z0-9][a-z0-9_.-]{0,99}`, dot-separated by convention (`workout.completed`). Names starting with `$` are buzzkit's: the SDK may send `$app.installed`, `$app.updated`, `$app.opened` (a session started), `$app.backgrounded`, `$session.ended`, `$notification.delivered`, `$notification.opened`, `$notification.dismissed`, `$activity.started`, `$activity.ended`, `$activity.dismissed`, `$activity.stale`, `$deeplink.opened`, `$action.triggered`, `$permission.changed`, `$identify`; the engine writes `$subscriber.created / updated / deleted`, `$subscription.registered / muted / unmuted / removed / invalidated`, `$preferences.updated`, and later `$run.*` and `$send`. A `$` name from `POST /v1/events` is a 400 `reserved_event`; from the app, only the SDK names are accepted.
- `data` is a free-form object, at most 8KB serialized (`event_data_too_large`). It is stored as a native JSON column, so a field is addressable in queries as `data.total` (typed dynamically per row: cast before comparing, `toFloat64OrNull(toString(data.total)) > 50`); that is what segment predicates on event data (E3) will compile to. Reads never return the JSON column: Tinybird's Events API stores every value inside an array as a string (`[1, 2]` becomes `["1", "2"]`, nested objects become JSON text), so the consumer also writes the serialized payload verbatim to `data_raw`, and `event_recent` / `subscriber_timeline` return that. `data` is for filtering, `data_raw` for reading. `data` must be an object (an array or a scalar is a validation error). `timestamp` is optional (defaults to now), may be up to 7 days in the past (offline queues) and at most one hour ahead, for clock skew (`invalid_timestamp`).
- `id` is an optional dedupe key, unique per subscriber: sending the same `id` again returns the original event with `status: "duplicate"` and stores nothing. Buzzkit always assigns its own `evt_…` id.
- An unknown `externalId` creates the subscriber, like a registration does; the stream then also carries a `$subscriber.created`.

## How it works

`POST /v1/events` → one RPC per subscriber to that subscriber's **actor** (a Durable Object) → SQLite write → 202. The actor's write is the durability point (the response never precedes it); a Durable Object is single-threaded per subscriber, so events for one person are processed in arrival order and `sequence` is that order. The actor then streams everything above its watermark to the `buzzkit-events` queue, whose consumer posts gzipped NDJSON batches to Tinybird's Events API with `wait=true`, so a batch is acknowledged only once Tinybird has committed it (at-least-once; Tinybird dedupes on `id`, readers use `FINAL`). The consumer posts in chunks of at most 4 MB. A batch Tinybird cannot commit (a non-200, a timeout) is retried (30s apart) and after ten attempts lands on `buzzkit-events-dlq`, whose consumer logs it and re-sends it to the main queue ten minutes later (and, should even that send fail, retries and finally dead-letters back into the main queue). That cycle runs for **seven days** from the first failure; a batch still failing after that is logged at error level with its subscriber and sequence range and dropped, because a batch that has failed for a week is broken, not delayed. Nothing is parked silently and nothing loops forever. A row Tinybird **quarantines** (a payload ClickHouse's JSON column refuses) does not fail the batch: Tinybird commits the rest, the consumer re-posts each subscriber's rows on their own to find the culprit, logs that subscriber and sequence range at error level, and acknowledges; the row stays in the actor and in Tinybird's quarantine table for an operator. The actor never prunes a row above its watermark, so during an outage it grows instead of forgetting. The hourly rollup (`event_names_hourly`, behind the catalog counts and the volume charts) is at-least-once: a batch that Tinybird committed but whose acknowledgement was lost is counted twice there, while `events` itself dedupes on `id` and its readers use `FINAL`. Exact figures come from `events`; the rollup is for shape and scale.

**Caller contract.** Give every event an `id` (the SDKs do) and retry the whole request on a 429, a 5xx or a network failure, with backoff, until you get a 202: replays are deduped by the actor and answered as `duplicate`. A request that spans several subscribers ingests them concurrently; if one subscriber's actor fails the request fails as a whole even though the others were written, so the `id` is what keeps a retry from double counting them. Never retry a 4xx other than 429; the request is malformed and will fail again. An offline client keeps its events queued with their original `timestamp` and drains them in batches of up to 100 when it is back; anything older than seven days is refused. Reads are seconds behind writes: the catalog, the list and the timeline come from Tinybird. Locally, `bun db:up` runs Tinybird Local next to Postgres and the API picks up its token by itself ([configuration.md](../configuration.md)).

## POST /v1/events → 202

`events:write`. `{ "events": [ … ] }` with up to 100 items, each `{ externalId, name, data?, timestamp?, id? }`; a bare event object is accepted as shorthand for a list of one. Always returns the list, in input order, each with `status: "accepted" | "duplicate"`. Validation errors name the item (`events.0.name`, `events` for an empty or oversized list).

## POST /v1/client/events → 202

Client keys only ([client.md](client.md)): `{ externalId, identityHash?, source: "ios" | "android" | "web", events: [{ name, data?, timestamp?, id? }] }`, up to 100 per call. Identity verification applies as on every client call; a valid hash stamps the subscriber verified. System attributes (`$country`, `$timezone`, …) are refreshed from the request like on identify.

## GET /v1/events

`events:read`. The newest events of the tenant, keyset-paginated by `(receivedAt, id)` so events that arrived in the same millisecond (one batch shares one `receivedAt`) never straddle a page (`cursor` = the previous page's `nextCursor`, `<receivedAt>_<id>`; `limit` up to 100). Filters: `name`, `source` (`webhook` included), `provider` (the source provider behind `webhook` events), `after` (ISO date-time: only events received after it, the live tail) with `afterId` to pin the position inside that millisecond. This list carries no `total`: it is a keyset over the stream, not a counted table.

## GET /v1/events/names

`events:read`. The catalog: every name the tenant has seen, ordered by 7-day volume: `{ name, counts: { last24h, last7d, last30d, total }, subscribers7d, sources[], providers[] (the source providers behind `webhook`), lastAt, firstAt }`. Counts are exact to the hour (the rollup is hourly).

## GET /v1/events/names/:name

`events:read`. One name: the catalog entry plus `volume` (`?range=24h|7d|30d`, default `7d`: `{ range, bucketSeconds, from, to, buckets: [{ at, count, subscribers }] }` bucketed by `timestamp`, empty buckets omitted) and `samples` (the 20 newest events). Unknown name → 404.

## GET /v1/events/volume

`events:read`. The tenant-wide volume series, same shape and `range` as above, optionally `?name=`.

## GET /v1/subscribers/:externalId/timeline

`subscribers:read`. One subscriber's events, newest first, keyset-paginated by `sequence` (`cursor` = the previous page's `nextCursor`). Pages come from the actor for as long as it still holds the rows below the cursor (the newest 10k) and from Tinybird below that, so a page is never short because Tinybird is seconds behind. This replaces the old per-subscriber audit listing: identifies, registrations, mutes, preference changes and every tracked event are here, in order.

**What the engine writes, and when.** `$subscriber.created` once, on whichever call first sees the `externalId`; `$subscriber.updated` when a `PUT` changes attributes; `$subscription.registered` on every real registration write: a new endpoint, a platform or environment change, a reactivation of an invalidated endpoint, or a move to another subscriber (which also writes `$subscription.removed` on the previous owner's timeline); a mere refresh of `lastSeenAt` writes nothing. `$subscription.muted` / `unmuted` only when `enabled` actually changes (every `$subscription.*` event carries `{ externalId, channel, platform, endpoint, enabled }`, the state after the write, so a registration also resets any earlier mute in the stream's view of the subscription); `$preferences.updated` only when a preference actually changes, with `changes` = the request body; `DELETE /v1/subscribers/:id` writes one `$subscription.removed` per live subscription and then `$subscriber.deleted`. `$identify` from `POST /v1/client/identify` carries `source: system` (the API recorded it); an SDK that tracks `$identify` through `POST /v1/client/events` carries its platform.

## GET /v1/events/token

`events:read`. A short-lived Tinybird JWT (`{ token, expiresAt, url }`, one hour, cached) that can read the catalog, volume, recent and timeline endpoints **for this tenant only**: the tenant is a fixed parameter of the token and cannot be overridden. The dashboard uses it to query Tinybird directly for charts and the live tail; the same token lets you embed those views. It cannot ingest.
