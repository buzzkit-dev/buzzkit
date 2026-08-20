# Tenants

The multi-tenant product promise: one tenant per customer, each with fully isolated credentials, subscribers, devices, and sends. Every workspace has an undeletable `default` tenant — the simple single-app case uses it without ever knowing tenants exist.

Auth: workspace API key (implies the workspace) or session + `x-workspace` header. Scopes: `tenants:read` / `tenants:write`.

## POST /v1/tenants

```json
{ "name": "Customer One", "slug": "customer-one", "metadata": { "externalId": "cus_123" } }
```

→ 201 `{ id: "tnt_…", name, slug, isDefault, metadata, createdAt, updatedAt }`. Slug: `^[a-z0-9]+(-[a-z0-9]+)*$`, unique per workspace, the stable address for all tenant-scoped APIs — pick carefully. `metadata` is free-form (your own customer id).

## GET /v1/tenants

Keyset-paginated (`limit` ≤ 100, `cursor` from `nextCursor`), oldest-first: `{ items, hasMore, nextCursor }`.

## GET /v1/tenants/:tenantSlug

## PATCH /v1/tenants/:tenantSlug

Any of `name`, `slug`, `metadata` (metadata replaces wholesale). The default tenant keeps its slug.

## DELETE /v1/tenants/:tenantSlug

Soft-deletes the tenant and revokes its tenant-scoped keys. The default tenant returns 400.
