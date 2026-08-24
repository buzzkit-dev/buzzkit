# API conventions

Every `/v1` endpoint follows these rules; they are the contract the SDK and dashboard are generated against.

## Envelope

Every response — success, error, 404, validation failure — is `{ success, data, error, metadata }`. `metadata.timestamp` is ISO-8601; `metadata.requestId` echoes the `Request-Id` response header (Cloudflare's `cf-ray` when present), which is also what to quote in support requests.

## Identifiers

Prefixed, opaque ids (`ws_`, `tnt_`, `key_`, `crd_`, `sub_`, `sbn_`, `tpc_`, `msg_`, `dlv_`, `evt_`, `inv_`, `mem_`). A malformed id, an id with another entity's prefix, or an id from another tenant are all the same **404** — existence is never leaked. Workspaces, tenants and topics are addressed by slug; subscribers by your `externalId` (URL-encode it); everything else by id.

## Verbs & status codes

`POST` creates (201) or accepts async work (202); `PATCH` partially updates (200; an empty patch is a 200 no-op); `PUT /subscribers/:externalId` upserts by your key (201 on create, 200 after); `DELETE` soft-deletes and returns the object with `deleted: true` (200). Preconditions on current state that fail — the last owner, the default tenant's slug or existence, an endpoint owned by another subscriber, a reused idempotency key — are **409** with a domain code, never 400. Every resource has list + retrieve. Auth failures are 401 (missing/invalid/expired credential), 403 (wrong scope, key on a foreign workspace/tenant), and 404 for a session that is not a member of the workspace it names.

## Objects

camelCase fields; every object carries `id`, `createdAt`, `updatedAt`; absent values are `null`, never omitted; timestamps are ISO-8601 strings; counts and durations carry their unit (`ttlSeconds`, `latencyMs`).

## Lists

Every list — paginated or not — is `{ items, hasMore, nextCursor }`. Paginated lists take `limit` (default 50, max 100) and `cursor` (the `nextCursor` of the previous page, opaque) and are ordered **newest first**. An invalid cursor is a 400 `invalid_cursor`. Lists that can count cheaply also carry `total`, the number of items across every page (keys today); unbounded ledgers (messages, events) never do.

## Errors

```json
{ "success": false, "data": null, "error": { "code": "channel_disabled", "message": "The 'push' channel is disabled for this tenant", "param": "channel", "details": null }, "metadata": { "timestamp": "…", "requestId": "…" } }
```

- `code` is lowercase snake_case and machine-readable: the HTTP class (`bad_request`, `validation`, `unauthorized`, `forbidden`, `missing_permission`, `not_found`, `conflict`, `gone`, `rate_limited`, `internal`, `unavailable`) or a domain code (`channel_disabled`, `channel_unsupported`, `targets_missing`, `payload_missing`, `payload_too_large`, `attributes_too_large`, `metadata_too_large`, `endpoint_owned`, `slug_taken`, `default_tenant_immutable`, `last_owner`, `tenant_required`, `idempotency_key_reused`, `idempotency_key_in_use`, `invalid_cursor`, `invalid_scope`, `invalid_api_key`, `api_key_expired`, `wrong_workspace`, `wrong_tenant`, `tenant_not_found`, `workspace_missing`, `missing_authorization`, `invalid_session`, `client_key_required`, `identity_required`, `identity_not_configured`, `invalid_identity_hash`, `subscriber_header_missing`, `invalid_service_account`, `credential_rejected`). Branch on `code`, never on `message`.
- `param` names the offending field when there is one. `validation` errors carry `details: [{ param, message }]` for every failing field.
- Database failures never surface as database codes: a unique-index race is a `conflict`, an outage is `unavailable`; unexpected errors are `internal` with the real message logged, not returned.

## Idempotency

`POST /v1/messages` accepts an `Idempotency-Key` header (preferred; the body field `idempotencyKey` is equivalent). Keys are unique per tenant and do not expire. A replay with the same request returns the original message with `202` and the header `Idempotent-Replayed: true`; the same key with a different request is a `409 idempotency_key_reused`.

## Headers

`Authorization: Bearer <session | bk_ws_… | bk_tn_… | bk_pk_…>`; `BuzzKit-Workspace` and `BuzzKit-Tenant` select the context for sessions and workspace keys (Stripe-Account pattern); `BuzzKit-Subscriber` + `BuzzKit-Identity` carry the end-user identity on `/v1/client/*` reads and mutations by id. Header names are case-insensitive. Every response carries `Request-Id`.
