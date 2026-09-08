# @buzzkit/ping — the Buzz API

The Cloudflare Worker behind `ping.buzzkit.dev`. It is the backend for **Buzz**, the iOS app that
gives every install one endpoint their coding agents can POST to: a notification for one-off news
and a Live Activity for work in progress. Buzz reports; it is not a remote control. An agent that is
blocked sets its session `status` to `waiting` so the phone reads "Waiting on you" and the person
comes to their desk — the decision is made there, in the editor, natively. There is no answer path
back to the agent, because that could not stay in sync with a harness's own approval prompt across
every tool, and a decision surface that silently desyncs is worse than none.

**buzzkit powers it. Buzz is the app. ping is what you do.**

Everything a person reads — the product page, the App Store link, the setup walkthrough — lives at
`buzzkit.dev/buzz` in `apps/marketing`. `ping.buzzkit.dev` serves machines only; nothing here
renders a page. Its root 302s to `BUZZ_URL` so someone who finds the endpoint in a teammate's agent
config still lands somewhere useful. Keep it that way: a second place to write product copy is a
second place for it to go stale.

## The dogfooding rule (non-negotiable)

`apps/ping` may import **`buzzkit`** (the published SDK) and nothing else from the monorepo — no
`@buzzkit/database`, no `@buzzkit/api`, no `@buzzkit/schema`, no `@buzzkit/observability`. Its only
other runtime dependency is Elysia.

Buzz is a customer of the framework that happens to live in the same repository. Every time it
needs something the SDK does not expose, that is a framework gap, and the point of this rule is that
the gap shows up in `package.json` instead of being papered over with a private import. If you find
yourself wanting a monorepo package here, add the capability to `buzzkit` instead.

## Architecture

```
src/
├── index.ts              Entry — instrument({ fetch }) + the DeviceState Durable Object export
├── libs/
│   ├── buzzkit.ts        The lazily-constructed BuzzKit client (one per isolate)
│   ├── error.ts          PingError + subclasses and the global handler; branches on `instanceof`,
│   │                     never on Elysia's error `code` (`.error()` maps exact constructors only,
│   │                     so subclasses fall through to 500)
│   └── logger.ts         One JSON line per entry to Workers Logs — the whole logging stack
├── api/
│   ├── keys/             Key mint / format check / KV resolution / revoke
│   ├── pair/             Device pairing, key rotation, the six-digit desktop pairing code
│   ├── ping/             The wire payload: schemas, normalization, the opinionated defaults
│   ├── sessions/         The merge — types, constants, `deriveActivity`, `serializeSession`
│   ├── mcp/              The remote MCP server: JSON-RPC dispatch and the two tool definitions
│   └── skill/            `skill.md`, the agent-readable setup and convention document
├── device/               DeviceState, the Durable Object — one per paired device
│   ├── state.ts          The class: sessions, the alarm, the outbound pushes
│   ├── activity.ts       `resolveActivityPush` — the start / update / end / coalesce decision, pure
│   ├── store.ts          Typed SQLite access (read*/write*/insert*/remove* store vocabulary,
│   │                     matching `apps/api/src/actor/store.ts`)
│   ├── schema.ts         DDL
│   ├── types.ts          DeviceOutcome — see "Errors across the RPC boundary"
│   └── index.ts          The barrel: the `device()` stub, `unwrap`, the activity decision
├── utils/budget.ts       The token bucket, pure
└── modules/              File-based routes, mirroring the path exactly
```

## Routes

`GET /` (302 → `BUZZ_URL`) · `GET /health` · `GET /skill.md` · `POST /pair` · `POST /pair/claim` ·
`GET|POST|DELETE /:key` · `POST|DELETE /:key/activity` ·
`GET|DELETE /:key/timeline` · `GET /:key/stream` (WebSocket) · `POST /:key/code` · `POST /:key/rotate` · `POST /:key/mcp` · `GET /:key/skill.md`

**The timeline is the phone's notification center.** `DeviceState` appends an `events` row for a
claimed code (`connected`, which also pushes "Agent connected"; `POST /pair/claim` takes an optional
`agent` id so that notification and its card carry the agent's logo and subtitle instead of the Buzz mark),
every notification and every session status change (progress updates are not events; a finish carries
`durationMs` since the session started; a `waiting` status is a change like any other).
Capped at `TIMELINE_LIMIT` rows and `TIMELINE_RETENTION_MS` (`api/timeline`), pruned on insert and
by the alarm. `GET /:key/timeline` returns newest first; `DELETE` empties it (the app's "Clear
notifications"). It is read by the app, not by agents, so it
stays out of `skill.md`. `GET /:key/stream` upgrades to a WebSocket held by the Durable Object
(hibernatable), and every event insert, answer, expiry and clear sends the one-word message
`timeline` to every open socket; the app refetches on it. The socket carries no data itself, so a
stale client can never render something the GET would not.

The public origin is `PING_URL` (`libs/origin.ts`): production in `wrangler.jsonc`, the Tailscale
address in `.dev.vars`. `wrangler dev` rewrites `request.url` to the route pattern, so the request
origin is wrong locally and every URL the API hands out must go through `resolveOrigin`.

Static routes are registered before `/:key` in `modules/index.ts`. There is no reserved-word
collision to manage: every key starts with `bz_` and is exactly 27 characters, so `isKey` rejects
anything that could be a route name.

## The two decisions that carry the product

**One Live Activity, always — never one per session.** The device runs a single activity whose
content is *derived* from the whole session set: one session renders in full detail, several
collapse into a list ordered `waiting → failed → done → working` (a finished session lingers 90s,
so on top it reads as "just finished" before it leaves; the headline leads with the same group,
so a failure reads "1 failed" even while other agents keep working); inside `working` the order is
start time (oldest first) so rows keep their place while agents report, inside the other groups
it is most recently updated first. Several competing activities
would fight for Lock Screen space and hit iOS concurrency limits exactly when you are running four
agents and most need calm. It also collapses the hard problems — one push token, no activity churn.
`deriveActivity` (`api/sessions/derive.ts`) is that merge and is the most test-covered code here.

**The server derives the merged state, so agents never coordinate.** Each agent reports only its own
session; `DeviceState` folds them together and pushes. This is why Buzz needs a real backend rather
than a forwarding script, and it is the capability no competitor in this category has.

## Live Activity mechanics

- **Push-to-start** (`kind: 'start'` in buzzkit) means the activity appears without the app being
  open. Starting needs `attributesType` plus an alert — the API enforces both.
- **The activity id can only come from the device.** ActivityKit assigns it, so after a start push
  the app reports it back through `POST /:key/activity`. Until it arrives, updates cannot address
  the activity: `pushActivity` returns `coalesced` and lets the alarm retry after
  `ACTIVITY_START_GRACE_MS`. Never assume an id exists after a start.
- **APNs throttles Live Activity pushes.** Updates are coalesced to one per
  `ACTIVITY_PUSH_INTERVAL_MS`; a status *change* sets `force` and always lands, at `high` priority.
  Routine progress goes at `normal`.
- `staleDate` is always set, so an agent that dies greys out instead of lying.
- A failed activity push is logged and swallowed — it must never fail the agent's request.
- **The three activity transitions are three store methods**, and keeping them apart matters:
  `writeActivityStart` records that a start push went out (no id yet), `writeActivityId` binds the id
  the device reports back, `writeActivityEnded` clears both. A single combined writer previously
  nulled `activity_started_at` on start, which silently disabled the grace window and let every
  subsequent ping fire another start push.
- **The decision is pure and tested** (`resolveActivityPush`); `state.ts` only executes it. Add a
  case to `test/device/activity.test.ts` rather than reasoning about the branching in place.

**`ActivityState` is a wire contract with installed app builds, not an internal type.** The Worker
pushes it into whatever version of Buzz is on the phone, and people do not update apps promptly, so
the server is always talking to clients older than itself. Every state carries
`ACTIVITY_SCHEMA_VERSION`, and the rules follow from that:

- **Adding an optional field is safe** — the widget ignores what it does not know. Do this freely.
- **Renaming, removing, or changing the meaning of a field is not.** Bump the version, and keep the
  old field populated until the old builds are gone.
- The widget decodes defensively and must render something sane for a version *higher* than it
  knows, because that is the normal case after any server deploy.

## How a ping reaches the phone is one decision

`resolveDeliveryPolicy` (`api/ping/policy.ts`) decides `notify`, `interruptionLevel`, `collapseId`
and `threadId` for every ping, and it is pure and tested. The rules exist because the failure mode
of this product is being annoying:

- **A session with a running Live Activity never also sends a banner.** The activity is already
  showing it; a notification would be the same fact twice.
- **"Without an activity" means the push actually failed**, not that one was never attempted.
  `sendActivity` returns whether the push landed and `pushActivity` answers `unavailable` when it
  did not, which is what a device with Live Activities turned off looks like (no push-to-start
  token, so buzzkit 404s). Swallowing that failure made the fallback below unreachable in every
  case — the server believed every push had landed.
- **A session without an activity sends a collapsing banner instead.** `collapseId` is the session
  id, so APNs *replaces* the previous banner rather than stacking: twelve "still running" pings are
  one line that rewrites itself. This is most of the Live Activity's value for people who have them
  turned off, or after one is dismissed.
- **Repeated progress is `passive`**; a status change or a finish is `active`.
- **A Live Activity is a strip, and the length budget is ours, so we tell the agent.** A session
  ping whose `title` or `body` exceeds the comfort length (`ACTIVITY_TITLE_COMFORT` 48,
  `ACTIVITY_BODY_COMFORT` 72 in `api/sessions/constants.ts`) comes back with a `notice` field
  (`resolveActivityNotice`) naming what was too long and the target — the response is JSON an agent
  reads, so this is how the guideline reaches it. Text is still hard-clipped at
  `ACTIVITY_TITLE_LIMIT`/`ACTIVITY_BODY_LIMIT` (70/90) for the APNs payload, and the widget truncates
  visually well before that. Plain notifications get no notice: iOS shows more and expands on
  long-press, so their length is Apple's problem, not ours.
- **Every push carries a subtitle** when the agent or project is known: "Claude Code · buzzkit"
  (`resolveSubtitle`, `api/ping/agents.ts` maps agent ids to display names, unknown ids are
  title-cased). iOS renders it as the line under the title, so the phone always says which tool
  and which repo is talking without the title having to.
- **A ping may carry an `avatar` URL** for an agent Buzz has no bundled logo for. It rides on the
  session (a column, into the activity `contentState`), on the timeline event, and in the push
  `data` (`resolvePingMetadata`) so the notification-service extension can draw it. The server only
  carries the string; fetching, caching and the app-icon-vs-monogram fallback are the app's job.
- **Presence suppresses delivery entirely.** `POST /:key/presence` marks the human as sitting at
  their machine for a few minutes (a `UserPromptSubmit` hook is the natural caller). While present,
  `resolveDeliveryPolicy` returns `notify: false` for every notification and session banner — nothing
  is pushed, including a `waiting`, because someone at their desk can already see the agent. The Live
  Activity still updates (that push is separate from the banner), so a glance at the Lock Screen stays
  current; there is just no buzz. The window lapses on its own and delivery resumes.

## Pairing hands out two different credentials, once

`POST /pair` returns the ping key *and* a `buzzkit` block: the API url, the publishable key, the
device's `externalId` and its `identityHash`. The app needs all four to talk to buzzkit's client API
as that subscriber, and the hash is an HMAC under the tenant identity secret, so only a server can
mint it.

**That block is returned exactly once, at pair time, and never again.** No other route exposes it —
not `GET /:key`, not the snapshot. The ping key is deliberately a bearer URL that gets pasted into
agent configs and shell history; if it also unlocked the buzzkit identity, every agent holding it
could impersonate the device against the client API. The app stores the block in the Keychain, and a
device that loses it re-pairs.

`POST /pair` is unauthenticated by design (there are no accounts), which makes it a subscriber-creation
vector, so it is rate limited per `cf-connecting-ip` through the same token bucket the pings use.

**A rate limit carries its own unit**: `RateLimit` is `{ tokens, perSeconds, burst }`, never a bare
number. `spendBudget` used to take `(perMinute, burst)` as two loose numbers, and `PAIRS_PER_HOUR`
was passed straight into `perMinute` — pairing ran 60× looser than intended and nothing could catch
it, because both arguments were `number`. Keep the unit in the type.

## No OpenTelemetry here

Unlike `apps/api`, ping runs **no OTel tracing**: no `trace()` spans, no `instrument()` wrapper, no
OTLP exporter, no Axiom. The Worker's default export is a plain `{ fetch }` and `DeviceState` is
exported directly.

This is why `libs/logger.ts` is twenty hand-written lines instead of `@buzzkit/observability`:
`createLogger` shares a module with the tracing machinery, so importing it dragged the whole
OpenTelemetry tree into the bundle even with every span removed. Keep the logger local.

Cloudflare's own observability (`observability.enabled` in `wrangler.jsonc`) already records the
request, the Durable Object subrequest, the SQL execs and the KV reads, which is the whole picture
for an app this size. Do not reintroduce spans; a distributed tracing stack is not free to maintain
and ping is one Worker with one hop.

`log.info/warn/error('[Ping] Sentence', fields)` still applies, and error logs still carry
`describeError(error)` plus every id in scope. Without an invocation context the logger emits each
line immediately to Workers Logs instead of buffering, so there is nothing to flush.

## Errors across the RPC boundary

Durable Object RPC does not preserve error classes: a `PingError` thrown inside `DeviceState`
arrives at the Worker as a plain `Error`, losing its status and code. So every public `DeviceState`
method returns `DeviceOutcome<T>` and routes call `unwrap()`, which rebuilds the typed error
(including `RateLimitedError`'s `retry-after`). Internal code still throws normally — `guard()`
converts at the boundary. Unexpected errors are rethrown and become 500s.

## Rules

- **Same code standards as `apps/api`**: no comments anywhere, names written out, the verb catalog,
  one concern per file, `modules/**` holds nothing but Elysia instances. Load the `conventions` skill.
- **Responses are plain JSON, not the buzzkit envelope.** This is a public utility API consumed by
  `curl` and shell scripts; `{ ok, ... }` and `{ ok: false, error: { code, message } }` are the
  contract, and `skill.md` documents them.
- **The key is the whole credential.** It is a bearer URL by design, like a Slack webhook. Never log
  it, and treat rotation (two taps in the app) as the entire compromise-recovery story. **Rotation is
  a full reset, not just a new key:** `rotatePairing` mints and registers the new key and revokes the
  old, then the route wipes the device (`reset()` clears sessions and ends the activity,
  `clearTimeline()` empties the feed) so nothing carries over to the new URL — the app's rotate alert
  promises exactly this. Revocation is immediate: `resolveDeviceId` reads the key with no `cacheTtl`,
  so a rotated key 404s at once instead of lingering in KV's read cache for minutes (the bug that let
  the old endpoint keep working right after a rotate).
- **`skill.md` is a product surface, not a comment.** It is what agents read to learn the
  conventions, so changes to the payload or the session rules belong there in the same commit.
- **`skill.md` is also the interactive first-run setup guide** (`api/skill`). It walks the agent
  through claiming the code, saving the endpoint to `.claude/buzz/endpoint` in the repo (chmod 600,
  gitignored — the key never enters shell history or git), registering the MCP server, and — for
  Claude Code — offering hook-based automation the user tunes in `.claude/buzz/config.json`:
  `presence` (a `UserPromptSubmit` hook that POSTs `/presence`), `attention` (a `Notification` hook
  that pings "Waiting on you" with Claude's own message when it pauses for the user) and `finished`
  (a `Stop` hook that pings "Done" only when the turn ran longer than `finishedAfter` seconds). One
  `.claude/buzz/hook.sh` dispatches all three, reads the config fresh each run, and fails safe
  (`|| true`, `-m 5`) so it never blocks the agent. **Hooks and manual pings must not double up:** with
  the hooks installed the agent stops sending presence / done / plain-waiting itself and keeps only
  progress (`session` Live Activities) and rich `status: waiting`; without them the agent owns
  everything. Keep the shell in the template dependency-free (no `jq`), free of `${...}` and escaped
  quotes (the whole doc is a JS template literal — `${` interpolates and `\\"` collapses), and prove
  changes by extracting the heredoc and running `bash -n` plus a live fire against an endpoint.

## Setup

Two resources must exist before the first deploy:

```
bunx wrangler kv namespace create KEYS     # then replace REPLACE_WITH_KV_ID in wrangler.jsonc
bunx wrangler secret put BUZZKIT_API_KEY   # a bk_tn_ tenant key for the Buzz tenant
```

The tenant behind that key needs APNs connected, since every Buzz install is a subscriber in it.

## Commands

| Command | Description |
|---|---|
| `bun dev` | Dev server on port 8792 |
| `bun run test` | Unit tests (pure modules only — no Worker runtime, no network) |
| `bun check-types` | `wrangler types` + `tsc --noEmit` |
| `bun cf-typegen` | Regenerate `worker-configuration.d.ts` |
| `bun deploy` | Deploy to Cloudflare |

## Testing

Two layers, and both must stay green:

- **Unit** (`bun run test`) — pure modules mirroring `src/` (`test/api`, `test/device`, `test/utils`).
  No server, no network, no Worker runtime; `cloudflare:workers` is stubbed in `vitest.config.mts`.
- **End to end** (`bun run test:e2e`) — `scripts/test.ts` boots a **real** Worker on 8793 with its own
  `--persist-to` state, starts the buzzkit stub (`scripts/stub.ts`) on 8811, points
  `BUZZKIT_API_URL` at it, runs `test/e2e`, and tears both down. Every route is exercised over HTTP
  against the real Durable Object, real KV and real SQLite.

The stub is the point: it records every call ping makes to buzzkit, so the tests assert **what was
actually sent** — `collapseId`, `interruptionLevel`, the merged `contentState` — not just the
status code. `POST /__without-activities` makes live-activity sends
fail for one device, which is how the no-Live-Activity fallback is proved.

Two things the harness taught, worth keeping in mind when adding tests:

- **Nothing binds an activity id unless a test does it.** The id only ever comes from the device, so
  without `bindActivity(key, id)` every push is a `start` and updates never happen. Assert merged
  state through `GET /:key` (the snapshot) rather than through the last pushed activity, unless the
  test is specifically about the push.
- **Isolate by device, never by clearing.** Test files run in parallel; `messagesFor(externalId)`
  and `activitiesFor(externalId)` filter the stub's recording per device. Client addresses are
  seeded per worker process, because pairing is rate limited per address and two workers otherwise
  collide.
