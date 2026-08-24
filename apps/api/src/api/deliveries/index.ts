import { createEventLogger } from '@buzzkit/api/api/events/index';
import { NotFoundError } from '@buzzkit/api/libs/error';
import { decodeEntityId, encodeId } from '@buzzkit/api/libs/sqids';
import { trace } from '@buzzkit/api/libs/telemetry';
import type { DeliveryErrorCode, ProviderName, ProviderSendResult } from '@buzzkit/api/providers/index';
import {
  and,
  asc,
  count,
  type Db,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  notExists,
  sql,
  tables,
} from '@buzzkit/database';
import {
  ATTEMPT_LEASE_SECONDS,
  type CounterDelta,
  decide,
  RETRY_GRACE_SECONDS,
  STALE_PENDING_MINUTES,
  UNFINALIZED_GRACE_MINUTES,
} from './policy';

export type Delivery = typeof tables.delivery.$inferSelect;
export type DeliveryAttempt = typeof tables.deliveryAttempt.$inferSelect;
export type DeliveryStatus = Delivery['status'];

export const DELIVERY_STATUSES = tables.delivery.status.enumValues;

export type { CounterDelta };

export const UNSETTLED_STATUSES: DeliveryStatus[] = ['pending', 'retrying'];

export function serializeDelivery(delivery: Delivery) {
  return {
    id: delivery.id,
    messageId: delivery.messageId,
    subscriberId: delivery.subscriberId,
    subscriptionId: delivery.subscriptionId,
    channel: delivery.channel,
    provider: delivery.provider,
    status: delivery.status,
    attempts: delivery.attempts,
    lastErrorCode: delivery.lastErrorCode,
    lastErrorMessage: delivery.lastErrorMessage,
    providerMessageId: delivery.providerMessageId,
    nextAttemptAt: delivery.nextAttemptAt,
    firstAttemptedAt: delivery.firstAttemptedAt,
    lastAttemptedAt: delivery.lastAttemptedAt,
    sentAt: delivery.sentAt,
    settledAt: delivery.settledAt,
    createdAt: delivery.createdAt,
    updatedAt: delivery.updatedAt,
  };
}

export function serializeAttempt(attempt: DeliveryAttempt) {
  return {
    id: attempt.id,
    deliveryId: attempt.deliveryId,
    attempt: attempt.attempt,
    provider: attempt.provider,
    outcome: attempt.outcome,
    errorCode: attempt.errorCode,
    providerReason: attempt.providerReason,
    providerStatus: attempt.providerStatus,
    providerMessageId: attempt.providerMessageId,
    request: attempt.request,
    response: attempt.response,
    latencyMs: attempt.latencyMs,
    nextAttemptAt: attempt.nextAttemptAt,
    startedAt: attempt.startedAt,
    finishedAt: attempt.finishedAt,
  };
}

export async function findDelivery(db: Db, tenantId: number, deliverySqid: string): Promise<Delivery> {
  const deliveryId = decodeEntityId('delivery', deliverySqid);

  if (!deliveryId) {
    throw new NotFoundError('Delivery not found');
  }

  const [delivery] = await trace(
    'deliveries.find',
    async () =>
      await db
        .select()
        .from(tables.delivery)
        .where(and(eq(tables.delivery.id, deliveryId), eq(tables.delivery.tenantId, tenantId)))
  );

  if (!delivery) {
    throw new NotFoundError('Delivery not found');
  }

  return delivery;
}

export async function listDeliveries(
  db: Db,
  messageId: number,
  options: { limit: number; beforeId?: number; status?: DeliveryStatus }
): Promise<Delivery[]> {
  return await trace(
    'deliveries.list',
    async () =>
      await db
        .select()
        .from(tables.delivery)
        .where(
          and(
            eq(tables.delivery.messageId, messageId),
            options.beforeId ? lt(tables.delivery.id, options.beforeId) : undefined,
            options.status ? eq(tables.delivery.status, options.status) : undefined
          )
        )
        .orderBy(desc(tables.delivery.id))
        .limit(options.limit + 1)
  );
}

export async function countDeliveries(db: Db, messageId: number, status?: DeliveryStatus): Promise<number> {
  const [row] = await trace(
    'deliveries.count',
    async () =>
      await db
        .select({ total: count() })
        .from(tables.delivery)
        .where(
          and(
            eq(tables.delivery.messageId, messageId),
            status ? eq(tables.delivery.status, status) : undefined
          )
        )
  );
  return Number(row?.total ?? 0);
}

type Message = typeof tables.message.$inferSelect;

export type SubscriberDeliveryRow = { delivery: Delivery; message: Message };

export function serializeSubscriberDelivery(row: SubscriberDeliveryRow) {
  const payload = row.message.payload as { title?: string; body?: string };
  return {
    ...serializeDelivery(row.delivery),
    message: {
      id: encodeId('message', row.message.id),
      channel: row.message.channel,
      topic: row.message.topic,
      title: payload.title ?? null,
      body: payload.body ?? null,
      createdAt: row.message.createdAt,
    },
  };
}

export async function listSubscriberDeliveries(
  db: Db,
  tenantId: number,
  subscriberId: number,
  options: { limit: number; beforeId?: number }
): Promise<SubscriberDeliveryRow[]> {
  return await trace(
    'deliveries.listForSubscriber',
    async () =>
      await db
        .select({ delivery: tables.delivery, message: tables.message })
        .from(tables.delivery)
        .innerJoin(tables.message, eq(tables.message.id, tables.delivery.messageId))
        .where(
          and(
            eq(tables.delivery.tenantId, tenantId),
            eq(tables.delivery.subscriberId, subscriberId),
            options.beforeId ? lt(tables.delivery.id, options.beforeId) : undefined
          )
        )
        .orderBy(desc(tables.delivery.id))
        .limit(options.limit + 1)
  );
}

export async function countSubscriberDeliveries(
  db: Db,
  tenantId: number,
  subscriberId: number
): Promise<number> {
  const [row] = await trace(
    'deliveries.countForSubscriber',
    async () =>
      await db
        .select({ total: count() })
        .from(tables.delivery)
        .where(and(eq(tables.delivery.tenantId, tenantId), eq(tables.delivery.subscriberId, subscriberId)))
  );
  return Number(row?.total ?? 0);
}

export async function listAttempts(db: Db, deliveryId: number): Promise<DeliveryAttempt[]> {
  return await trace(
    'deliveries.attempts',
    async () =>
      await db
        .select()
        .from(tables.deliveryAttempt)
        .where(eq(tables.deliveryAttempt.deliveryId, deliveryId))
        .orderBy(asc(tables.deliveryAttempt.attempt))
  );
}

export type DeliveryJob = { deliveryId: number; attempt: number };

export type AttemptOutcome = {
  deliveryId: number;
  tenantId: number;
  messageId: number;
  subscriptionId: number;
  attempt: number;
  provider: ProviderName;
  startedAt: Date;
  result: ProviderSendResult;
};

export type AttemptApplication = {
  deliveryId: number;
  messageId: number;
  subscriptionId: number;
  counterDelta: CounterDelta | null;
  retryDelaySeconds: number | null;
  invalidatedSubscription: boolean;
};

const asId = (value: unknown): number => Number(value);

export async function claimDeliveryAttempts(
  db: Db,
  jobs: DeliveryJob[],
  now = new Date()
): Promise<Set<number>> {
  if (jobs.length === 0) return new Set();
  const lease = new Date(now.getTime() + ATTEMPT_LEASE_SECONDS * 1000).toISOString();
  const values = sql.join(
    jobs.map((job) => sql`(${job.deliveryId}::bigint, ${job.attempt}::int)`),
    sql`, `
  );
  const rows = await db.execute(sql`
    update ${tables.delivery} as d
    set lease_expires_at = ${lease}::timestamptz, next_attempt_at = null, updated_at = now()
    from (values ${values}) as v(id, attempt)
    where d.id = v.id
      and d.status in ('pending', 'retrying')
      and d.attempts = v.attempt - 1
      and (d.lease_expires_at is null or d.lease_expires_at < ${now.toISOString()}::timestamptz)
    returning d.id
  `);
  return new Set([...rows].map((row) => asId(row.id)));
}

export async function applyAttemptResults(db: Db, outcomes: AttemptOutcome[]): Promise<AttemptApplication[]> {
  if (outcomes.length === 0) return [];
  return await trace('deliveries.applyAttempts', { 'deliveries.count': outcomes.length }, async () =>
    applyAttemptResultsInner(db, outcomes)
  );
}

async function applyAttemptResultsInner(db: Db, outcomes: AttemptOutcome[]): Promise<AttemptApplication[]> {
  const finishedAt = new Date();
  const decided = outcomes.map((outcome) => ({
    outcome,
    decision: decide(outcome.attempt, outcome.result, finishedAt),
  }));

  return await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(tables.deliveryAttempt)
      .values(
        decided.map(({ outcome, decision }) => ({
          tenantId: outcome.tenantId,
          deliveryId: outcome.deliveryId,
          attempt: outcome.attempt,
          provider: outcome.provider,
          outcome: decision.outcome,
          errorCode: outcome.result.ok ? null : outcome.result.code,
          providerReason: outcome.result.ok ? null : outcome.result.reason,
          providerStatus: outcome.result.response?.status ?? null,
          providerMessageId: outcome.result.ok ? outcome.result.providerMessageId : null,
          request: outcome.result.request ?? null,
          response: outcome.result.response ?? null,
          latencyMs: outcome.result.latencyMs,
          nextAttemptAt: decision.nextAttemptAt,
          startedAt: outcome.startedAt,
          finishedAt,
        }))
      )
      .onConflictDoNothing({ target: [tables.deliveryAttempt.deliveryId, tables.deliveryAttempt.attempt] })
      .returning({ deliveryId: tables.deliveryAttempt.deliveryId });
    const recorded = new Set(inserted.map((row) => row.deliveryId));
    const settling = decided.filter(({ outcome }) => recorded.has(outcome.deliveryId));
    if (settling.length === 0) return [];

    const updateValues = sql.join(
      settling.map(
        ({ outcome, decision }) => sql`(
          ${outcome.deliveryId}::bigint,
          ${decision.status}::delivery_status,
          ${outcome.attempt}::int,
          ${outcome.result.ok ? null : outcome.result.code}::text,
          ${outcome.result.ok ? null : outcome.result.reason}::text,
          ${outcome.result.ok ? outcome.result.providerMessageId : null}::text,
          ${decision.nextAttemptAt?.toISOString() ?? null}::timestamptz,
          ${outcome.startedAt.toISOString()}::timestamptz,
          ${decision.terminal}::boolean
        )`
      ),
      sql`, `
    );
    const updated = await tx.execute(sql`
      update ${tables.delivery} as d
      set status = v.status,
          attempts = v.attempt,
          last_error_code = v.error_code,
          last_error_message = v.error_message,
          provider_message_id = coalesce(v.provider_message_id, d.provider_message_id),
          next_attempt_at = v.next_attempt_at,
          lease_expires_at = null,
          first_attempted_at = coalesce(d.first_attempted_at, v.started_at),
          last_attempted_at = v.started_at,
          sent_at = case when v.status = 'sent' then ${finishedAt.toISOString()}::timestamptz else d.sent_at end,
          settled_at = case when v.terminal then ${finishedAt.toISOString()}::timestamptz else null end,
          updated_at = now()
      from (values ${updateValues}) as v(id, status, attempt, error_code, error_message, provider_message_id, next_attempt_at, started_at, terminal)
      where d.id = v.id and d.status in ('pending', 'retrying')
      returning d.id
    `);
    const applied = new Set([...updated].map((row) => asId(row.id)));

    const invalidating = settling.filter(
      ({ outcome, decision }) => decision.invalidatesSubscription && applied.has(outcome.deliveryId)
    );
    const invalidated = new Set<number>();
    if (invalidating.length > 0) {
      const invalidateValues = sql.join(
        invalidating.map(
          ({ outcome }) =>
            sql`(${outcome.subscriptionId}::bigint, ${outcome.result.ok ? null : outcome.result.reason}::text)`
        ),
        sql`, `
      );
      const rows = await tx.execute(sql`
        update ${tables.subscription} as s
        set status = 'invalid', invalidated_at = now(), invalidation_reason = v.reason, updated_at = now()
        from (values ${invalidateValues}) as v(id, reason)
        where s.id = v.id and s.status = 'active'
        returning s.id
      `);
      for (const row of rows) invalidated.add(asId(row.id));
    }

    return settling
      .filter(({ outcome }) => applied.has(outcome.deliveryId))
      .map(({ outcome, decision }) => ({
        deliveryId: outcome.deliveryId,
        messageId: outcome.messageId,
        subscriptionId: outcome.subscriptionId,
        counterDelta: decision.counterDelta,
        retryDelaySeconds: decision.status === 'retrying' ? backoffSecondsFrom(decision.nextAttemptAt) : null,
        invalidatedSubscription: invalidated.has(outcome.subscriptionId),
      }));
  });
}

function backoffSecondsFrom(nextAttemptAt: Date | null): number {
  if (!nextAttemptAt) return 0;
  return Math.max(1, Math.ceil((nextAttemptAt.getTime() - Date.now()) / 1000));
}

export async function failDeliveriesImmediately(
  db: Db,
  deliveryIds: number[],
  code: DeliveryErrorCode,
  reason: string
): Promise<number> {
  if (deliveryIds.length === 0) return 0;
  const now = new Date();
  const updated = await db
    .update(tables.delivery)
    .set({ status: 'failed', lastErrorCode: code, lastErrorMessage: reason, settledAt: now })
    .where(and(inArray(tables.delivery.id, deliveryIds), inArray(tables.delivery.status, UNSETTLED_STATUSES)))
    .returning({ id: tables.delivery.id });
  return updated.length;
}

export async function applyMessageCounters(
  db: Db,
  messageId: number,
  delta: Record<CounterDelta, number>
): Promise<void> {
  if (delta.sent === 0 && delta.failed === 0 && delta.invalid === 0) return;
  await db
    .update(tables.message)
    .set({
      sent: sql`${tables.message.sent} + ${delta.sent}`,
      failed: sql`${tables.message.failed} + ${delta.failed}`,
      invalid: sql`${tables.message.invalid} + ${delta.invalid}`,
    })
    .where(eq(tables.message.id, messageId));
}

export async function finalizeMessageIfComplete(db: Db, messageId: number): Promise<boolean> {
  const [message] = await db
    .select({ status: tables.message.status, fanoutCompletedAt: tables.message.fanoutCompletedAt })
    .from(tables.message)
    .where(eq(tables.message.id, messageId));
  if (!message || message.status === 'completed' || !message.fanoutCompletedAt) return false;

  const [unsettled] = await db
    .select({ id: tables.delivery.id })
    .from(tables.delivery)
    .where(and(eq(tables.delivery.messageId, messageId), inArray(tables.delivery.status, UNSETTLED_STATUSES)))
    .limit(1);
  if (unsettled) return false;

  const [counts] = await db
    .select({
      total: sql<number>`count(*)::int`,
      sent: sql<number>`count(*) filter (where ${tables.delivery.status} in ('sent', 'delivered', 'bounced'))::int`,
      delivered: sql<number>`count(*) filter (where ${tables.delivery.status} = 'delivered')::int`,
      bounced: sql<number>`count(*) filter (where ${tables.delivery.status} = 'bounced')::int`,
      failed: sql<number>`count(*) filter (where ${tables.delivery.status} = 'failed')::int`,
      invalid: sql<number>`count(*) filter (where ${tables.delivery.status} = 'invalid')::int`,
    })
    .from(tables.delivery)
    .where(eq(tables.delivery.messageId, messageId));

  const [completed] = await db
    .update(tables.message)
    .set({ status: 'completed', completedAt: new Date(), ...counts! })
    .where(
      and(
        eq(tables.message.id, messageId),
        sql`${tables.message.status} <> 'completed'`,
        isNotNull(tables.message.fanoutCompletedAt)
      )
    )
    .returning();

  if (!completed) return false;

  await systemEvent(
    db,
    completed.tenantId
  )({
    event: 'message.completed',
    tenantId: completed.tenantId,
    target: { type: 'message', id: completed.id },
    data: {
      total: completed.total,
      sent: completed.sent,
      failed: completed.failed,
      invalid: completed.invalid,
    },
  });

  return true;
}

export async function listUnfinalizedMessages(db: Db, limit: number): Promise<Array<{ id: number }>> {
  const cutoff = new Date(Date.now() - UNFINALIZED_GRACE_MINUTES * 60 * 1000);
  return await db
    .select({ id: tables.message.id })
    .from(tables.message)
    .where(
      and(
        eq(tables.message.status, 'processing'),
        isNotNull(tables.message.fanoutCompletedAt),
        lt(tables.message.updatedAt, cutoff),
        notExists(
          db
            .select({ id: tables.delivery.id })
            .from(tables.delivery)
            .where(
              and(
                eq(tables.delivery.messageId, tables.message.id),
                inArray(tables.delivery.status, UNSETTLED_STATUSES)
              )
            )
        )
      )
    )
    .orderBy(asc(tables.message.updatedAt))
    .limit(limit);
}

export function systemEvent(db: Db, tenantId: number) {
  return async (entry: Parameters<ReturnType<typeof createEventLogger>>[0]) => {
    const [tenant] = await db
      .select({ workspaceId: tables.tenant.workspaceId })
      .from(tables.tenant)
      .where(eq(tables.tenant.id, tenantId));
    await createEventLogger(db, { type: 'system' }, null, tenant?.workspaceId ?? null)(entry);
  };
}

export async function listDueRetries(
  db: Db,
  limit: number
): Promise<Array<{ id: number; attempts: number }>> {
  const cutoff = new Date(Date.now() - RETRY_GRACE_SECONDS * 1000);
  return await db
    .select({ id: tables.delivery.id, attempts: tables.delivery.attempts })
    .from(tables.delivery)
    .where(and(eq(tables.delivery.status, 'retrying'), lte(tables.delivery.nextAttemptAt, cutoff)))
    .orderBy(asc(tables.delivery.nextAttemptAt))
    .limit(limit);
}

export async function listStaleUnsettled(
  db: Db,
  limit: number
): Promise<Array<{ id: number; attempts: number }>> {
  const cutoff = new Date(Date.now() - STALE_PENDING_MINUTES * 60 * 1000);
  return await db
    .select({ id: tables.delivery.id, attempts: tables.delivery.attempts })
    .from(tables.delivery)
    .where(
      and(
        inArray(tables.delivery.status, UNSETTLED_STATUSES),
        isNull(tables.delivery.nextAttemptAt),
        sql`coalesce(${tables.delivery.leaseExpiresAt}, ${tables.delivery.createdAt}) < ${cutoff.toISOString()}::timestamptz`
      )
    )
    .orderBy(sql`coalesce(${tables.delivery.leaseExpiresAt}, ${tables.delivery.createdAt})`)
    .limit(limit);
}

export async function expireOverdueDeliveries(db: Db, limit: number): Promise<Map<number, number>> {
  const now = new Date();
  const overdue = await db
    .select({ id: tables.delivery.id, messageId: tables.delivery.messageId })
    .from(tables.delivery)
    .innerJoin(tables.message, eq(tables.message.id, tables.delivery.messageId))
    .where(
      and(
        inArray(tables.delivery.status, UNSETTLED_STATUSES),
        ne(tables.message.status, 'completed'),
        lt(tables.message.expiresAt, now)
      )
    )
    .limit(limit);

  const failed = await failDeliveriesImmediately(
    db,
    overdue.map((row) => row.id),
    'expired',
    'Message expired before delivery'
  );

  const perMessage = new Map<number, number>();
  if (failed > 0) {
    for (const row of overdue) {
      perMessage.set(row.messageId, (perMessage.get(row.messageId) ?? 0) + 1);
    }
  }
  return perMessage;
}
