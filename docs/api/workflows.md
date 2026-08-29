# Workflows API

A workflow is a versioned spec ([engine.md](../engine.md), phase E5): a trigger event, optional conditions, and a list of steps that run for one subscriber at a time (waits, waits for events, branches, sends). The spec grammar lives in the framework package (`buzzkit/workflows`: the TypeBox schema, `isWorkflowSpec`, `lintWorkflow` with a path for every problem, `workflowProblem`), so the SDK, the API and the dashboard validate the same document. Tenant-context routes; `workflows:read` is member-level, `workflows:write` admin; both are key-grantable.

| Method | Path | Scope | Notes |
|---|---|---|---|
| GET | `/v1/workflows` | `workflows:read` | Every workflow of the tenant, by name, with its current and draft versions and its live run counts |
| POST | `/v1/workflows` | `workflows:write` | `{ slug, name, description?, spec }` → 201 as a `draft` with version 1. `new` is reserved (400 `slug_reserved`) |
| GET | `/v1/workflows/:slug` | `workflows:read` | The workflow with its latest spec, every version and its live run counts |
| PATCH | `/v1/workflows/:slug` | `workflows:write` | `{ name?, description? (null clears), spec? }`; a changed spec creates the next version as a draft, an identical one does not; the published version keeps running |
| POST | `/v1/workflows/:slug/publish` | `workflows:write` | Activates the latest version: `status: active`, `current` set, the tenant's definitions rewritten for the actors |
| POST | `/v1/workflows/:slug/pause` | `workflows:write` | `paused`: no new runs start, runs already going finish; only an active workflow (400 `workflow_not_active`); publish resumes |
| DELETE | `/v1/workflows/:slug` | `workflows:write` | Soft delete; the slug is free again; live runs are cancelled |
| GET | `/v1/workflows/:slug/runs` | `workflows:read` | The workflow's runs, newest first, `?status=` to filter, cursor paged ([Runs](#runs)) |
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
  "steps": [
    { "name": "settle", "wait": "2h" },
    { "name": "cancel", "waitFor": { "event": "trial.cancelled", "until": { "after": "trigger", "plus": "1d" } } },
    { "name": "outcome", "branch": { "if": { "ref": "steps.cancel.matched", "eq": true },
        "then": [{ "name": "sorry", "send": { "title": "Your trial is cancelled" } }, { "exit": true }],
        "else": [{ "name": "nudge", "send": { "topic": "trial", "title": "Your trial ends tomorrow" } }] } },
    { "name": "final", "waitUntil": { "after": "trigger", "plus": "2d", "at": "09:00", "timezone": "UTC" } },
    { "name": "bye", "send": { "title": "Thanks for trying" } }
  ]
}
```

- **Trigger**: `event` (an event name; `$run.*` is refused, 400 `invalid_spec`), optional `sources` (`server`, `ios`, `android`, `web`, `system`), optional `where` over `trigger.data.*` and `subscriber.attributes.*`.
- **`concurrency`**: `per-event` (default: every matching event starts a run) or `one-per-subscriber` (a new event is ignored while a run of this workflow is live for the subscriber).
- **`cancelOn`**: events that terminate a live run (`{ event, where? }`, `where` over `event.data.*`).
- **Steps** carry a `name` (lowercase letters, digits and dashes, unique in the version) except `exit`. `wait` is a duration (`15m`, `2h`, `3d`, at most a year). `waitUntil` is an anchor: `{ after: "trigger" | "steps.<name>", plus?, at?, timezone? }`; `at` needs a `timezone`, and `steps.<name>` may only point at a step that is guaranteed to have run before (an earlier step in the same list or in an enclosing list, never one inside a branch). `waitFor` takes `event`, optional `where` over `event.data.*`, and `until` (a duration or an anchor); the step records `matched` and the event's `data` under `steps.<name>`. `branch` takes `if` (an expression over `trigger`, `subscriber`, `steps`) and `then` / `else` lists, nesting at most 4 deep. `send` is a message payload (`title`, `body`, `subtitle`, `data`, `topic`, `channel` (`push` in this phase), `deliver` (`push`, or `local` once the iOS SDK lands)); at least a title, body or data. `exit` must be last.
- **Expressions** are the segment grammar ([segments.md](segments.md#expressions)) restricted to `ref` conditions here; projection conditions arrive with E6.

Errors: `invalid_spec` (400, `param` names the node, `spec.steps[0].wait`), `slug_reserved` (400), `slug_taken` (409), `workflow_not_active` (400), `not_found` (404).

Management actions are audit entries and public webhook events: `workflow.created / updated / published / paused / deleted`.

## Runs

A run is one subscriber going through one published version. The subscriber's actor starts it when a matching event arrives (`trigger.event`, `sources`, `where`, then `concurrency`), cancels it on a `cancelOn` match or when the workflow is deleted, and records every step; the engine itself is a Cloudflare Workflow instance whose id is the run id (`{tenantId}-{workflowId}-{subscriberId}-{sequence}`, so a duplicate trigger is the same run). Everything a run does is on the subscriber's event stream: `$run.started` (with the trigger), `$run.step` (`step`, `status`, `summary`, plus what the step recorded: `matched` and the event `data` for `waitFor`, `taken` for `branch`, `messageId` for `send`, `until` for waits), `$run.completed`, `$run.cancelled` (`reason`) and `$run.failed` (`error`, with `step` naming the step that failed). A step that hits a permanent API error (a 4xx such as an unknown topic) fails the run at once; transient errors are retried by the Workflow runtime before the run fails. Sends inside a run are ordinary messages carrying `run: { id, step }` (`run_id` / `run_step` on the row, indexed per tenant), so a message links back to its run and a run to its messages.

Run: `{ id, workflowId, workflow (slug), versionId, externalId, status, step, summary, startedAt, updatedAt }`; `status` is `running | sleeping | waiting | completed | cancelled | failed`, `step` the current or last step, `summary` its recorded outcome in words. `GET /v1/runs/:id` adds `events`, the run's stream events oldest first, in the shape of [events.md](events.md).

`GET /v1/workflows/:slug/runs` reads Tinybird's `runs_current` (one row per run, kept current by the `$run.*` events), so a run appears there a few seconds after it starts; `?status=` filters, `limit` and `cursor` page newest first. `GET /v1/runs/:id` asks the subscriber's actor first, so a live run is always fresh, and falls back to Tinybird for runs the actor no longer holds; its `events` merge the actor's recent events with the stored ones, so a step that was recorded a moment ago is already there. A run id from another tenant, or a malformed one, is a 404.
