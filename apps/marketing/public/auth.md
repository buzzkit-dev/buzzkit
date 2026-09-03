# Authenticating with BuzzKit

BuzzKit authenticates every API request with a bearer API key. There is no OAuth flow today: keys are created in the dashboard, shown once, and sent as `Authorization: Bearer <key>` on every call to `https://api.buzzkit.dev/v1` or to a self-hosted deployment.

## Discover

BuzzKit publishes no OAuth metadata: there is no `/.well-known/oauth-protected-resource`, no `/.well-known/oauth-authorization-server`, no `WWW-Authenticate: Bearer resource_metadata` challenge and no `agent_auth` identity, claim or events endpoints. Agents do not register themselves or exchange assertions; a person creates a key once and the agent uses it. What exists:

- OpenAPI description: https://buzzkit.dev/openapi.json (the `bearerAuth` security scheme applies to every operation except `/v1/health`)
- API catalog: https://buzzkit.dev/.well-known/api-catalog
- Documentation: https://docs.buzzkit.dev
- Error envelope: every response, including errors, is `{ "success", "data", "error", "metadata" }`

## Pick a method

| Key | Prefix | Where it runs | What it can reach |
| --- | --- | --- | --- |
| Workspace key | `bk_ws_` | Your backend | Every tenant of the workspace; pick one per request with the `buzzkit-tenant: <slug>` header, or omit it for the default tenant |
| Tenant key | `bk_tn_` | A backend that should only see one tenant | That tenant's data plane only |
| Client key | `bk_pk_` | Inside the app binary | `/v1/client/*` only: identify, device registration, the subscriber's own preferences |

A backend integration needs one workspace key. Use a tenant key when a customer or a semi-trusted subsystem should get direct access with a one-tenant blast radius. Ship a client key in the app; it cannot read other subscribers or send.

## Register

1. Create an account at https://buzzkit.dev/signup (email and password). Every account starts a workspace with a default tenant.
2. Upload the APNs key or the Firebase service account for that tenant so push is connected.

Sign-up is self-serve, there is no approval step, and the free plan needs no card.

## Claim

Keys are created in the dashboard under your workspace's API keys page (`https://buzzkit.dev/<workspace>/keys`) by a signed-in member with the `keys:write` scope. Choose the kind (workspace, tenant or client), the tenant for tenant and client keys, the scopes, and an optional expiry. The secret is shown exactly once; BuzzKit stores only its SHA-256 hash.

Keys cannot mint keys: `keys:*`, `invites:*`, `members:write`, `workspace:delete` and `tenants:secrets` are session-only, so a leaked key can never escalate.

## Exchange

There is nothing to exchange. The key is the bearer token and stays valid until it expires or is revoked.

## Use the access_token

```
curl https://api.buzzkit.dev/v1/messages \
  -H "Authorization: Bearer bk_ws_..." \
  -H "buzzkit-tenant: gymly" \
  -H "Content-Type: application/json" \
  -d '{ "to": "user_42", "title": "Leg day", "body": "6:00 with Maya." }'
```

Scopes are `resource:action` pairs (`messages:write`, `subscribers:read`, `events:write`, `topics:*`, `*`). Every route declares exactly one required scope; a key without it gets a 403 with the code `missing_permission`.

## Errors

| Status | Code | Meaning |
| --- | --- | --- |
| 401 | `missing_authorization` | No `Authorization` header |
| 401 | `invalid_api_key` | Unknown, revoked or malformed key; a key presented under the wrong prefix is also invalid |
| 401 | `api_key_expired` | The key's expiry has passed |
| 403 | `forbidden` | The key belongs to another workspace or tenant, or is the wrong kind for the route |
| 403 | `missing_permission` | The key lacks the route's scope |
| 404 | `not_found` | The addressed workspace or tenant does not exist for this credential |

Errors look like `{ "success": false, "data": null, "error": { "code": "invalid_api_key", "message": "Invalid API key", "param": null, "details": null }, "metadata": { "timestamp": "...", "requestId": "..." } }`. Quote `metadata.requestId` in support requests.

## Revocation

Revoke a key from the dashboard's API keys page or with `DELETE /v1/workspaces/<workspace>/keys/<id>` as a signed-in member. Revocation takes effect immediately in the region that served the request and within about a minute everywhere else. Rotate by creating the replacement first, moving your backend over, then revoking the old key.
