# API Keys

Session-only management (`keys:read` / `keys:write` can never be satisfied by a key). See [authentication.md](../authentication.md) for kinds and prefixes.

## POST /v1/workspaces/:slug/keys

```json
{ "name": "CI", "scopes": ["*"] }
{ "name": "Customer One server", "kind": "tenant", "tenant": "customer-one", "scopes": ["credentials:read"] }
{ "name": "iOS app", "kind": "client", "tenant": "default" }
```

Client keys take no scopes (fixed `/v1/client/*` capabilities) and their token stays viewable in the listing — they're public by design.

→ 201 with the **`secret` shown exactly once**. Scopes are validated against the key-grantable catalog (wildcards `*` and `resource:*` allowed); `expiresAt` optional. Tenant keys require an existing tenant slug.

## GET /v1/workspaces/:slug/keys

Masked keys only: `prefix` + `last4`, scopes, kind, tenantId, lastUsedAt (throttled to 1 write/min), expiresAt, revokedAt.

## DELETE /v1/workspaces/:slug/keys/:id

Revokes (soft) — the key stops authenticating immediately. Keys are also revoked automatically when their tenant or workspace is deleted.
