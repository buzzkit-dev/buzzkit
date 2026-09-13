# Segments and the expression grammar

A segment is a named expression, not a list. BuzzKit stores the condition and evaluates it the moment it is used, so membership is always current; every edit creates a new version and a send pins the version it used. The same grammar is `where` on a send, `where` on a workflow trigger or cancel rule, `when` in a workflow branch and `until` in a repeat. Scopes `segments:read` / `segments:write`. Docs: `https://docs.buzzkit.dev/audience/segments`. Types and a linter: `buzzkit/expressions` (`Expression`, `lintExpression`).

## The grammar

```json
{
  "all": [
    { "ref": "attributes.plan", "eq": "pro" },
    { "count": "workout.completed", "within": "7d", "gte": 3 },
    { "never": "app.reviewed", "within": "30d" },
    { "lastSeen": { "within": "30d" } },
    { "channel": "push" }
  ]
}
```

Groups: `{ "all": [...] }`, `{ "any": [...] }`, `{ "not": … }`, each with at least one child; at most 8 levels deep and 50 conditions in total.

| Condition | Shape | Matches subscribers who |
| --- | --- | --- |
| Attribute | `{ "ref": "attributes.plan", "eq": "pro" }` | Have the attribute and it compares as asked. `ref` takes dotted paths (`attributes.address.city`) or `externalId`. |
| Did event | `{ "count": "workout.completed", "within": "7d", "gte": 3 }` | Tracked the event that many times, optionally inside a window. |
| Never did event | `{ "never": "app.reviewed", "within": "30d" }` | Have no such event, ever or inside the window. |
| Activity | `{ "lastSeen": { "within": "30d" } }` or `{ "lastSeen": { "olderThan": "30d" } }` | Were last seen on a device inside the window, or not. Device events count (`ios`, `android`, `web`); server events do not; never-seen subscribers match neither. |
| Channel | `{ "channel": "push" }` | Hold at least one registered, unmuted subscription on that channel. |

- Attribute comparators: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in` (up to 100 values), `contains` (case-insensitive substring), `exists`. The value's type picks the reading: numbers numerically, booleans as booleans, everything else as text, so store numbers as numbers. `eq`, `gt` and the other ordered comparators require the key to be present; `neq` is the exact complement of `eq` (missing counts as not equal); `eq: null` and `exists: false` both mean missing.
- Event counts: `eq`, `gt`, `gte`, `lt`, `lte` on a non-negative integer; `eq: 0`, `lt: n`, `lte: n` include subscribers who never tracked the event.
- Durations: `15m`, `12h`, `30d`.
- System events count like any other: `{ "count": "$app.opened", "within": "1d", "gte": 1 }`.
- Inside a workflow the same grammar also reads `trigger.data.*`, `event.data.*`, `steps.<name>.*` and `vars.*` (`references/workflows.md`).

## Saved segments

```ts
const segment = await buzzkit.segments.create({
  slug: 'active-pro',
  name: 'Active pro users',
  expression: { all: [{ ref: 'attributes.plan', eq: 'pro' }, { count: 'workout.completed', within: '7d', gte: 3 }] },
});
await buzzkit.segments.update('active-pro', { description: 'Pro plan, three workouts this week' });
const { count, sample } = await buzzkit.segments.preview(expression);
for await (const member of buzzkit.segments.members('active-pro')) { … }
```

- `POST /v1/segments { slug, name, description?, expression }` answers `201` at version 1. `new` and `preview` are reserved slugs (`400 slug_reserved`), a taken slug is `409 slug_taken`.
- `PATCH /v1/segments/:slug` takes `name`, `description` (`null` clears), `expression`; a changed expression creates the next version, an identical one creates nothing.
- `GET /v1/segments/:slug` returns `{ id, slug, name, description, version: { id, number, expression, createdAt }, createdAt, updatedAt }`; `GET /v1/segments` lists.
- `POST /v1/segments/preview { expression }` (only `segments:read`) answers `{ count, sample }`, the number matching now and the first 20 as subscriber list items. The dry run to make before a large send.
- `GET /v1/segments/:slug/members` pages the membership (`limit` up to 100, `cursor`), first page with `total`.
- `DELETE /v1/segments/:slug` soft-deletes and frees the slug; messages keep the version they used.

Segments compile to one query over the derived event stream, fresh to within seconds; a deleted subscriber never matches.

## Using a segment

```ts
await buzzkit.messages.send({ segment: 'active-pro', topic: 'gym-reminders', title: 'Leg day', body: '6:00 with Maya.' });
await buzzkit.messages.send({
  where: { all: [{ ref: 'attributes.plan', eq: 'pro' }, { lastSeen: { olderThan: '30d' } }] },
  topic: 'win-back',
  title: 'Still with us?',
});
```

Fan-out pages members 500 at a time and pins the version, so an edit mid-send never changes the audience; the message's `targets` carry `{ segment, segmentVersion }`. `segment` cannot combine with `to` (`400 targets_conflict`); it can combine with `topic` as a preference filter. A one-off audience goes inline as `where`, stored verbatim on the message. A schedule-triggered workflow takes `segment` on its trigger to start one run per member each fire.

## Errors

`invalid_expression` (with `param` such as `expression.all[1]` or `where.all[1]`), `slug_reserved`, `slug_taken`, `not_found` for an unknown or deleted segment on a send.
