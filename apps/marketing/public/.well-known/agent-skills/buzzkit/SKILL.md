---
name: buzzkit
description: Integrate BuzzKit, the open source notification orchestration layer, into an app and its backend. Use when a user wants push notifications in an iOS app, wants to send push from a server, or asks for subscribers, topics and preferences, segments, scheduled sends, events, workflows, Live Activities, inbound webhook sources or outbound webhooks. Covers the TypeScript SDK, the REST API, the iOS SDK and the dashboard, with the practices that make an integration hold up.
---

# BuzzKit

BuzzKit sends, segments, schedules and automates mobile push through a REST API, a dashboard and an iOS SDK, on the workspace's own Apple (APNs) and Firebase (FCM) credentials. The hosted version is `https://buzzkit.dev` with the API at `https://api.buzzkit.dev`; a self-hosted deployment serves the same API at its own origin.

Use this skill when the user wants notifications in their app, wants to send from their backend, or asks for anything in the description above. Everything in this skill is exact: field names, paths, error codes and limits come from the product. Do not invent endpoints, fields, scopes or limits. When something is not covered, read the documentation; every docs page answers as markdown with `.md` appended, and `https://docs.buzzkit.dev/llms-full.txt` is the whole reference in one file.

## Install this skill

Save this directory where your harness reads skills, so the reference files are on disk next session:

- Claude Code: `.claude/skills/buzzkit/`
- Cursor: `.cursor/skills/buzzkit/`
- Codex: `.codex/skills/buzzkit/`
- Anything else: the directory your tool documents for skills

Fetch every file listed under "Reference files" into `references/` beside this one. The canonical copy is `https://buzzkit.dev/skill.md` (also `https://buzzkit.dev/.well-known/agent-skills/buzzkit/SKILL.md`, digest-indexed at `https://buzzkit.dev/.well-known/agent-skills/index.json`), and each reference lives at `https://buzzkit.dev/.well-known/agent-skills/buzzkit/references/<file>`. Re-fetch when the user says the product changed.

## Reference files

Read the file for the part you are working on before writing code. Each is exact and self-contained.

| Read | When |
| --- | --- |
| `references/best-practices.md` | **Always, before the first line of code.** Identity, attributes, events, topics, idempotency, verification, secrets: the decisions that make everything later possible. |
| `references/server-sdk.md` | Any backend in TypeScript or JavaScript: the `buzzkit` package, every resource and method, pagination, errors, retries, identity signing, webhook verification. |
| `references/rest-api.md` | Any backend in another language, or when you need the exact HTTP shape: auth, the envelope, every endpoint by resource, error codes. |
| `references/ios-sdk.md` | The iOS app: install, configure, push registration, identity, events, deep links and actions, the service extension, the preferences screen, Live Activities, local notifications. |
| `references/browser-react.md` | A web app or React front end: `buzzkit/client` and `buzzkit/react`. |
| `references/messages.md` | Sending: targeting, every content field, scheduling, idempotency, expiry, delivery and how to debug a send. |
| `references/topics-preferences.md` | Notification categories and the settings screen. Read this whenever the app has any notification preference. |
| `references/events.md` | Tracking events from the backend and the app, reserved events, reading the stream. |
| `references/segments.md` | The expression grammar, saved segments, previews, inline audiences. |
| `references/workflows.md` | Versioned automations: triggers, every step, templates, dry runs, runs, local notifications. |
| `references/sources-webhooks.md` | Inbound webhooks from Stripe, Superwall, RevenueCat or anything custom, and outbound webhooks to the user's endpoint. |
| `references/tenants.md` | Workspaces, tenants for platforms sending for their customers, tenant settings, the identity secret, self-hosting. |

## What you need from the user

Ask for these before writing code. Keys are created in the dashboard, never through the API.

| Value | Where it comes from | Where it goes |
| --- | --- | --- |
| Client key `bk_pk_…` | Dashboard → API keys. Every workspace and tenant gets one automatically; the onboarding and the quick start hand it out. | The app binary and the browser. Public by design. |
| Workspace key `bk_ws_…` | Dashboard → API keys → Create key, type Workspace, or the quick start's "Create a workspace key". Shown once. | The backend only, as `BUZZKIT_API_KEY`. Never in an app, a browser bundle or a commit. |
| Identity secret | Dashboard → Settings → Channels → Identity verification. | The backend only, as `BUZZKIT_IDENTITY_SECRET`, to sign the identity hash. |
| API origin | `https://api.buzzkit.dev`, or the self-hosted origin. | `baseUrl` in the SDK, `apiURL` on iOS, the host in every curl. |

If the user pasted a client key into the prompt, that is the app key. Sending and everything under `/v1/*` needs a workspace key, so ask for one when the integration reaches the backend and put it in an environment variable.

## The integration, in order

Do the steps in this order and verify each before the next. Every step is idempotent, so re-running is safe.

1. **Read `references/best-practices.md`.** It decides how you name ids, what you put on subscribers, what you track and how preferences are built. Getting these right at the start is the difference between an integration that can segment, automate and personalize later and one that has to be redone.
2. **Confirm a channel is connected.** Sends fail with `channel_not_connected` until the tenant has a credential. The user uploads it in the dashboard; an agent cannot.
3. **The app** (`references/ios-sdk.md`): add the SDK with the client key, identify the user by the backend's own user id with every attribute you know, register for push, register the app's named actions, track the events that matter.
4. **The backend** (`references/server-sdk.md` or `references/rest-api.md`): install `buzzkit`, identify the same user id with the backend's attributes and timezone on every login, sign the identity hash, and send one message to it.
5. **Verify** (`references/messages.md`): `GET /v1/messages/:id` shows `counts`; `counts.total: 0` means no reachable subscription, which means the device never registered or registered under another id.
6. **Identity verification** (`references/tenants.md`): sign the hash on the backend, pass it to the app, turn on required verification once every client sends it.
7. **Preferences** (`references/topics-preferences.md`): if the app has, or will have, a notification settings screen, build it on topics now. Never a homegrown preferences table.
8. **Then the product work**: segments, scheduled sends, workflows, sources, webhooks, each in its reference.

Ask before anything that reaches real people: publishing a workflow, sending to a topic or segment, any send in a production tenant. Prefer the dry run (`POST /v1/workflows/:slug/test`) and the segment preview (`POST /v1/segments/preview`) to see what would happen.

## The practices that are not optional

The full reasoning is in `references/best-practices.md`. The rules an integration must never break:

1. **One id per person, the user's own.** `externalId` is the backend's user id in the app, on the server and in `to`. Never mint a BuzzKit-specific id and never store BuzzKit's `sub_` id as the address.
2. **Identify everywhere, every time, with everything.** Call identify on every launch and login from the app and on every login from the backend, carrying every attribute that could ever matter for targeting: plan, role, locale, signup date, lifecycle stage, counts, flags. Attributes are what segments filter and workflows branch on; an attribute you did not set cannot be used later.
3. **Track the events that describe the user's life in the product**, with stable dot-separated names and useful `data`. Events are what workflows trigger on and what segments count. Give every server-sent event an `id`.
4. **Any notification preference is a topic.** The settings screen reads and writes topics through the client API or the drop-in iOS view. No custom table, no custom endpoint, no flag on the user record.
5. **Idempotency on every send from server code.** Pass a meaningful `idempotencyKey`; retry only 429, 5xx and network failures.
6. **Secrets stay on the server.** `bk_ws_` and `bk_tn_` keys and the identity secret live in environment variables; `bk_pk_` is the only key that ships in an app or browser bundle.
7. **Verify with a read after every write** and dry-run before publishing. Never claim a push was delivered from a `202`.
8. **Do not invent.** Every field, path, scope and limit is in these files or the docs.

## Keys and authentication

Every request carries `Authorization: Bearer <key>`.

| Kind | Prefix | Runs | Reaches |
| --- | --- | --- | --- |
| Workspace | `bk_ws_` | The backend | Every tenant of the workspace. Pick one with `BuzzKit-Tenant: <slug>`, or omit it for the `default` tenant. |
| Tenant | `bk_tn_` | A backend that should see one tenant | That tenant's data plane only. Rejected on workspace routes. |
| Client | `bk_pk_` | Inside the app or browser | `/v1/client/*` only: identify, device registration, events and the subscriber's own preferences. Cannot send or read other subscribers. |

Keys carry scopes written `resource:action` (`messages:send`, `subscribers:write`, `events:write`, `*`). A key without the route's scope gets `403 missing_permission`. `keys:*`, `invites:*`, `members:write`, `workspace:delete` and `tenants:secrets` are session-only and can never be granted to a key.

Every response is the same envelope: `{ "success", "data", "error": { "code", "message", "param", "details" }, "metadata": { "timestamp", "requestId" } }`. Branch on `error.code`, never on the message, and quote `metadata.requestId` when asking for help. The codes are listed per resource in the references and in full in `references/rest-api.md`.

## Documentation

- Documentation: https://docs.buzzkit.dev (every page also as markdown with `.md` appended)
- Everything in one file: https://docs.buzzkit.dev/llms-full.txt, index at https://docs.buzzkit.dev/llms.txt
- API reference: https://docs.buzzkit.dev/api-reference, OpenAPI: https://buzzkit.dev/openapi.json
- Authentication walkthrough: https://buzzkit.dev/auth.md
- iOS SDK: https://github.com/buzzkit-dev/buzzkit-ios and https://docs.buzzkit.dev/sdks/ios/overview
- The product site for agents: https://buzzkit.dev/llms.txt, https://buzzkit.dev/developers.md
- Docs MCP server, to search and read the docs as tools: https://docs.buzzkit.dev/mcp
