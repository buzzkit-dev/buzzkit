# Audit log

The `event` table in Postgres is the ledger of **control-plane facts** — who did what to the workspace and its tenants: workspaces, members, invites, keys, tenants, credentials, topics, and tenant-level `message.created` / `message.completed`. One synchronous write at mutation time feeds the audit log and, later, webhook delivery; the `webhook` flag per name lives in `AUDIT_CATALOG` (`apps/api/src/api/audit/catalog.ts`); names follow Stripe's convention (`object.verb`, `object.field_changed`). Anything about a *subscriber* — identifies, device registrations, mutes, removals, invalidations, preference changes — is not here: those are `$` events on the [event stream](events.md), where workflows and segments can react to them.

**The rule (non-negotiable):** every control-plane mutation records exactly one entry via the context-bound `audit()` function (actor + request metadata attached by the auth layer) — always `await`ed, so the row is durable before the response. Never recorded: reads, auth denials, per-request key usage. New names MUST be added to `AUDIT_CATALOG` — `audit()` calls are type-checked against it.

## GET /v1/workspaces/:workspaceSlug/audit

Scope `audit:read` (admin sessions, or keys granted it). Keyset-paginated newest-first (`{ items, hasMore, nextCursor }`, cursors are `aud_…` ids); filters: `?event=tenant.created` (exact name), `?actorType=member|user|key|system`, `?from=` / `?to=` (ISO date-times on `createdAt`), and `?q=` (case-insensitive substring over the event name, the actor's display, the target id, prefixed or bare, and the subscriber's external id in `data`); `total` counts the filtered ledger for page numbering. Each event: `id`, `event`, `tenantId` (null for account/workspace-level events), `actorType`, `actorDisplay`, `actorMemberId` / `actorKeyId` (whichever applies), `targetType`, `targetId` (prefixed id), `data`, `requestId`, `ip`, `userAgent`, `createdAt`. Internal ids (workspace, BetterAuth user) are never exposed.

```json
{
  "id": "aud_…", "event": "tenant.created",
  "actorType": "key", "actorDisplay": "CI (bk_ws_I8dWt6…kWsl)",
  "targetType": "tenant", "targetId": "tnt_…",
  "data": { "name": "Customer One", "slug": "customer-one" },
  "requestId": "…", "ip": "…", "userAgent": "…", "createdAt": "…"
}
```

Actors: `member` (session; display = email), `key` (display = key name + masked secret), `system` (crons/queues).
