# Buzz

Buzz is the first product built on buzzkit, and it lives in this repository on purpose.

Every install gets one endpoint its owner's coding agents POST to: a notification when work
finishes, a Live Activity while it runs, and a blocking question when an agent needs a decision.
**buzzkit powers it. Buzz is the app. ping is what you do.**

| Piece | Where |
|---|---|
| API | `apps/ping` → `@buzzkit/ping`, deployed to `ping.buzzkit.dev` |
| iOS app | its own repository (`~/Developer/Projects/buzz`), SPM dependency on `BuzzKit-iOS` |
| Product page | `buzzkit.dev/buzz`, a prose page in `apps/marketing` |
| Agent setup | `ping.buzzkit.dev/skill.md`, served by the Worker |

## Why it is in this repository

Buzz is the dogfooding constraint made concrete. `apps/ping` may import **`buzzkit`** (the published
SDK) and nothing else from the monorepo: no `@buzzkit/database`, no `@buzzkit/api`, no
`@buzzkit/schema`, no `@buzzkit/observability`. Every time Buzz needs something the SDK does not
expose, that is a framework gap, and the rule makes it visible in `package.json` rather than hidden
behind a private import.

It also runs no OpenTelemetry. Cloudflare's own observability already records the request, the
Durable Object subrequest, the SQL execs and the KV reads, which is the whole picture for one Worker
with one hop; logging is a local twenty-line emitter writing JSON to Workers Logs.

It is also the hardest possible test of the framework. Live Activities are the worst case in the
push stack — token lifecycle, push to start, remote updates, throttling, staleness — so a framework
that carries Buzz carries anything.

`apps/api` must never grow a Buzz route. The Worker is a sibling, not a section of the platform API.

## The wire protocol

One endpoint, one JSON shape, upsert semantics:

```
POST https://ping.buzzkit.dev/<key>
```

`title` is the only required field, and a bare string body is accepted as the title, so the simplest
form is `curl -d 'Build done' ping.buzzkit.dev/<key>`. Two optional fields change the mode:

- **`session`** turns the ping into a Live Activity keyed on that id. Sending it again updates in
  place; `status: done` or `failed` closes it.
- **`ask`** poses a question with buttons and blocks the agent. `?wait=n` long-polls up to 60
  seconds; otherwise the caller polls `GET /<key>/asks/<id>`. A timeout resolves to a null answer
  with `timedOut: true`, which must never be read as approval.

The full field list and the agent-facing conventions live in `skill.md`
(`apps/ping/src/api/skill/index.ts`), which is a product surface rather than documentation: it is
what an agent reads to learn the protocol, so it changes in the same commit as the protocol.

## One Live Activity, always

The device runs exactly one activity whose content is **derived** from the whole session set: one
session renders in full detail, several collapse into a list ordered `waiting → failed → working →
done`, capped at five with an overflow count.

This is the product's central decision. Several competing activities would fight for Lock Screen
space and hit iOS concurrency limits exactly when someone is running four agents and most needs
calm. It also collapses the hard problems into one: a single push token, no activity churn, no
per-activity limits to manage.

The consequence is that **the server derives the merged state**. Each agent reports only its own
session and never coordinates with the others; `DeviceState` (one Durable Object per paired device)
folds them together and pushes. That is why Buzz needs a real backend instead of a forwarding
script, and it is the capability no competitor in this category has.

`deriveActivity` (`apps/ping/src/api/sessions/derive.ts`) is that merge, and it carries the app's
heaviest test coverage.

## Two credentials, handed over once

`POST /pair` returns the ping key **and** a `buzzkit` block: API url, publishable key, `externalId`
and `identityHash`. The app needs all four to act as that subscriber against buzzkit's client API,
and the hash is an HMAC under the tenant identity secret, so only a server can mint it.

That block is returned **exactly once** and no other route exposes it. The ping key is deliberately
a bearer URL that gets pasted into agent configs and shell history; if it also unlocked the buzzkit
identity, every agent holding it could impersonate the device. The app keeps the block in its app
group and a device that loses it re-pairs.

Pairing is unauthenticated by design — there are no accounts — which makes it a subscriber-creation
vector, so it is rate limited per client address.

## Schema versioning

`ActivityState` is a wire contract with **installed** app builds, not an internal type. People do
not update apps promptly, so the server is always talking to clients older than itself. Every state
carries `ACTIVITY_SCHEMA_VERSION`:

- Adding an optional field is safe and needs no bump.
- Renaming, removing or repurposing one needs a bump, and the old field stays populated until the
  old builds are gone.
- `status` is a string on both sides, never an enum, so a new status cannot break decoding on an old
  build.

## What is deliberately absent

- **No npm package and no CLI.** The MCP server is remote (`POST /<key>/mcp`), so Claude Code
  attaches with one command and nothing to install; hooks are plain `curl`. There is no handle to
  own and nothing to keep updated.
- **No landing page on the Worker.** `ping.buzzkit.dev` serves machines; its root 302s to
  `BUZZ_URL`. All human-facing copy lives in `apps/marketing`, so there is only one place for it to
  go stale.
- **No accounts.** A leaked key is rotated in two taps, and that is the entire compromise-recovery
  story.
