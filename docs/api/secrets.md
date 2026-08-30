# Secrets

A tenant's secret store: named values the platform may send on the tenant's behalf but never shows again. Today workflows read them (`{{ secrets.<name> }}` in a `fetch` step's URL and headers, [workflows.md](workflows.md)); the store is not tied to workflows, so anything that later calls out for a tenant reads the same values. Tenant-context routes: a tenant key implies its tenant; workspace keys and sessions select one with `buzzkit-tenant`.

Values are sealed at rest the way provider credentials are (a data key per secret, wrapped by the master key, re-wrapped by the five-minute sweep after a rotation) and are unsealed only at the moment a step uses them. No response ever carries a value.

- `GET /v1/secrets` — every secret of the tenant, by name: `{ id: "sec_…", name, version, createdAt, updatedAt }`.
- `GET /v1/secrets/:name` — one secret's metadata; 404 when there is none.
- `PUT /v1/secrets/:name` — `{ value }` sets the value. 201 creates, 200 replaces and increments `version`; there is no separate create call. Names are a lowercase letter followed by letters, digits and underscores (at most 48 characters); values are 1 to 4,096 characters; a tenant holds at most 50 secrets (`secrets_limit`).
- `DELETE /v1/secrets/:name` — soft-deletes it; workflows that read it fail their next `fetch`.

Scopes: `secrets:read` (members, keys), `secrets:write` (admins, keys). Audit: `secret.created`, `secret.updated` (with the new `version`), `secret.deleted`, all delivered to webhooks; the ledger carries names and versions only.
