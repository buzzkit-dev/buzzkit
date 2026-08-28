# Segments API

Segments are saved, versioned expressions over the event stream ([engine.md](../engine.md), phase E3): who a subscriber is (`attributes`), what they did (event counts and absence), when they were last active on a device, and which channels can reach them. A segment is evaluated at the moment it is used, never stored as a member list. Tenant-context routes; `segments:read` is member-level, `segments:write` admin; both are key-grantable.

| Method | Path | Scope | Notes |
|---|---|---|---|
| GET | `/v1/segments` | `segments:read` | Every segment of the tenant with its current version |
| POST | `/v1/segments` | `segments:write` | `{ slug, name, description?, expression }` → 201; version 1. `new` and `preview` are reserved slugs (400 `slug_reserved`) |
| POST | `/v1/segments/preview` | `segments:read` | `{ expression }` → `{ count, sample }`: how many subscribers match right now and the first 20 of them (subscriber list items, by id), for builders and dry runs; nothing is saved |
| GET | `/v1/segments/:slug` | `segments:read` | The segment with its current version |
| PATCH | `/v1/segments/:slug` | `segments:write` | `{ name?, description? (null clears), expression? }`; a changed expression creates the next version, an identical one does not |
| DELETE | `/v1/segments/:slug` | `segments:write` | Soft delete; the slug is free again; messages already sent keep the version they used |
| GET | `/v1/segments/:slug/members` | `segments:read` | The members, paged by subscriber id (`?limit=` up to 100, `?cursor=` from `nextCursor`); the first page carries `total` |

Segment: `{ id: "seg_…", slug, name, description, version: { id: "sgv_…", number, expression, createdAt }, createdAt, updatedAt }`.

## Expressions

An expression is a condition or a group of them, nested at most 8 levels deep with at most 50 conditions in total. Groups: `{ all: [...] }`, `{ any: [...] }`, `{ not: … }`; every group needs at least one child. The same grammar drives workflow conditions later, so it lives in the framework package (`buzzkit/expressions`: the TypeBox schema, `isExpression`, `lintExpression` (every problem with its path and a message that names the key, the allowed values and an example), `expressionProblem`, `listReferencedEvents`).

| Condition | Shape | Matches subscribers who |
|---|---|---|
| Attribute | `{ ref: "attributes.plan", eq: "pro" }` | Have the attribute and it compares as asked. Comparators: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in` (up to 100 values), `contains` (case-insensitive substring), `exists`. Nested keys use dots (`attributes.address.city`); `ref: "externalId"` compares the external id. The value's type picks the reading: numbers compare numerically, booleans as booleans, everything else as text. `eq`/`gt`/… require the key to be present; `neq` is the exact complement of `eq`, so a missing key counts as not equal; `eq: null` and `exists: false` both mean missing |
| Did event | `{ count: "workout.completed", within: "7d", gte: 3 }` | Tracked the event that many times, optionally within a window. Comparators `eq`, `gt`, `gte`, `lt`, `lte` on a non-negative integer; `eq: 0`, `lt: n` and `lte: n` include subscribers who never tracked it |
| Never did event | `{ never: "app.reviewed", within: "30d" }` | Have no such event, ever or within the window |
| Activity | `{ lastSeen: { within: "30d" } }`, `{ lastSeen: { olderThan: "90d" } }` | Were last seen on a device (iOS, Android or web events; server events do not count) inside or before the window. Subscribers never seen on a device match neither |
| Channel | `{ channel: "push" }` | Hold at least one registered, unmuted subscription on the channel (`push`, `email`, `sms`); a fresh registration counts as unmuted even if an earlier subscription of the same endpoint was muted |

Durations are `<n>m`, `<n>h` or `<n>d` (`15m`, `12h`, `30d`). Event names follow the tracking rules (`^\$?[a-z0-9][a-z0-9_.-]{0,99}$`); system events such as `$app.opened` count like any other.

The compiler turns an expression into one ClickHouse query over `subscriber_attributes` (the latest attribute snapshot per subscriber; a deleted subscriber's row is marked `deleted` by `$subscriber.deleted` and never matches), `events`, `subscriber_activity` and `subscription_state`, all derived from the stream by materialized views, so a segment is as fresh as the last flushed event, usually within seconds. A preview or a fan-out never touches Postgres for membership; Postgres only resolves the members' subscriptions when a message is sent.

## Sending to a segment

`POST /v1/messages { segment: "active-pro", … }` fans out to every member's enabled subscriptions on the channel; `POST /v1/messages { where: { all: [...] }, … }` does the same for an inline expression that is never saved as a segment (code-defined, one-off audiences: the expression is stored on the message as `targets.where`), through the identical fan-out; page by page (500 members per page, keyed by subscriber id), pinning the segment version at send time so a later edit never changes who an in-flight message reaches. The message's `targets` carry `{ segment, segmentVersion: "sgv_…" }`; a scheduled message to a segment carries its `schedule` beside them.md). `segment` cannot be combined with `to`; it can be combined with `topic`, which then filters members by their topic preference like a topic send does.

Errors: `invalid_expression` (400, `param` points at the failing node, `expression.all[1]`), `slug_reserved` (400), `slug_taken` (409), `targets_conflict` (400, `to` together with `segment`), `not_found` (404, unknown or deleted segment on send).

Management actions are audit entries (`segment.created / updated / deleted`) and public webhook events.
