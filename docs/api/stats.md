# Stats

Aggregates for a tenant over a time window, the numbers behind the dashboard's Overview. One endpoint, one round trip; the dashboard consumes it like anyone else.

## GET /v1/stats

Scope `messages:read` (tenant context: tenant keys imply their tenant, workspace keys and sessions pick one with `buzzkit-tenant`). Query: `?from=` and `?to=` as ISO date-times; `to` defaults to now, `from` to seven days before `to`. `from` after `to`, or a window longer than 366 days, is a 400 with `param: "from"`. `?interval=hour|day|week|month` picks the bucket of the `series`; without it the window picks: up to two days `hour`, up to 120 days `day`, up to 200 days `week`, beyond that `month`. The response echoes the `interval` used.

```json
{
  "range": { "from": "2026-08-18T20:00:00.000Z", "to": "2026-08-25T20:00:00.000Z" },
  "interval": "day",
  "subscribers": { "total": 118, "added": 9 },
  "messages": { "total": 42 },
  "deliveries": { "total": 1180, "sent": 1032, "failed": 84, "capped": 7, "invalid": 12, "pending": 45 },
  "previous": {
    "subscribers": { "added": 6 },
    "messages": { "total": 37 },
    "deliveries": { "total": 990, "sent": 901, "failed": 55, "capped": 5, "invalid": 9, "pending": 20 }
  },
  "series": [
    { "date": "2026-08-18T00:00:00Z", "subscribers": 3, "messages": 2, "sent": 130, "failed": 11, "capped": 1, "invalid": 1, "pending": 0 },
    { "date": "2026-08-19T00:00:00Z", "subscribers": 0, "messages": 0, "sent": 0, "failed": 0, "capped": 0, "invalid": 0, "pending": 0 }
  ]
}
```

- `subscribers.total` counts every live subscriber of the tenant regardless of the window; `subscribers.added` counts those created inside it.
- `messages.total` counts messages created inside the window.
- `deliveries` counts deliveries created inside the window by outcome: `sent` is `sent` + `delivered`, `failed` is `failed` + `bounced`, `invalid` is `invalid`, `pending` is `pending` + `retrying`; `total` is their sum. A failed delivery whose error code is `capped` counts as `capped` instead of `failed`: a send policy doing its job is not a delivery problem.
- `previous` repeats `subscribers.added`, `messages.total` and `deliveries` for the window of the same length that ends where this one starts, so a dashboard can show a change against the prior period without a second call.
- `series` has one entry per bucket (`interval`) from the bucket containing `from` to the one containing `to`, in order, every bucket present even when empty; `date` is the bucket's start in UTC (weeks start on Monday, months on the 1st): `subscribers` and `messages` created in it, and the four delivery buckets. Rows are cut by their `createdAt`.

Sends, statuses and outcomes are defined in [messages.md](messages.md).

## Events, runs, workflows and scheduled sends

The same window also carries the event stream and the engine (Tinybird behind them, so a few seconds behind the pages that read the actor):

- `events: { total }` and `events` per bucket in `series`; `topEvents: [{ name, count }]`, the five most tracked names in the window. Both count what the product and its users did (custom events and SDK signals) and leave out `source: system` bookkeeping such as `$run.*` and `$subscriber.*`; the catalog and the stream show everything.
- `runs: { started, live, completed, canceled, failed }` for runs **started** in the window, split by where they stand now, and `runsStarted` / `runsCompleted` / `runsFailed` per bucket in `series`; `previous` carries `events` and `runs` for the deltas.
- `workflows: [{ slug, name, running, sleeping, waiting, lastRunAt }]`, the active workflows with the most live runs (up to five) and when each last started a run.
- `scheduled: { count, nextAt }`, the messages still waiting for their moment and the earliest one.
