---
name: conventions
description: buzzkit code conventions — load before writing or reviewing any code in this repo (API, packages, dashboard). Naming catalog, observability recipe, pagination/response/error patterns, readability style. Complements the terse rules in CLAUDE.md with the reasoning and right/wrong examples.
---

# buzzkit conventions

CLAUDE.md carries the law; this skill carries the worked examples. When they disagree, CLAUDE.md wins — and fix the drift in the same change.

## Function verbs — one catalog, no synonyms

Domain functions (`src/api/**`) use exactly these verbs:

| Verb | Contract |
|---|---|
| `find*` | single row, **throws** `NotFoundError` when absent |
| `select*` | single row, **returns null** when absent (private lookups, queue paths) |
| `list*` | many rows (including sweep feeds) |
| `count*` | total for a paginated list |
| `create*` / `update*` | plain writes |
| `upsert*` / `register*` / `replace*` | idempotent writes |
| `softDelete*` | soft-delete + cascade effects |
| `revoke*` (keys/invites) · `remove*` (memberships, actor rows) | takes something away |
| `assert*` | invariant check that throws; returns `void` |
| `resolve*` | derive a value from input/context (settings, credentials, decrypted secrets) |
| `serialize*` | response shape |
| `mask*` · `mark*` | redaction · response decorators |
| delivery verbs | `enqueue*` `claim*` `apply*` `finalize*` `expire*` `reconcile*` `rewrap*` `purge*` `touch*` `revalidate*` `resend*` `accept*` `record*` |

Banned everywhere: `get*`, `fetch*`, `set*`, `load*`, `delete*`, `destroy*`.

**The `find*`/`select*` split is a contract callers rely on**: if you null-check the result, the function must be `select*`; if absence is a 404, it must be `find*`. `find*` functions taking an id take the **sqid string** and decode inside (malformed id → 404, never 400).

**Infrastructure-store exception**: byte/KV stores speak `read*`/`write*`/`delete*`/`insert*` — `libs/cache.ts` (`readCache`/`writeCache`/`deleteCache`) and `actor/store.ts`. This vocabulary never leaks into `src/api/**`.

**Name collisions across domains are bugs.** `api/deliveries` (push) owns the unqualified delivery names; every other domain qualifies: `serializeWebhookDelivery`, `listSourceDeliveries`. If an import needs an alias, the name is wrong.

## Readability style

1. **Never wrap a call chain in a ternary.** Branch with guards and early returns; ternaries are for small value picks with simple operands.

```ts
// wrong
const [row] = sourceId ? await db.select().from(tables.source).where(...) : [];

// right
const sourceId = decodeEntityId('source', sourceSqid);
if (!sourceId) throw new NotFoundError('Source not found');

const [row] = await db.select().from(tables.source).where(...);
```

2. **Multi-line arrow bodies get a block and an explicit `return`.** One-liners stay as expressions.

```ts
// wrong
await trace('subscriptions.updateEnabled', async () =>
  await db.update(tables.subscription).set({ enabled }).where(...).returning()
);

// right
await trace('subscriptions.updateEnabled', async () => {
  return await db.update(tables.subscription).set({ enabled }).where(...).returning();
});
```

3. **Blank lines separate logical paragraphs inside a function — but only in functions long enough to have paragraphs.** A short function (a guard + a return, a lookup + a return, a store accessor) has no internal blank lines at all; it reads as one unit. The break earns its place in longer bodies with real phases — the fetch, the transform, each loop, the return. This is a judgment convention, deliberately not a lint rule.

```ts
// right — short functions stay tight, even with a guard or a multi-line return
listUnflushed(limit: number): ActorEventRow[] {
  const flushed = this.readFlushedSequence();
  return this.sql<ActorEventRow>`
    SELECT * FROM events WHERE sequence > ${flushed} ORDER BY sequence ASC LIMIT ${limit}
  `;
}
```

## No comments — anywhere, ever

Names and structure carry the meaning; invariants live in `docs/`. Applies to every package, JSDoc included. Only exceptions: functional directives (`biome-ignore`, `@ts-expect-error`), the `/* /v1/... */` route table (always `/*`, never `/**`), and `wrangler.jsonc` commentary.

## Observability — every unit of work is a span

- Wrap domain operations, provider calls, and queue/cron work in `trace('resource.verb', attrs?, fn)`. Span names are two segments, lowerCamelCase resource matching the module (`credentials.replace`, `subscriptions.updateEnabled`), with the two namespace families `queue.*` and `scheduler.*`. The span name always mirrors the function it wraps.
- **Never interpolate into a span name.** Provider, environment, and outcome are attributes: `trace('deliveries.send', { 'delivery.provider': provider }, …)`.
- **Stamp outcomes** with `t.set()` on any span whose result matters: `delivery.ok`, `delivery.code`, counts per outcome. A span with only a duration is half a span.
- Provider sends always go through a `deliveries.send` span with `delivery.ok`/`delivery.code` stamped — including live activities and cancel pushes.
- Logs are `log.info/warn/error('[Prefix] Sentence', fields)` — never `console`. Prefix is the area (`[Engine]`, `[Deliveries]`, `[Webhooks]`, `[Scheduler]`, `[Actor]`, `[Audit]`, `[Error]`, `[Queue]`). Error logs always carry `error: describeError(error)` plus every id in scope — `tenantId`, `subscriberId`, `runId`, `workspaceId`. A log line that can't be filtered per tenant is a defect.
- `requestId` is automatic: the telemetry plugin records it per invocation, and both the response envelope and every log line pick it up. Don't thread it by hand.
- **Never swallow an error silently.** A `catch` either rethrows, converts to a typed result, or logs with context — an empty `catch {}` hides broken infrastructure behind normal-looking behavior.
- Cron sweeps go through `sweep(name, run)` (`cron/sweep.ts`); queue consumers through `consume(name, batch, handler)` (`queue/consume.ts`) — never hand-roll the span/db preamble. Sweeps return counts; they become span attributes.

## The engine (Cloudflare Workflow)

- Each `context.do` step runs as `runInvocation(..., { traced: false })` (the shared `trace()` is silent there) but emits a manual `workflow.step <name>` span via `runWorkflowStep` — all steps of a run share a deterministic trace derived from the run id, each linked to the triggering request's trace, and `finish` emits the `workflow.run <slug>` root span with `workflow.run.result`.
- Step code gets its db from `stepDb()`, the tenant from `context.tenant(db)` (memoized per wake), never its own `createDb`.
- Step failures are recorded into run history (`report(step, 'failed', …)`) — a run must never fail without its failing step being visible.

## Database access

- Routes use the `db` from context (the shared plugin client). Engine/DO steps use `stepDb()`; queue consumers and sweeps use `batchDb()`. Never call `createDb` with inline options.
- Soft delete only; every read filters `isNull(deletedAt)`. Every data-plane query filters by `tenantId` from resolved auth context.
- Counts go through `countRows(db, table, where)` — never hand-roll `select({ total: count() })` or raw `sql`count(*)``.

## Pagination — the domain owns the page

Model: `listAuditEvents` (`api/audit/index.ts`). The domain function takes `(db, scope, options: { cursor?, limit?, …filters })`, uses `clampLimit` + `resolveCursor`, fetches `limit + 1` rows, returns `toPage(...)` (`toPageBy` for non-id cursors), optionally with `total`. The route is authorize → domain call → `Response.page(page)`. Never assemble `hasMore`/`nextCursor` in a route file.

## Responses & errors

- Always the envelope builders: `Response.success()` / `Response.list()` / `Response.page()` / `Response.error()`; `markDeleted()` on every DELETE. Root `id` needs `{ entity: '…' }`; new `*Id` fields need a `FIELD_ENTITIES` entry.
- Throw the typed classes from `libs/error.ts` with `{ code, param }` (lowercase snake_case codes). Never hand-build an error response in a handler.
- **Empty PATCH returns 200 with the unchanged entity** (Stripe semantics), never 400.

## Retries

One backoff engine: `nextRetryDelaySeconds(policy, attemptsMade, { floorSeconds?, retryAfterSeconds? })` in `libs/retry.ts`. Each domain owns a distinctly named `RetryPolicy` (`PUSH_RETRY_POLICY`, `WEBHOOK_RETRY_POLICY`) — never re-export generic constant names from two policies. Every retry path has jitter, a cap, and honors `Retry-After`; webhook deliveries retry all non-2xx except `410 Gone`.

## Shared helpers — never re-implement these

Before writing a loop or utility, check whether it exists: `timedFetch` (`libs/http.ts` — timeout + latency + body excerpt, the only outbound-fetch shape); `sealingContext` + `rewrapSealedRows` (`libs/crypto.ts`); `createVersioned`/`updateVersioned` (`api/versioning` — the entity+version tables algorithm segments and workflows share); `subscriberActorName` (`libs/actor.ts` — the only place the actor key format exists); `drain` (`utils/drain.ts` — bounded page-drain loops); `runConcurrently` (`utils/concurrency.ts` — the one bounded fan-out: a worker pool over a shared index, used by provider sends, schedule starts, event ingest and imports; items start in order, the limit must be a positive integer, a failing item stops further items from starting, in-flight items finish, and the call then rejects with the first error, so nothing is still running when the caller sees it; catch per item when a bad item must not fail the batch); `durationMs`/`lenientDurationSeconds` (`@buzzkit/schema/workflows`); `parseWallTime`, `DAY_MS`, `resolveTimeScale` (`libs/timezone.ts`); `countRows` (`libs/database.ts`).

## Where things live

- `modules/**` — route files: nothing but the Elysia instance. No helpers, types, schemas, or serializers. Repeated `params` shapes are named schemas in the domain or `libs/schemas.ts`.
- `src/api/<resource>` — a directory of small scoped files structured like `api/messages/`: `types.ts` + `schemas.ts` + `serialize.ts` + `constants.ts` (only for real tunables) + concept files named for their concern + an `index.ts` barrel holding the primary queries/mutations and re-exporting every sibling. Importers always use the barrel; files inside the directory import each other directly (never the barrel — no self-cycles). Each file keeps the canonical internal order (types → constants → schemas → serializers → queries → mutations). Tiny single-concern resources may stay one lean `index.ts`. Cross-resource algorithms get their own directory (`api/scheduling`, `api/versioning`). Unit tests mirror file for file: `test/api/<resource>/<file>.test.ts` ↔ `src/api/<resource>/<file>.ts`.
- `src/libs` — infrastructure (db, telemetry, response, retry, http, crypto, cache, timezone); a multi-concern lib becomes a directory (`libs/auth/`: client / resolution / handler / index-macros, imported as `libs/auth/index`). `src/utils` — pure functions only.
- `src/providers/<name>` — a directory of scoped files (`classify.ts`, `payload.ts`, `tokens.ts`, `validate.ts`, `send.ts`) with an index barrel exporting the `ProviderDefinition`; `shared/` holds cross-provider plumbing. Unit tests mirror file-for-file (`test/providers/apns/send.test.ts`).
- `apps/web` and `apps/marketing` (React/Astro): components PascalCase, hooks kebab-case `use-<name>.tsx`, `lib/` is `.ts` only, and a directory never mixes `.ts` and `.tsx` — fold a component tree's types/constants/helpers into the `.tsx` that owns them, and name files on import instead of adding a barrel to a components directory.
- No single-use constants: a value gets a name only when reused or a tunable policy number.

## Enforcement — what runs where

`bun lint` = Biome (hardened rule set; type-aware promise rules; custom Grit plugins in `.biome/plugins/` banning awaited calls in ternaries and interpolated span names) + `scripts/lint-conventions.ts` (the comments ban and the verb catalog — things Grit cannot see). `bunx knip` catches cross-module dead exports/files/deps. Hooks: pre-commit runs Biome on staged files + conventions + sherif; commit-msg enforces conventional commits; pre-push runs check-types + unit tests. CI mirrors all of it plus the unit suites. Two known enforcement gaps to keep honest about: Grit snippet patterns miss calls with explicit type arguments (`trace<T>(…)`) — the conventions still apply there; and `biome migrate` on version bumps must be diff-reviewed (it has rewritten `preset` to `"none"` before, silently disabling every rule).
