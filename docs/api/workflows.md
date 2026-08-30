# Workflows API

A workflow is a versioned spec ([engine.md](../engine.md), phases E5 and E6): a trigger (an event or a schedule), optional conditions, and a list of steps that run for one subscriber at a time (waits, waits for events, branches, fetches, writes, sends). The spec grammar lives in the private `@buzzkit/schema/workflows` package (`lintWorkflow` with a path for every problem, `isWorkflowSpec`, `workflowProblem`), so the API and the dashboard validate the same document; the API adds a TypeBox schema on the request. Tenant-context routes; `workflows:read` is member-level, `workflows:write` admin; both are key-grantable.

| Method | Path | Scope | Notes |
|---|---|---|---|
| GET | `/v1/workflows` | `workflows:read` | Every workflow of the tenant, by name, with its current and draft versions and its live run counts |
| POST | `/v1/workflows` | `workflows:write` | `{ slug, name, description?, spec }` → 201 as a `draft` with version 1. `new` is reserved (400 `slug_reserved`) |
| GET | `/v1/workflows/:slug` | `workflows:read` | The workflow with its latest spec, every version and its live run counts |
| PATCH | `/v1/workflows/:slug` | `workflows:write` | `{ name?, description? (null clears), spec? }`; a changed spec creates the next version as a draft, an identical one does not; the published version keeps running |
| POST | `/v1/workflows/:slug/publish` | `workflows:write` | Activates the latest version: `status: active`, `current` set, the tenant's definitions rewritten for the actors |
| POST | `/v1/workflows/:slug/pause` | `workflows:write` | `paused`: no new runs start, runs already going finish; only an active workflow (400 `workflow_not_active`); publish resumes |
| DELETE | `/v1/workflows/:slug` | `workflows:write` | Soft delete; the slug is free again; live runs are canceled |
| GET | `/v1/workflows/:slug/runs` | `workflows:read` | The workflow's runs, newest first, `?status=` to filter, cursor paged ([Runs](#runs)) |
| GET | `/v1/workflows/:slug/schedule` | `workflows:read` | A schedule workflow's next fire times per zone and its recent fires ([Schedules](#schedules)); 400 `not_scheduled` for an event workflow |
| POST | `/v1/workflows/:slug/test` | `workflows:read` | A dry run of a version for a subscriber or a set of attributes, with assumptions; never sends ([Dry runs](#dry-runs)) |
| GET | `/v1/runs` | `workflows:read` | Every run of the tenant across workflows, newest first, `?status=` and `?workflow=<slug>` to filter, cursor paged |
| GET | `/v1/runs/:id` | `workflows:read` | One run with every event of its timeline |
| GET | `/v1/subscribers/:externalId/runs` | `workflows:read` | The subscriber's runs as the actor holds them, newest first: fresh, live and finished alike |

Workflow: `{ id: "wf_…", slug, name, description, status: draft | active | paused, trigger, spec, current: Version | null, draft: Version | null, versions?: Version[], createdAt, updatedAt }`; Version: `{ id: "wfv_…", number, publishedAt, createdAt }`, plus `spec` inside `versions` so a past version can be read and compared. `spec` is always the latest version's; `current` is the published one, `draft` the newer unpublished one when there is one; `versions` only on `GET /v1/workflows/:slug`. `runs: { running, sleeping, waiting, steps: { [step]: n } }` counts the live runs (list and single read), `steps` being how many of them sit at each step.

## The spec

```json
{
  "trigger": { "event": "trial.started", "sources": ["server"], "where": { "ref": "trigger.data.plan", "eq": "monthly" } },
  "concurrency": "one-per-subscriber",
  "cancelOn": [{ "event": "subscription.started" }],
  "defaultTimezone": "Europe/Berlin",
  "steps": [
    { "name": "settle", "wait": "2h" },
    { "name": "status", "fetch": { "url": "https://api.example.com/trial?user={{ subscriber.externalId }}", "headers": { "Authorization": "Bearer {{ secrets.api }}" }, "as": "status", "onError": "skip" } },
    { "name": "cancel", "waitFor": { "event": "trial.canceled", "timeout": { "delay": "1d" } } },
    { "name": "outcome", "branch": [
        { "name": "canceled", "when": { "any": [{ "ref": "steps.cancel.matched", "eq": true }, { "ref": "vars.status.canceled", "eq": true }] },
          "steps": [{ "name": "sorry", "send": { "title": "Your trial is canceled" } }, { "exit": true }] },
        { "name": "otherwise", "steps": [{ "name": "nudge", "send": { "topic": "trial", "title": "Your trial ends {{ trigger.data.endsAt | date }}", "skipIfSentWithin": "1d" } }] }
      ] },
    { "name": "final", "waitUntil": { "delay": "2d", "time": "09:00", "timezone": "subscriber" } },
    { "name": "quiet", "waitFor": { "event": "$app.backgrounded", "settleFor": "5m", "resetOn": ["$app.opened"], "timeout": "1d" } },
    { "name": "bye", "send": { "title": "Thanks for trying, {{ subscriber.attributes.name | default: \"there\" }}" } },
    { "name": "remember", "set": { "attribute": "trialEnded", "value": true } }
  ]
}
```

- **Trigger**, one of two shapes:
  - `{ event, sources?, where? }`: an event name (`$run.*` is refused, 400 `invalid_spec`), optional `sources` (`server`, `ios`, `android`, `web`, `system`), optional `where` over `trigger.data.*`, `subscriber.attributes.*` and the subscriber's history.
  - `{ schedule, timezone, segment?, where? }`: `schedule` is `{ cron: "0 10 * * MON" }` (five fields: minute, hour, day of month, month, day of week; names, ranges, lists and steps) or `{ daily: "19:00" }`; `timezone` is an IANA name or `subscriber` (each subscriber's `$timezone`, `defaultTimezone` when unknown); `segment` is a segment slug (every subscriber when absent); `where` reads `subscriber.attributes.*` and the history. One run starts per member each time the schedule fires.
- **`concurrency`**: `per-event` (default: every matching event starts a run) or `one-per-subscriber` (a new event is ignored while a run of this workflow is live for the subscriber).
- **`cancelOn`**: events that terminate a live run (`{ event, where? }`, `where` over `event.data.*`).
- **`defaultTimezone`**: the zone used for `timezone: "subscriber"` when the subscriber has no `$timezone` attribute; `UTC` when absent.
- **Steps** carry a `name` (lowercase letters, digits and dashes, unique in the version) except `exit`. Three waits: `wait` says how long, `waitUntil` which moment, `waitFor` which event.
  - `wait` is a duration (`15m`, `2h`, `3d`, at most a year), counted from when the step starts.
  - `waitUntil` is a moment: `{ delay?, time?, timezone? }`, at least one of `delay` or `time`. `delay` counts from the run's start (so it is unaffected by how long earlier steps took); `time` snaps to that wall-clock time, the next occurrence at or after the computed instant, and needs a `timezone` (an IANA name or `subscriber`). `{ "time": "09:00", "timezone": "subscriber" }` is the next 09:00 local; `{ "delay": "2d", "time": "09:00", "timezone": "subscriber" }` is day 2 at 09:00 local.
  - `waitFor` takes `event`, optional `where` over `event.data.*`, and `timeout` (a duration or a moment); the step records `matched` and the event's `data` under `steps.<name>`. With `settleFor` and `resetOn` it waits for a quiet moment after the event: the event starts a clock of `settleFor`, every `resetOn` event restarts the wait, and the step completes once the clock runs out untouched (`{ "event": "$app.backgrounded", "settleFor": "5m", "resetOn": ["$app.opened"], "timeout": "1d" }` lands the next send when nobody is looking). If the event already happened more recently than any `resetOn` event, the clock starts at once.
  - `branch` is an ordered list of cases `{ name, when?, steps }`: the first case whose `when` holds runs its `steps`, and the step records `taken` (its name). A case without `when` is the fallback: there is at most one and it comes last (a later case could never run); without one, nothing runs and `taken` is `else`, which is why `else` is reserved for a fallback case's name. Case names follow the step-name rules and are unique per branch; lanes rejoin the steps after the branch unless they end with `exit`. Nesting at most 4 deep.
  - `fetch` is `{ method?, url, headers?, body?, timeout?, expect?, as?, onError? }`: `method` is `GET` (default) or `POST` (default when `body` is set), `PUT`, `PATCH`, `DELETE`; `headers` and `url` may read `{{ secrets.<name> }}` from the tenant's [secrets](secrets.md); `body` is an object (sent as JSON) or a string; `timeout` is `1s` to `60s` (`10s` by default); `expect.status` lists the status codes that count as success (2xx by default). Every call carries `webhook-id` (`{runId}:{step}`, the same on every retry, so a receiver can dedupe) and `webhook-timestamp`; authenticate it with a header of your own, such as `Authorization: Bearer {{ secrets.api }}`. Only `https` (and `http://localhost` for self-hosters). The reply lands under `steps.<name>` as `{ status, headers, data }` (`data` parsed when the content type is JSON, text otherwise, at most 64 KB) and, with `as`, under `vars.<as>`. 5xx, timeouts and network errors retry three times; an unexpected status is final and `onError` decides: `fail` (default) fails the run, `skip` records the step as skipped and continues, `continue` continues with `data: null`.
  - `set` writes one value: `{ attribute, value }` writes a subscriber attribute (never a `$` one) through the subscriber API, `{ var, value }` a variable of the run read as `vars.<name>`. A string value may be a template.
  - `send` is a message payload (`title`, `body`, `subtitle`, `data`, `topic`, `channel` (`push`), `deliver` (`push`, or `local` once the iOS SDK lands), `skipIfSentWithin`); at least a title, body or data. `skipIfSentWithin` (a duration) skips the step when the subscriber already received a message with the same `topic` (or from this step when there is none) inside the window.
  - `exit` ends the run as completed, as the last step of its list. A run ends by itself after its last step, so at the top level it is only a marker; inside a branch case it is what stops the run instead of rejoining the steps after the branch.
- **Templates** in `title`, `body`, `subtitle`, `data`, `fetch.url`, `fetch.headers`, `fetch.body` and `set.value` read `trigger.*`, `subscriber.*`, `steps.*`, `vars.*` and `now` inside `{{ }}` (`fetch.url` and `fetch.headers` also `secrets.*`), with Liquid-named filters taking comma-separated arguments (text: `upcase`, `downcase`, `capitalize`, `strip`, `truncate: 40`, `append: "!"`, `prepend: "#"`, `replace: "-", " "`, `pluralize: "day"`, `url_encode`, `json`; lists: `size`, `first`, `last`, `join: ", "`; numbers: `number: 1`, `round: 1`, `ceil`, `floor`, `abs`, `plus`, `minus`, `times`, `divided_by`, `modulo`, `at_least`, `at_most`; dates: `date: "long"` (`full`, `long`, `medium`, `short`, `weekday`), `time`, `plus: "3d"`, `minus: "1h"`, `until` and `ago` ("3 days", or `until: "short"` for "3d"); any: `default: "there"`) and a condition (`{{ vars.cancel ? "Resubscribe to keep your alerts." : "Your alerts continue." }}`). Dates and times render in the subscriber's timezone. A `set.value` or `data` entry that is exactly one placeholder keeps the value's type.
- **Expressions** are the segment grammar ([segments.md](segments.md#expressions)) with `ref`, `count`, `never` and, for workflows only, `occurred` (`{ occurred: "$app.opened", within: "7d" }`), `opened` and `delivered` (`{ opened: "nudge" }`: a `$notification.opened` / `$notification.delivered` for the message an earlier send step sent). `count` and `occurred` take `within` (a duration) or `since` (`trigger`: since the run started, `localMidnight`: since midnight in the subscriber's timezone). `lastSeen` and `channel` stay in segments; `opened` and `delivered` are read in `branch.if` and `waitFor.where`, not in a trigger. The actor answers all of them from the subscriber's own history.

Errors: `invalid_spec` (400, `param` names the node, `spec.steps[0].wait`), `segment_not_found` (400, a schedule over a segment the tenant does not have), `slug_reserved` (400), `slug_taken` (409), `workflow_not_active` (400), `not_found` (404).

Management actions are audit entries and public webhook events: `workflow.created / updated / published / paused / deleted`.

## Runs

A run is one subscriber going through one published version. The subscriber's actor starts it when a matching event arrives (`trigger.event`, `sources`, `where`, then `concurrency`), cancels it on a `cancelOn` match or when the workflow is deleted, and records every step; the engine itself is a Cloudflare Workflow instance whose id is the run id (`{tenantId}-{workflowId}-{subscriberId}-{sequence}`, so a duplicate trigger is the same run). Everything a run does is on the subscriber's event stream: `$run.started` (with the trigger), `$run.step` (`step`, `status`, `summary`, plus what the step recorded: `matched` and the event `data` for `waitFor`, `taken` for `branch`, `messageId` for `send`, `until` for waits), `$run.completed`, `$run.canceled` (`reason`) and `$run.failed` (`error`, with `step` naming the step that failed). A step that hits a permanent API error (a 4xx such as an unknown topic) fails the run at once; transient errors are retried by the Workflow runtime before the run fails. Sends inside a run are ordinary messages carrying `run: { id, step }` (`run_id` / `run_step` on the row, indexed per tenant), so a message links back to its run and a run to its messages.

A step's `status` on `$run.step` is `running | sleeping | waiting | completed | skipped`; `skipped` is a send held back by `skipIfSentWithin` or a fetch whose `onError` is `skip`, and the run goes on. A fetch records `url` and `responseStatus` (or `error`), a set its `attribute` / `var` and `value`, a local-time wait its `timezone` next to `until`. A run started by a schedule carries `trigger: { name: "$schedule", firedAt, zone }` on `$run.started` and reads `trigger.data.firedAt` / `trigger.data.zone` in its steps.

Run: `{ id, workflowId, workflow (slug), versionId, externalId, status, step, summary, startedAt, updatedAt }`; `status` is `running | sleeping | waiting | completed | canceled | failed`, `step` the current or last step, `summary` its recorded outcome in words. `GET /v1/runs/:id` adds `events`, the run's stream events oldest first, in the shape of [events.md](events.md).

`GET /v1/workflows/:slug/runs` reads Tinybird's `runs_current` (one row per run, kept current by the `$run.*` events), so a run appears there a few seconds after it starts; `?status=` filters, `limit` and `cursor` page newest first. `GET /v1/runs/:id` asks the subscriber's actor first, so a live run is always fresh, and falls back to Tinybird for runs the actor no longer holds; its `events` merge the actor's recent events with the stored ones, so a step that was recorded a moment ago is already there. A run id from another tenant, or a malformed one, is a 404.

## Schedules

A workflow whose trigger is a `schedule` starts runs on the clock instead of on an event. Every minute the API records the fires that came due (for `timezone: "subscriber"`, one per IANA zone as each zone reaches the time; subscribers without a `$timezone` fire with the workflow's `defaultTimezone`, `UTC` when absent), then starts one run per member of the `segment` (every subscriber when there is none) whose `where` holds, honoring `concurrency`. A fire is drained in pages across ticks, so a large audience takes minutes, and a tick that runs twice starts nothing twice (the run id is `{tenant}-{workflow}-{subscriber}-{fire time}`). A paused or deleted workflow stops firing; runs already started finish.

`GET /v1/workflows/:slug/schedule` → `{ schedule, timezone, defaultTimezone, segment, next: [{ zone, at }], fires: [{ firedAt, zones, version, started, finishedAt }] }`: `next` is the soonest fire per zone (at most ten, soonest first), `fires` the last twenty fire instants with how many runs each started and when it finished draining (`null` while still paging); zones that share an instant (every zone at one UTC offset for a subscriber schedule) are one entry and `zones` lists them. For `timezone: "subscriber"` the first `next` entry is the next zone anywhere to reach the time.

## Dry runs

`POST /v1/workflows/:slug/test` runs a version through the engine without waiting, sending or writing, and returns what it would have done:

```json
{
  "version": 3,
  "externalId": "user_42",
  "event": { "name": "trial.started", "data": { "plan": "monthly" }, "source": "server" },
  "at": "2026-09-01T10:00:00Z",
  "assume": {
    "status": { "status": 200, "data": { "canceled": false } },
    "cancel": { "matched": true, "data": { "reason": "price" } }
  }
}
```

- `version` picks a version by number (the published one, else the latest, when absent), so drafts and old versions can be tried.
- `externalId` runs it for a real subscriber (their attributes and timezone, history conditions answered by their actor); `attributes` runs it for a made-up one (`$timezone` allowed; a made-up subscriber has no history, so `count` is 0, `occurred`, `opened` and `delivered` are false and `never` is true). One or the other, neither means an empty subscriber.
- `event` is the trigger event for an event workflow (`name` must match the trigger; defaults to it); a schedule workflow ignores it and fires at `at` (defaults to now) in the subscriber's zone. `at` is the dry run's clock: every `wait` and `waitUntil` moves it forward instead of sleeping, so each trace entry's `at`, `now` in templates and the moments in step summaries say when the step would really happen.
- `assume` keys steps by name: `{ matched, data }` for a `waitFor` (unmatched when absent), `{ status, data }` for a `fetch` (recorded as `Would call host` when absent, `data` empty).

Reply: `{ version, trigger, subscriber, outcome: completed | failed, exited, error, path: [step, …], steps: [{ step, status, summary, detail, at }], vars, lint }`. Waits resolve at once but record the instant they would have ended (`until`, `timezone`); a send checks its topic and records the rendered payload (`Would send “…”`, `detail.payload`); a set records the value (`Would set …`); a step that would fail (an unknown topic, a blocked host, an assumed 4xx) ends the trace with `outcome: failed` and `error`, exactly as a real run would. Nothing is created: no message, no attribute write, no event.
