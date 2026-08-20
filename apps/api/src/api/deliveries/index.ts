import { createEventLogger } from '@buzzkit/api/api/events/index';
import { BadRequestError, NotFoundError } from '@buzzkit/api/libs/error';
import { decodeEntityId } from '@buzzkit/api/libs/sqids';
import { trace } from '@buzzkit/api/libs/telemetry';
import type { DeliveryErrorCode, ProviderName, ProviderSendResult } from '@buzzkit/api/providers/index';
import { and, asc, type Db, eq, inArray, isNull, lt, lte, sql, tables } from '@buzzkit/database';
import {
  backoffSeconds,
  ERROR_POLICY,
  MAX_DELIVERY_ATTEMPTS,
  RETRY_GRACE_SECONDS,
  STALE_PENDING_MINUTES,
} from './policy';

export type Delivery = typeof tables.delivery.$inferSelect;
export type DeliveryAttempt = typeof tables.deliveryAttempt.$inferSelect;
export type DeliveryStatus = Delivery['status'];

export const DELIVERY_STATUSES = tables.delivery.status.enumValues;

export type CounterDelta = 'sent' | 'failed' | 'invalid';

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
    throw new BadRequestError('Invalid delivery identifier');
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
  options: { limit: number; afterId?: number; status?: DeliveryStatus }
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
            options.afterId ? sql`${tables.delivery.id} > ${options.afterId}` : undefined,
            options.status ? eq(tables.delivery.status, options.status) : undefined
          )
        )
        .orderBy(asc(tables.delivery.id))
        .limit(options.limit + 1)
  );
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

export type AttemptContext = {
  delivery: Delivery;
  provider: ProviderName;
  startedAt: Date;
};

export type AttemptApplication = {
  counterDelta: CounterDelta | null;
  retryDelaySeconds: number | null;
  invalidatedSubscriptionId: number | null;
};

export async function applyAttemptResult(
  db: Db,
  context: AttemptContext,
  result: ProviderSendResult
): Promise<AttemptApplication | null> {
  return await trace('deliveries.applyAttempt', async (t) => {
    t.set('delivery.id', context.delivery.id);
    t.set('delivery.ok', result.ok);
    if (!result.ok) t.set('delivery.errorCode', result.code);
    return applyAttemptResultInner(db, context, result);
  });
}

async function applyAttemptResultInner(
  db: Db,
  context: AttemptContext,
  result: ProviderSendResult
): Promise<AttemptApplication | null> {
  const { delivery, provider, startedAt } = context;
  const attempt = delivery.attempts + 1;
  const finishedAt = new Date();

  const decision = decide(attempt, result);

  const inserted = await db
    .insert(tables.deliveryAttempt)
    .values({
      tenantId: delivery.tenantId,
      deliveryId: delivery.id,
      attempt,
      provider,
      outcome: decision.outcome,
      errorCode: result.ok ? null : result.code,
      providerReason: result.ok ? null : result.reason,
      providerStatus: result.response?.status ?? null,
      providerMessageId: result.ok ? result.providerMessageId : null,
      request: result.request ?? null,
      response: result.response ?? null,
      latencyMs: result.latencyMs,
      nextAttemptAt: decision.nextAttemptAt,
      startedAt,
      finishedAt,
    })
    .onConflictDoNothing({ target: [tables.deliveryAttempt.deliveryId, tables.deliveryAttempt.attempt] })
    .returning({ id: tables.deliveryAttempt.id });

  if (inserted.length === 0) return null;

  const [updated] = await db
    .update(tables.delivery)
    .set({
      status: decision.status,
      attempts: attempt,
      lastErrorCode: result.ok ? null : result.code,
      lastErrorMessage: result.ok ? null : result.reason,
      providerMessageId: result.ok ? result.providerMessageId : delivery.providerMessageId,
      nextAttemptAt: decision.nextAttemptAt,
      firstAttemptedAt: delivery.firstAttemptedAt ?? startedAt,
      lastAttemptedAt: startedAt,
      sentAt: decision.status === 'sent' ? finishedAt : delivery.sentAt,
      settledAt: decision.terminal ? finishedAt : null,
    })
    .where(and(eq(tables.delivery.id, delivery.id), inArray(tables.delivery.status, ['pending', 'retrying'])))
    .returning({ id: tables.delivery.id });

  if (!updated) return null;

  let invalidatedSubscriptionId: number | null = null;
  if (decision.invalidatesSubscription) {
    const [subscription] = await db
      .update(tables.subscription)
      .set({
        status: 'invalid',
        invalidatedAt: finishedAt,
        invalidationReason: result.ok ? null : result.reason,
      })
      .where(
        and(eq(tables.subscription.id, delivery.subscriptionId), eq(tables.subscription.status, 'active'))
      )
      .returning({ id: tables.subscription.id });
    invalidatedSubscriptionId = subscription?.id ?? null;
  }

  return {
    counterDelta: decision.counterDelta,
    retryDelaySeconds: decision.status === 'retrying' ? backoffSecondsFrom(decision.nextAttemptAt) : null,
    invalidatedSubscriptionId,
  };
}

type Decision = {
  status: DeliveryStatus;
  outcome: DeliveryAttempt['outcome'];
  terminal: boolean;
  counterDelta: CounterDelta | null;
  invalidatesSubscription: boolean;
  nextAttemptAt: Date | null;
};

function decide(attempt: number, result: ProviderSendResult): Decision {
  if (result.ok) {
    return {
      status: 'sent',
      outcome: 'sent',
      terminal: true,
      counterDelta: 'sent',
      invalidatesSubscription: false,
      nextAttemptAt: null,
    };
  }

  const policy = ERROR_POLICY[result.code];

  if (policy.invalidatesSubscription) {
    return {
      status: 'invalid',
      outcome: 'invalid',
      terminal: true,
      counterDelta: 'invalid',
      invalidatesSubscription: true,
      nextAttemptAt: null,
    };
  }

  if (policy.retryable && attempt < MAX_DELIVERY_ATTEMPTS) {
    const delay = backoffSeconds(attempt, result.retryAfterSeconds);
    return {
      status: 'retrying',
      outcome: 'retry',
      terminal: false,
      counterDelta: null,
      invalidatesSubscription: false,
      nextAttemptAt: new Date(Date.now() + delay * 1000),
    };
  }

  return {
    status: 'failed',
    outcome: 'failed',
    terminal: true,
    counterDelta: 'failed',
    invalidatesSubscription: false,
    nextAttemptAt: null,
  };
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
    .where(
      and(inArray(tables.delivery.id, deliveryIds), inArray(tables.delivery.status, ['pending', 'retrying']))
    )
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
  const [completed] = await db
    .update(tables.message)
    .set({ status: 'completed', completedAt: new Date() })
    .where(
      and(
        eq(tables.message.id, messageId),
        sql`${tables.message.status} <> 'completed'`,
        sql`${tables.message.fanoutCompletedAt} is not null`,
        sql`${tables.message.sent} + ${tables.message.failed} + ${tables.message.invalid} >= ${tables.message.total}`
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

export function systemEvent(db: Db, tenantId: number) {
  return async (entry: Parameters<ReturnType<typeof createEventLogger>>[0]) => {
    const [tenant] = await db
      .select({ workspaceId: tables.tenant.workspaceId })
      .from(tables.tenant)
      .where(eq(tables.tenant.id, tenantId));
    await createEventLogger(db, { type: 'system' }, null, tenant?.workspaceId ?? null)(entry);
  };
}

export async function findDueRetries(
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

export async function findStalePending(
  db: Db,
  limit: number
): Promise<Array<{ id: number; attempts: number }>> {
  const cutoff = new Date(Date.now() - STALE_PENDING_MINUTES * 60 * 1000);
  return await db
    .select({ id: tables.delivery.id, attempts: tables.delivery.attempts })
    .from(tables.delivery)
    .where(
      and(
        eq(tables.delivery.status, 'pending'),
        lt(tables.delivery.createdAt, cutoff),
        isNull(tables.delivery.nextAttemptAt)
      )
    )
    .orderBy(asc(tables.delivery.id))
    .limit(limit);
}

export async function expireOverdueDeliveries(db: Db, limit: number): Promise<Map<number, number>> {
  const now = new Date();
  const overdue = await db
    .select({ id: tables.delivery.id, messageId: tables.delivery.messageId })
    .from(tables.delivery)
    .innerJoin(tables.message, eq(tables.message.id, tables.delivery.messageId))
    .where(and(inArray(tables.delivery.status, ['pending', 'retrying']), lt(tables.message.expiresAt, now)))
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
