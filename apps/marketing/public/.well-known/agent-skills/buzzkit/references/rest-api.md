# REST API

Use this for a backend in any language other than TypeScript, or when you need the exact HTTP shape. The `buzzkit` package is a thin typed layer over these calls (`references/server-sdk.md`). Base is `/v1` at `https://api.buzzkit.dev` or the self-hosted origin. The OpenAPI document is `https://buzzkit.dev/openapi.json`; the reference is `https://docs.buzzkit.dev/api-reference`; the auth walkthrough is `https://buzzkit.dev/auth.md`.

## Authentication

Every request: `Authorization: Bearer <key>`. Key kinds and scopes are in the entry `SKILL.md`. Add `BuzzKit-Tenant: <slug>` on a workspace key to pick a tenant, or omit it for `default`. `externalId` is URL-encoded in paths (emails, slashes and spaces work as ids).

## The envelope

Every response, success or failure:

```json
{ "success": true, "data": { }, "error": null, "metadata": { "timestamp": "…", "requestId": "…" } }
{ "success": false, "data": null, "error": { "code": "invalid_api_key", "message": "…", "param": null, "details": null }, "metadata": { "timestamp": "…", "requestId": "…" } }
```

Branch on `error.code`, never the message. `metadata.requestId` is also the `Request-Id` header; quote it in support. Lists are `{ items, hasMore, nextCursor, total? }`; pass `limit` (up to 100) and the previous `nextCursor`. `total` is present on Postgres-backed lists, absent on event-stream lists.

Auth error codes: `missing_authorization`, `invalid_api_key`, `api_key_expired` (401); `missing_permission`, `forbidden` (403); `not_found` (404, also for malformed ids, so existence is never leaked).

## Endpoints by resource

**Subscribers** (`references/best-practices.md`, `references/events.md`)
```
PUT    /v1/subscribers/:externalId              { attributes?, email?, subscribe?, timezone? }  → 201 first, 200 after
GET    /v1/subscribers/:externalId              embeds subscriptions, verified, identityVerifiedAt
DELETE /v1/subscribers/:externalId              soft-deletes the subscriber and subscriptions
GET    /v1/subscribers?search=&limit=&cursor=   items carry lastSeenAt, channels, platforms
GET    /v1/subscribers/:externalId/aliases
POST   /v1/subscribers/:externalId/aliases      { externalId }  records or merges an alias
GET    /v1/subscribers/:externalId/subscriptions | /preferences | /deliveries | /timeline | /runs
PATCH  /v1/subscribers/:externalId/preferences  { preferences: { slug: boolean | { push?, email? } } }
```

**Subscriptions**
```
POST   /v1/subscriptions        { externalId, channel: "push", platform: "ios"|"android", token, environment? }
                                | { externalId, channel: "email", address }
PATCH  /v1/subscriptions/:id    { enabled }
DELETE /v1/subscriptions/:id
```

**Events** — `POST /v1/events` (up to 100, `{ events: [...] }` or a bare object), `GET /v1/events`, `/v1/events/names`, `/v1/events/names/:name`, `/v1/events/volume`, `/v1/events/token`. `references/events.md`.

**Messages** — `POST /v1/messages`, `GET /v1/messages/:id`, `POST /v1/messages/:id/cancel`, `GET /v1/messages/:id/deliveries`, `GET /v1/deliveries/:id`, `GET /v1/deliveries/:id/attempts`, `POST /v1/live-activities/send`. `references/messages.md`.

**Topics** — `POST/GET /v1/topics`, `GET/PATCH/DELETE /v1/topics/:slug`, `/v1/topic-categories`. Client side: `GET/PATCH /v1/client/preferences`. `references/topics-preferences.md`.

**Segments** — `POST/GET /v1/segments`, `GET/PATCH/DELETE /v1/segments/:slug`, `POST /v1/segments/preview`, `GET /v1/segments/:slug/members`. `references/segments.md`.

**Workflows** — `POST/GET /v1/workflows`, `GET/PATCH/DELETE /v1/workflows/:slug`, `POST /v1/workflows/:slug/publish | /pause | /test`, `GET /v1/workflows/:slug/runs | /schedule`, `GET /v1/runs`, `GET /v1/runs/:id`. Secrets: `GET/PUT/DELETE /v1/secrets/:name`. `references/workflows.md`.

**Sources** — `POST/GET /v1/sources`, `GET/PATCH/DELETE /v1/sources/:id`, `POST /v1/sources/:id/preview`, `GET /v1/sources/:id/deliveries`, and the unauthenticated `POST /v1/sources/:id/ingest`. `references/sources-webhooks.md`.

**Webhooks** (workspace-scoped) — `POST/GET /v1/workspaces/:slug/webhooks`, `GET/PATCH/DELETE …/:id`, `POST …/:id/rotate`, `GET …/:id/deliveries`, `GET …/:id/deliveries/:deliveryId`, `POST …/:id/deliveries/:deliveryId/replay`, `GET …/webhooks/catalog`, `GET …/webhooks/events/:id`. `references/sources-webhooks.md`.

**Client API** (client key, `BuzzKit-Subscriber` + `BuzzKit-Identity` headers) — `POST /v1/client/identify`, `POST /v1/client/events`, `GET/PATCH /v1/client/preferences`, `POST /v1/client/subscriptions`, `PATCH/DELETE /v1/client/subscriptions/:id`. `references/browser-react.md`, `references/ios-sdk.md`.

**Tenants and workspace** — `POST/GET /v1/tenants`, `GET/PATCH/DELETE /v1/tenants/:slug`, the session-only `GET /v1/tenants/:slug/identity-secret` and `POST …/identity-secret/rotate`, `GET/PATCH /v1/workspaces/:slug`, `/v1/workspaces/:slug/members`, `/v1/workspaces/:slug/audit`, `/v1/credentials`, `/v1/stats`, `/v1/health`. `references/tenants.md`.

## Worked calls

```bash
curl https://api.buzzkit.dev/v1/subscribers/user_42 -X PUT \
  -H "Authorization: Bearer $BUZZKIT_API_KEY" -H "Content-Type: application/json" \
  -d '{ "attributes": { "name": "Maya", "plan": "pro" }, "email": "maya@acme.com", "timezone": "Europe/Berlin" }'

curl https://api.buzzkit.dev/v1/messages -X POST \
  -H "Authorization: Bearer $BUZZKIT_API_KEY" -H "Content-Type: application/json" \
  -H "Idempotency-Key: order-ord_1-shipped" \
  -d '{ "to": "user_42", "topic": "order-updates", "title": "Your order shipped", "body": "Arrives Thursday" }'

curl https://api.buzzkit.dev/v1/events -X POST \
  -H "Authorization: Bearer $BUZZKIT_API_KEY" -H "Content-Type: application/json" \
  -d '{ "events": [{ "externalId": "user_42", "name": "workout.completed", "data": { "duration": 42 }, "id": "w_1-done" }] }'
```

Tenant header, worked: `-H "BuzzKit-Tenant: gymly"` on any of the above sends into that tenant.

Retry only `429`, `5xx`, timeouts and connection failures, honoring `Retry-After`, and only for GET, PUT, DELETE or a POST with an idempotency key or event ids. After every write, read back to confirm.
