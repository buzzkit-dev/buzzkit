import { countRows } from '@buzzkit/api/libs/database';
import { NotFoundError } from '@buzzkit/api/libs/error';
import { decodeEntityId, encodeId } from '@buzzkit/api/libs/sqids';
import { trace } from '@buzzkit/api/libs/telemetry';
import { clampLimit, type Page, resolveCursor, toPage } from '@buzzkit/api/utils/pagination';
import { and, asc, type Db, desc, eq, lt, tables } from '@buzzkit/database';
import { serializeMessageDelivery, serializeSubscriberDelivery } from './serialize';
import type { Delivery, DeliveryAttempt, DeliveryStatus } from './types';

export * from './attempts';
export * from './constants';
export type { CounterDelta } from './policy';
export * from './receipts';
export * from './serialize';
export type * from './types';

export async function findDelivery(db: Db, tenantId: number, deliverySqid: string): Promise<Delivery> {
  const deliveryId = decodeEntityId('delivery', deliverySqid);
  if (!deliveryId) {
    throw new NotFoundError('Delivery not found');
  }

  const [delivery] = await trace('deliveries.find', async () => {
    return await db
      .select()
      .from(tables.delivery)
      .where(and(eq(tables.delivery.id, deliveryId), eq(tables.delivery.tenantId, tenantId)));
  });

  if (!delivery) {
    throw new NotFoundError('Delivery not found');
  }
  return delivery;
}

export async function listDeliveries(
  db: Db,
  messageId: number,
  options: { cursor?: string; limit?: number; status?: DeliveryStatus } = {}
): Promise<Page<ReturnType<typeof serializeMessageDelivery>> & { total: number }> {
  const limit = clampLimit(options.limit);
  const beforeId = resolveCursor(options.cursor, (id) => decodeEntityId('delivery', id));

  const [rows, total] = await Promise.all([
    trace('deliveries.list', async () => {
      return await db
        .select({
          delivery: tables.delivery,
          externalId: tables.subscriber.externalId,
          platform: tables.subscription.platform,
          endpoint: tables.subscription.endpoint,
        })
        .from(tables.delivery)
        .innerJoin(tables.subscriber, eq(tables.subscriber.id, tables.delivery.subscriberId))
        .leftJoin(tables.subscription, eq(tables.subscription.id, tables.delivery.subscriptionId))
        .where(
          and(
            eq(tables.delivery.messageId, messageId),
            beforeId !== undefined ? lt(tables.delivery.id, beforeId) : undefined,
            options.status ? eq(tables.delivery.status, options.status) : undefined
          )
        )
        .orderBy(desc(tables.delivery.id))
        .limit(limit + 1);
    }),
    countDeliveries(db, messageId, options.status),
  ]);

  const items = rows.map((row) => {
    return { ...serializeMessageDelivery(row), id: row.delivery.id };
  });

  return { ...toPage(items, limit, (id) => encodeId('delivery', id)), total };
}

export async function countDeliveries(db: Db, messageId: number, status?: DeliveryStatus): Promise<number> {
  return await trace('deliveries.count', async () => {
    return await countRows(
      db,
      tables.delivery,
      and(eq(tables.delivery.messageId, messageId), status ? eq(tables.delivery.status, status) : undefined)
    );
  });
}

export async function listSubscriberDeliveries(
  db: Db,
  tenantId: number,
  subscriberId: number,
  options: { cursor?: string; limit?: number } = {}
): Promise<Page<ReturnType<typeof serializeSubscriberDelivery>> & { total: number }> {
  const limit = clampLimit(options.limit);
  const beforeId = resolveCursor(options.cursor, (id) => decodeEntityId('delivery', id));

  const [rows, total] = await Promise.all([
    trace('deliveries.listForSubscriber', async () => {
      return await db
        .select({ delivery: tables.delivery, message: tables.message })
        .from(tables.delivery)
        .innerJoin(tables.message, eq(tables.message.id, tables.delivery.messageId))
        .where(
          and(
            eq(tables.delivery.tenantId, tenantId),
            eq(tables.delivery.subscriberId, subscriberId),
            beforeId !== undefined ? lt(tables.delivery.id, beforeId) : undefined
          )
        )
        .orderBy(desc(tables.delivery.id))
        .limit(limit + 1);
    }),
    countSubscriberDeliveries(db, tenantId, subscriberId),
  ]);

  const items = rows.map((row) => {
    return { ...serializeSubscriberDelivery(row), id: row.delivery.id };
  });

  return { ...toPage(items, limit, (id) => encodeId('delivery', id)), total };
}

export async function countSubscriberDeliveries(
  db: Db,
  tenantId: number,
  subscriberId: number
): Promise<number> {
  return await trace('deliveries.countForSubscriber', async () => {
    return await countRows(
      db,
      tables.delivery,
      and(eq(tables.delivery.tenantId, tenantId), eq(tables.delivery.subscriberId, subscriberId))
    );
  });
}

export async function listAttempts(db: Db, deliveryId: number): Promise<DeliveryAttempt[]> {
  return await trace('deliveries.attempts', async () => {
    return await db
      .select()
      .from(tables.deliveryAttempt)
      .where(eq(tables.deliveryAttempt.deliveryId, deliveryId))
      .orderBy(asc(tables.deliveryAttempt.attempt));
  });
}
