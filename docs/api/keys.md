# API Keys

Session-only management (`keys:read` / `keys:write` can never be satisfied by a key). See [authentication.md](../authentication.md) for kinds and prefixes.

## POST /v1/workspaces/:workspaceSlug/keys

```json
{ "name": "CI", "scopes": ["*"] }
{ "name": "Customer One server", "kind": "tenant", "tenant": "customer-one", "scopes": ["credentials:read"] }
{ "name": "iOS app", "kind": "client", "tenant": "default" }
```

Client keys take no scopes (fixed `/v1/client/*` capabilities) and their token stays viewable in the listing — they're public by design. Every tenant starts with an auto-created `Default` client key, minted with the workspace's default tenant and with every new tenant.

→ 201 with the **`secret` shown exactly once**. Scopes are validated against the key-grantable catalog (wildcards `*` and `resource:*` allowed); `expiresAt` optional. Tenant keys require an existing tenant slug.

## GET /v1/workspaces/:workspaceSlug/keys

Paginated (`limit`, `cursor`, newest first, plus `total`, see [conventions](conventions.md)) and filterable by `kind` (`workspace` | `tenant` | `client`). Masked keys only: `id`, `name`, `kind`, `tenantId`, `prefix` + `last4`, `token` (the plaintext for client keys, `null` for secret keys), `scopes`, `lastUsedAt` (throttled to 1 write/min), `expiresAt`, `revokedAt`, `createdAt`, `updatedAt`. `GET /v1/workspaces/:workspaceSlug/keys` is a list object; `GET /v1/workspaces/:workspaceSlug/keys/:id` retrieves one.

## DELETE /v1/workspaces/:workspaceSlug/keys/:id

Revokes (soft) — the key stops authenticating immediately. Keys are also revoked automatically when their tenant or workspace is deleted.
