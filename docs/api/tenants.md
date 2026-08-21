# Tenants

The multi-tenant product promise: one tenant per customer, each with fully isolated credentials, subscribers, devices, and sends. Every workspace has an undeletable `default` tenant — the simple single-app case uses it without ever knowing tenants exist.

Auth: workspace API key (implies the workspace) or session + `buzzkit-workspace` header. Scopes: `tenants:read` / `tenants:write`.

**The platform flow stores exactly one key.** Create tenants and act on them with the same `bk_ws_` key — tenant-scoped calls just add `buzzkit-tenant: <slug>`. There is no per-tenant key to mint or store (tenant keys exist only as optional restricted keys for delegating one-tenant access).

## POST /v1/tenants

```json
{ "name": "Customer One", "slug": "customer-one", "metadata": { "externalId": "cus_123" } }
```

→ 201 `{ id: "tnt_…", name, slug, isDefault, metadata, createdAt, updatedAt }`. Slug: `^[a-z0-9]+(-[a-z0-9]+)*$`, unique per workspace, the stable address for all tenant-scoped APIs — pick carefully. `metadata` is free-form (your own customer id).

## GET /v1/tenants

Keyset-paginated (`limit` ≤ 100, `cursor` from `nextCursor`), oldest-first: `{ items, hasMore, nextCursor }`.

## GET /v1/tenants/:tenantSlug

## PATCH /v1/tenants/:tenantSlug

Any of `name`, `slug`, `metadata` (metadata replaces wholesale), `settings`. The default tenant keeps its slug.

## Settings

Structured tenant configuration (Stripe-style `settings` object, JSONB on the tenant row). Responses always return the fully-resolved object with defaults applied; PATCH deep-merges per group; unknown groups/keys/types are a 400 (validated against the settings catalog).

```json
{
  "settings": {
    "identity": { "requireVerification": false },
    "channels": { "push": { "enabled": true }, "email": { "enabled": true } }
  }
}
```

- `identity.requireVerification` — enforce client HMAC identity proof (see [client.md](client.md)); enabling it generates the tenant's identity secret if missing.

## Identity secret

The tenant object never carries the identity secret. It lives behind two **session-only** endpoints (scope `tenants:secrets`, admin+; API keys get 403 and cannot be granted the scope):

- `GET /v1/tenants/:tenantSlug/identity-secret` → `{ id, identitySecret, updatedAt }` — reveal, for your backend's configuration.
- `POST /v1/tenants/:tenantSlug/identity-secret/rotate` → new secret; every hash minted with the old one stops verifying immediately. Recorded as `tenant.identity_secret_rotated`.
- `channels.<channel>.enabled` — per-tenant channel kill-switch ("pause all email without deleting the Resend key"); enforced at send time from Phase 4.

Settings are deliberately **small tenant configuration only**. Routing logic (segment→provider, geo rules, traffic splits) is NOT settings — it ships later as code-defined routing rules (Phase 8 specs, like campaigns/segments).

## DELETE /v1/tenants/:tenantSlug

Soft-deletes the tenant and revokes its tenant-scoped keys. The default tenant returns 400.
