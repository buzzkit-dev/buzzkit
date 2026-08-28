import { PUBLIC_EVENTS as PUBLIC_AUDIT_EVENTS } from '@buzzkit/api/api/audit/index';
import { NotFoundError } from '@buzzkit/api/libs/error';
import { decodeEntityId, encodeId } from '@buzzkit/api/libs/sqids';
import { trace } from '@buzzkit/api/libs/telemetry';
import { clampLimit, resolveCursor, toPage } from '@buzzkit/api/utils/pagination';
import {
  and,
  count,
  type Db,
  desc,
  eq,
  getTableColumns,
  gt,
  inArray,
  isNull,
  lt,
  notExists,
  or,
  sql,
  tables,
} from '@buzzkit/database';
import { subscriptionMatches } from './catalog';
import { listEnabledEndpoints } from './endpoints';
import { HORIZON_CLOCK_SKEW_MS, RECONCILE_LOOKBACK_MS, STALE_DELIVERY_GRACE_MS } from './policy';
import type {
  AttemptOutcome,
  DeliveryOutcome,
  WebhookAttempt,
  WebhookDelivery,
  WebhookDeliveryStatus,
  WebhookEndpoint,
  WebhookEvent,
  WebhookEventInput,
} from './types';

export async function findWebhookEvent(
  db: Db,
  workspaceId: number,
  eventSqid: string
): Promise<WebhookEvent> {
  const eventId = decodeEntityId('webhookEvent', eventSqid);
  const [row] = eventId
    ? await db
        .select()
        .from(tables.webhookEvent)
        .where(and(eq(tables.webhookEvent.id, eventId), eq(tables.webhookEvent.workspaceId, workspaceId)))
    : [];
  if (!row) throw new NotFoundError('Webhook event not found');
  return row;
}

export async function findWebhookEventById(db: Db, eventId: number): Promise<WebhookEvent | null> {
  const [row] = await db.select().from(tables.webhookEvent).where(eq(tables.webhookEvent.id, eventId));
  return row ?? null;
}

export async function findDelivery(
  db: Db,
  endpointId: number,
  deliverySqid: string
): Promise<WebhookDelivery> {
  const deliveryId = decodeEntityId('webhookDelivery', deliverySqid);
  const [row] = deliveryId
    ? await db
        .select()
        .from(tables.webhookDelivery)
        .where(
          and(eq(tables.webhookDelivery.id, deliveryId), eq(tables.webhookDelivery.endpointId, endpointId))
        )
    : [];
  if (!row) throw new NotFoundError('Delivery not found');
  return row;
}

export async function findDeliveryById(db: Db, deliveryId: number): Promise<WebhookDelivery | null> {
  const [row] = await db
    .select()
    .from(tables.webhookDelivery)
    .where(eq(tables.webhookDelivery.id, deliveryId));
  return row ?? null;
}

export async function listDeliveries(
  db: Db,
  endpointId: number,
  options: { cursor?: string; limit?: number; status?: WebhookDeliveryStatus } = {}
) {
  const limit = clampLimit(options.limit);
  const cursorId = resolveCursor(options.cursor, (id) => decodeEntityId('webhookDelivery', id));
  const filters = and(
    eq(tables.webhookDelivery.endpointId, endpointId),
    options.status !== undefined ? eq(tables.webhookDelivery.status, options.status) : undefined
  );

  const [rows, [counted]] = await Promise.all([
    trace(
      'webhooks.listDeliveries',
      async () =>
        await db
          .select({ ...getTableColumns(tables.webhookDelivery), eventType: tables.webhookEvent.type })
          .from(tables.webhookDelivery)
          .innerJoin(tables.webhookEvent, eq(tables.webhookEvent.id, tables.webhookDelivery.eventId))
          .where(and(filters, cursorId !== undefined ? lt(tables.webhookDelivery.id, cursorId) : undefined))
          .orderBy(desc(tables.webhookDelivery.id))
          .limit(limit + 1)
    ),
    db.select({ total: count() }).from(tables.webhookDelivery).where(filters),
  ]);

  return {
    ...toPage(rows, limit, (id) => encodeId('webhookDelivery', id)),
    total: Number(counted?.total ?? 0),
  };
}

export async function listAttempts(db: Db, deliveryId: number): Promise<WebhookAttempt[]> {
  return await db
    .select()
    .from(tables.webhookAttempt)
    .where(eq(tables.webhookAttempt.deliveryId, deliveryId))
    .orderBy(tables.webhookAttempt.id);
}

export async function listRetryableDeliveryIds(db: Db, endpointId: number, limit: number): Promise<number[]> {
  const rows = await db
    .select({ id: tables.webhookDelivery.id })
    .from(tables.webhookDelivery)
    .where(
      and(
        eq(tables.webhookDelivery.endpointId, endpointId),
        inArray(tables.webhookDelivery.status, ['pending', 'failed'])
      )
    )
    .orderBy(desc(tables.webhookDelivery.id))
    .limit(limit);
  return rows.map((row) => row.id);
}

export async function listStaleDeliveryIds(
  db: Db,
  limit: number,
  graceMs = STALE_DELIVERY_GRACE_MS
): Promise<number[]> {
  const before = new Date(Date.now() - graceMs);
  const rows = await db
    .select({ id: tables.webhookDelivery.id })
    .from(tables.webhookDelivery)
    .innerJoin(tables.webhookEndpoint, eq(tables.webhookEndpoint.id, tables.webhookDelivery.endpointId))
    .where(
      and(
        inArray(tables.webhookDelivery.status, ['pending', 'failed']),
        isNull(tables.webhookEndpoint.disabledAt),
        isNull(tables.webhookEndpoint.deletedAt),
        or(
          lt(tables.webhookDelivery.nextAttemptAt, before),
          and(isNull(tables.webhookDelivery.nextAttemptAt), lt(tables.webhookDelivery.updatedAt, before))
        )
      )
    )
    .orderBy(tables.webhookDelivery.id)
    .limit(limit);
  return rows.map((row) => row.id);
}

export async function listUndeliveredAuditRows(
  db: Db,
  limit: number,
  lookbackMs = RECONCILE_LOOKBACK_MS
): Promise<
  Array<{ id: number; workspaceId: number; tenantId: number | null; event: string; createdAt: Date }>
> {
  const since = new Date(Date.now() - lookbackMs);
  const rows = await db
    .select({
      id: tables.event.id,
      workspaceId: tables.event.workspaceId,
      tenantId: tables.event.tenantId,
      event: tables.event.event,
      createdAt: tables.event.createdAt,
    })
    .from(tables.event)
    .where(
      and(
        gt(tables.event.createdAt, since),
        inArray(tables.event.event, [...PUBLIC_AUDIT_EVENTS]),
        notExists(
          db
            .select({ id: tables.webhookEvent.id })
            .from(tables.webhookEvent)
            .where(
              and(
                eq(tables.webhookEvent.source, 'audit'),
                eq(tables.webhookEvent.sourceId, sql`${tables.event.id}::text`)
              )
            )
        ),
        inArray(
          tables.event.workspaceId,
          db
            .select({ workspaceId: tables.webhookEndpoint.workspaceId })
            .from(tables.webhookEndpoint)
            .where(and(isNull(tables.webhookEndpoint.disabledAt), isNull(tables.webhookEndpoint.deletedAt)))
        )
      )
    )
    .orderBy(tables.event.id)
    .limit(limit);
  return rows.flatMap((row) =>
    row.workspaceId === null ? [] : [{ ...row, workspaceId: row.workspaceId, tenantId: row.tenantId ?? null }]
  );
}

export async function listReconcilableAuditIds(db: Db, limit: number): Promise<number[]> {
  const rows = await listUndeliveredAuditRows(db, limit);
  const endpointsByScope = new Map<string, WebhookEndpoint[]>();
  const ids: number[] = [];
  for (const row of rows) {
    const key = `${row.workspaceId}:${row.tenantId ?? ''}`;
    let endpoints = endpointsByScope.get(key);
    if (!endpoints) {
      endpoints = await listEnabledEndpoints(db, row.workspaceId, row.tenantId);
      endpointsByScope.set(key, endpoints);
    }
    if (
      endpoints.some(
        (endpoint) =>
          endpoint.updatedAt.getTime() - HORIZON_CLOCK_SKEW_MS <= row.createdAt.getTime() &&
          subscriptionMatches(endpoint.events, row.event)
      )
    )
      ids.push(row.id);
  }
  return ids;
}

export async function recordWebhookEvent(db: Db, input: WebhookEventInput): Promise<WebhookEvent> {
  return await trace('webhooks.recordEvent', async () =>
    db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(tables.webhookEvent)
        .values(input)
        .onConflictDoNothing({ target: [tables.webhookEvent.source, tables.webhookEvent.sourceId] })
        .returning();
      if (inserted) {
        const [stamped] = await tx
          .update(tables.webhookEvent)
          .set({ payload: { ...input.payload, id: encodeId('webhookEvent', inserted.id) } })
          .where(eq(tables.webhookEvent.id, inserted.id))
          .returning();
        return stamped!;
      }
      const [existing] = await tx
        .select()
        .from(tables.webhookEvent)
        .where(
          and(eq(tables.webhookEvent.source, input.source), eq(tables.webhookEvent.sourceId, input.sourceId))
        );
      return existing!;
    })
  );
}

export async function createDeliveries(
  db: Db,
  event: WebhookEvent,
  endpoints: WebhookEndpoint[]
): Promise<WebhookDelivery[]> {
  if (endpoints.length === 0) return [];
  await db
    .insert(tables.webhookDelivery)
    .values(
      endpoints.map((endpoint) => ({
        workspaceId: event.workspaceId,
        endpointId: endpoint.id,
        eventId: event.id,
      }))
    )
    .onConflictDoNothing();
  return await db
    .select()
    .from(tables.webhookDelivery)
    .where(
      and(
        eq(tables.webhookDelivery.eventId, event.id),
        inArray(
          tables.webhookDelivery.endpointId,
          endpoints.map((endpoint) => endpoint.id)
        ),
        eq(tables.webhookDelivery.status, 'pending'),
        eq(tables.webhookDelivery.attempts, 0)
      )
    );
}

export async function claimDeliveryAttempt(
  db: Db,
  delivery: Pick<WebhookDelivery, 'id' | 'attempts'>
): Promise<number | null> {
  const [claimed] = await db
    .update(tables.webhookDelivery)
    .set({ attempts: delivery.attempts + 1, lastAttemptAt: new Date() })
    .where(
      and(
        eq(tables.webhookDelivery.id, delivery.id),
        eq(tables.webhookDelivery.attempts, delivery.attempts),
        inArray(tables.webhookDelivery.status, ['pending', 'failed'])
      )
    )
    .returning({ attempts: tables.webhookDelivery.attempts });
  return claimed?.attempts ?? null;
}

export async function recordAttempt(db: Db, deliveryId: number, outcome: AttemptOutcome): Promise<void> {
  await db.insert(tables.webhookAttempt).values({ deliveryId, ...outcome });
}

export async function settleDelivery(db: Db, deliveryId: number, outcome: DeliveryOutcome): Promise<void> {
  await db
    .update(tables.webhookDelivery)
    .set({ ...outcome, lastAttemptAt: new Date() })
    .where(eq(tables.webhookDelivery.id, deliveryId));
}

export async function resetDelivery(db: Db, deliveryId: number): Promise<void> {
  await db
    .update(tables.webhookDelivery)
    .set({ status: 'pending', nextAttemptAt: null, lastError: null })
    .where(eq(tables.webhookDelivery.id, deliveryId));
}
