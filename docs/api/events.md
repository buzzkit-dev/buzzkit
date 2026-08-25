# Events (Audit Log)

One `event` table is the ledger for the workspace audit log and — later — webhook delivery: a single synchronous write at mutation time feeds both. The `webhook` flag per event name lives in `EVENT_CATALOG` (`apps/api/src/api/events/catalog.ts`); event names follow Stripe's convention (`object.verb`, `object.field_changed`).

**The rule (non-negotiable):** every mutation endpoint records exactly one event via the context-bound `event()` function (actor + request metadata attached by the auth layer) — always `await`ed, so the ledger row is durable before the response. Never recorded: reads, auth denials, per-request key usage. New event names MUST be added to `EVENT_CATALOG` — `event()` calls are type-checked against it.

## GET /v1/workspaces/:workspaceSlug/events

Scope `events:read` (admin sessions, or keys granted it). Keyset-paginated newest-first (`{ items, hasMore, nextCursor }`, cursors are `evt_…` ids); filters: `?event=tenant.created` (exact name), `?actorType=member|user|key|system`, `?from=` / `?to=` (ISO date-times on `createdAt`), and `?q=` (case-insensitive substring over the event name, the actor's display, the target id, prefixed or bare, and the subscriber's external id in `data`); `total` counts the filtered ledger for page numbering. Each event: `id`, `event`, `tenantId` (null for account/workspace-level events), `actorType`, `actorDisplay`, `actorMemberId` / `actorKeyId` (whichever applies), `targetType`, `targetId` (prefixed id), `data`, `requestId`, `ip`, `userAgent`, `createdAt`. Internal ids (workspace, BetterAuth user) are never exposed.

```json
{
  "id": "evt_…", "event": "tenant.created",
  "actorType": "key", "actorDisplay": "CI (bk_ws_I8dWt6…kWsl)",
  "targetType": "tenant", "targetId": "tnt_…",
  "data": { "name": "Customer One", "slug": "customer-one" },
  "requestId": "…", "ip": "…", "userAgent": "…", "createdAt": "…"
}
```

Actors: `member` (session; display = email), `key` (display = key name + masked secret), `system` (crons/queues), `user` (subscribers, from Phase 3).
