# Data Model

PostgreSQL schema, owned by `packages/database` (Drizzle). Tables land per roadmap phase; this file is updated in the same change as every schema migration.

## Conventions (all tables, no exceptions)

- **Soft delete only.** Every table has `deletedAt`; deletes are `update … set deletedAt`, reads filter `isNull(deletedAt)`, unique constraints are partial (`where deleted_at is null`).
- **Serial numeric PKs internally; Sqids-prefixed strings externally** (`ws_…`, `tnt_…`; subscribers get 32-char sqids). Numeric IDs never appear in API responses.
- **`createdAt` / `updatedAt`** timestamps everywhere, UTC.
- **Tenant scoping.** Every data-plane table carries `tenantId`; every query must filter by it. Control-plane tables (workspace, member, invite, api_key) carry `workspaceId`.

## Tables

### Phase 1 — identity & tenancy *(implemented — migration `0000`)*

- `user`, `session`, `account`, `verification` — BetterAuth (1.6.25; pinned, its schema expectations change between minors). `user` ids are BetterAuth text ids, not serials.
- `workspace` — slug partial-unique. `workspace_member` — role enum (member/admin/owner), one active membership per (workspace, user).
- `tenant` — the isolation boundary. Slug partial-unique **per workspace**; exactly one `is_default = true` per workspace (partial unique index), created in the workspace-create transaction; `metadata` JSONB for platform customer ids.
- `api_key` — kind `workspace` | `tenant` (tenant keys carry `tenant_id`), SHA-256 `key_hash` (unique), display `prefix`/`last4`, `scopes` text[], `expires_at`/`revoked_at`/`last_used_at`.
- `workspace_invite` — token partial-unique, one pending invite per (workspace, email), 7-day expiry, accepted → `accepted_member_id`.

### Phase 2 — credentials & events *(implemented — migration `0001`)*

- `credential` — tenant-scoped; envelope-encrypted secret (`secret_ciphertext`/`secret_iv` sealed by a per-credential DEK, `dek_ciphertext`/`dek_iv` sealed by the master key, `key_version` for rotation); non-secret `details` JSONB (APNs: teamId/keyId/bundleId; FCM: projectId/clientEmail); enums channel (push — email/sms later), provider (apns|fcm), environment (production|sandbox), status (unvalidated|active|invalid); one live row per (tenant, channel, provider, environment) via partial unique index.
- `event` — the append-only ledger (audit log + future webhooks): workspace/tenant scope, actor columns (type/user/member/key/display), Stripe-style event names, target type + bare sqid id, `data` JSONB, request metadata. No soft delete — events are never deleted.

### Phase 3 — subscribers, subscriptions, topics *(implemented)*

- `subscriber` — tenant-scoped, (tenant, external_id) partial-unique, `attributes` JSONB (tag data / segment fuel), `identity_verified_at` (client HMAC proof).
- `subscription` — one way to reach a subscriber on one channel: `channel` enum + `endpoint` (push token / email address / later phone), `platform` (push only), **`enabled`** (per-subscription mute — the work-iPhone case), status enum (active|invalid) + invalidation fields for the delivery feedback loop. (tenant, channel, endpoint) partial-unique so re-registration is idempotent and endpoints move between subscribers.
- `topic` — tenant-scoped notification categories, (tenant, slug) partial-unique, `default_opted_in` baseline + `channel_defaults` JSONB per-channel overrides.
- `subscriber_preference` — (subscriber, topic, channel) unique — preferences are per topic × channel; stores only deviations from the topic's channel default; hard rows (no soft delete — resolved against live topics).
- Send-time resolution (Phase 4): a topic send on a channel reaches the subscriptions that are `enabled` AND `active` AND whose (topic, channel) preference resolves opted-in.

> Migrations were **squashed to a single `0000`** pre-launch when the subscription model landed — nothing was deployed anywhere yet.
- `tenant` carries `identity_secret` (client HMAC verification) and **`settings` JSONB** — Stripe-style structured groups (identity, channels), resolved with defaults at read time, deep-merged on PATCH, validated against a settings catalog; `api_key` has kind `client` + plaintext `token` column (client keys are public and re-viewable).

### Phase 4 — sending

`message` (request, target spec, counts) · `delivery` (one per device: status, attempts, provider response).

### Phase 7/8 — definitions & workflows

`segment`, `campaign`, `workflow` (immutable definition versions) · `event` (track API) · `workflow_run`.

### Phase 10 — hardening

`webhook`, `webhook_delivery`, `audit_event`, usage counters.
