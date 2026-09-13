# Workflows

A workflow is a versioned JSON spec that runs per subscriber: a trigger, options and steps. Every run is one subscriber going through one published version, so waits, branches and sends are decided from that person's own attributes, topics and history. Author it through the API or the dashboard; both validate against the same schema. Scopes `workflows:read` / `workflows:write`. Types: `buzzkit/workflows` (`WorkflowSpec`, `STEP_KINDS`). Docs: `https://docs.buzzkit.dev/automation/workflows`, `sdks/ios/local-notifications`.

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
      { "name": "canceled", "when": { "any": [{ "ref": "steps.cancel.matched", "eq": true }, { "ref": "vars.status.canceled", "eq": true }] }, "steps": [{ "name": "sorry", "send": { "topic": "trial", "title": "Your trial is canceled" } }, { "exit": true }] },
      { "name": "otherwise", "steps": [{ "name": "nudge", "send": { "topic": "trial", "title": "Your trial ends {{ trigger.data.endsAt | date }}", "skipIfSentWithin": "1d" } }] }
    ] },
    { "name": "final", "waitUntil": { "delay": "2d", "time": "09:00", "timezone": "subscriber" } },
    { "name": "bye", "send": { "topic": "trial", "title": "Thanks for trying, {{ subscriber.attributes.name | default: \"there\" }}" } },
    { "name": "remember", "set": { "attribute": "trialEnded", "value": true } }
  ]
}
```

## Triggers

- **Event**: `{ "event": name, "sources"?: ["server"|"ios"|"android"|"web"|"system"], "where"?: expression }`, where `where` reads `trigger.data.*`, `subscriber.attributes.*` and the subscriber's history.
- **Schedule**: `{ "schedule": { "cron": "0 10 * * MON" } | { "daily": "19:00" }, "timezone": IANA | "subscriber", "segment"?: slug, "where"?: expression }`. One run per member each fire.
- `concurrency`: `per-event` (default, a run per matching event) or `one-per-subscriber` (ignore a new event while a run is live for that subscriber).
- `cancelOn`: events that terminate a live run, each with an optional `where` over `event.data.*`. The rules with no `where` are the ones a device can evaluate for local notifications.

## Steps

Every step has a unique `name` except `exit`.

| Step | Shape and behavior |
| --- | --- |
| `wait` | `"wait": "15m" | "2h" | "3d"`, from when the step starts, at most a year. |
| `waitUntil` | `{ delay?, time?, timezone? }`, at least one of `delay` or `time`. `delay` counts from the run's start; `time` snaps to the next occurrence of that wall clock and needs a `timezone` (IANA or `subscriber`). |
| `waitFor` | `{ event, where?, timeout, settleFor?, resetOn? }`. Records `matched` and the event's `data` under `steps.<name>`. `settleFor` + `resetOn` waits for a quiet moment: the event starts a `settleFor` clock, each `resetOn` event restarts it, the step completes when it runs out untouched; unmatched only when `timeout` passes. `timeout` is a duration or `{ delay }`. |
| `branch` | An ordered list of cases `{ name, when?, steps }`. The first case whose `when` holds runs and records `taken`; a case with no `when` is the fallback (at most one, last, records `else`). Lanes rejoin after the branch unless they `exit`. Nest at most four deep. |
| `repeat` | `{ steps, every, max, until? }`: run the steps, wait `every`, repeat until `until` (an expression) holds or `max` passes are done. |
| `forEach` | `{ items, as, max, steps }`: walk a list from the scope, each item readable as `vars.<as>`. A `repeat` inside a `forEach` is allowed; loops do not nest with themselves. |
| `fetch` | `{ method?, url, headers?, body?, timeout?, expect?, as?, onError? }`. `GET` by default (`POST` when a `body` is set), `https` only (plus `http://localhost` for self-hosters), `{{ secrets.<name> }}` in `url` and `headers`. `timeout` 1s–60s (default 10s), `expect.status` lists success codes (2xx default). The reply lands under `steps.<name>` as `{ status, headers, data }`, and with `as` also under `vars.<as>`. Carries `webhook-id` (`{runId}:{step}`, stable across retries) and `webhook-timestamp`. 5xx, timeouts and network errors retry three times; an unexpected status is final and `onError` decides: `fail`, `skip`, `continue` (with `data: null`). |
| `set` | `{ attribute, value }` on the subscriber or `{ var, value }` on the run. |
| `send` | A message payload with the same fields as a direct send (`references/messages.md`), plus `skipIfSentWithin` (skip if a message went to this person within the duration) and `deliver: "local"` (hand it to the device as a local notification). |
| `exit` | Ends the run as completed. Useful inside a branch case; a marker only at the top level. |

## Templates

`send`, `set`, `fetch` and conditions interpolate `{{ subscriber.attributes.* }}`, `{{ subscriber.externalId }}`, `{{ trigger.data.* }}`, `{{ steps.<name>.* }}`, `{{ vars.* }}`, with filters such as `| date` and `| default: "…"`.

## Versions and publishing

```ts
await buzzkit.workflows.create({ slug: 'trial-nudge', name: 'Trial nudge', spec });
await buzzkit.workflows.update('trial-nudge', { spec });     // a changed spec creates the next draft version
await buzzkit.workflows.publish('trial-nudge');              // activates the latest version
await buzzkit.workflows.pause('trial-nudge');                // stops new runs; live ones finish
```

`POST /v1/workflows` answers `201` with a `draft` at version 1 (`new` is reserved). Publishing sets `status: active` and points `current` at it. Pausing needs an active workflow (`400 workflow_not_active`); publishing resumes it. A spec that fails validation is `400 invalid_spec` with `param` naming the node (`spec.steps[0].wait`). Deleting soft-deletes, frees the slug and cancels live runs.

## Dry runs

```ts
const result = await buzzkit.workflows.test('trial-nudge', {
  version: 3,
  externalId: 'user_42',
  event: { name: 'trial.started', data: { plan: 'monthly' }, source: 'server' },
  at: '2026-09-01T10:00:00Z',
  assume: { status: { status: 200, data: { canceled: false } }, cancel: { matched: true, data: { reason: 'price' } } },
});
```

`POST /v1/workflows/:slug/test` runs a version through the engine without waiting, sending or writing. `version` defaults to the published one. `externalId` runs it for a real subscriber with their attributes, timezone and history; `attributes` runs it for a made-up one with no history. `at` is the clock: every wait moves it forward instead of sleeping. `assume` keys steps by name (`{ matched, data }` for `waitFor`, `{ status, data }` for `fetch`). The reply is `{ version, trigger, subscriber, outcome, exited, error, step, path, steps, vars, lint }`; a send records its rendered payload, a set records the value, a failing step ends the trace with `outcome: "failed"`. Nothing is created. **Always dry-run before publish**, because a published workflow starts real runs on the next matching event.

## Runs

```
GET /v1/workflows/:slug/runs?status=   the workflow's runs
GET /v1/runs?status=&workflow=          every run of the tenant
GET /v1/runs/:id                        one run with its full timeline
GET /v1/subscribers/:externalId/runs    one person's runs
GET /v1/workflows/:slug/schedule        next fire per zone and the last 20 fires (400 not_scheduled for an event workflow)
```

A run is `{ id, workflowId, workflow, versionId, externalId, status, step, summary, startedAt, updatedAt }`; `status` is `running`, `sleeping`, `waiting`, `completed`, `canceled`, `failed`. Everything a run does is on the subscriber's stream as `$run.started`, `$run.step`, `$run.completed`, `$run.canceled`, `$run.failed`; a `send` inside a run is an ordinary message carrying `run: { id, step }`. Subscribe a webhook to `$run.*` to watch runs from a backend.

## Local notifications

A `send` with `deliver: "local"` sends a silent push at the start of the preceding wait that hands the device the whole notification (title, body, `data`, the cancel event names). The device schedules it at the wall-clock moment with no network, tracks `$local.scheduled`, cancels it when the app tracks a matching `cancelOn` event, and the run sends the same message as an ordinary push if no device acknowledged by the time the wait ends. A `waitUntil` immediately followed by a `deliver: "local"` send is the local-window pattern. Quiet hours still apply unless `policy: "ignore"`. The device needs the SDK configured, the Remote notifications background mode and notification permission (`references/ios-sdk.md`).

## Patterns

- **Onboarding nudge**: trigger `signup.completed`, `cancelOn` `onboarding.completed`, wait a day, `send` a "finish setup" push that never fires for people who already finished.
- **Trial ending**: trigger `trial.started`, `waitUntil` two days before `trigger.data.endsAt`, branch on a `fetch` of current status, send or exit.
- **Win-back**: schedule daily over a segment of `lastSeen olderThan 30d`, send once, `set` an attribute so the next fire's segment excludes them.
- **Local reminder**: trigger `workout.scheduled`, `waitUntil` `{ time: "07:00", timezone: "subscriber" }`, `send { deliver: "local" }`, `cancelOn` `workout.completed`.
