import { decodeEntityId } from '@buzzkit/api/libs/sqids';
import { trace } from '@buzzkit/api/libs/telemetry';
import { and, type Db, eq, inArray, sql, tables } from '@buzzkit/database';

const PROMOTABLE = ['pending', 'retrying', 'sent'] as const;

export async function recordDeliveryReceipt(
  db: Db,
  tenantId: number,
  input: { messageSqid: string; subscriberId: number; receivedAt: Date }
): Promise<boolean> {
  const messageId = decodeEntityId('message', input.messageSqid);
  if (!messageId) return false;

  return await trace('deliveries.recordReceipt', async (t) => {
    const updated = await db
      .update(tables.delivery)
      .set({ status: 'delivered', settledAt: input.receivedAt })
      .where(
        and(
          eq(tables.delivery.tenantId, tenantId),
          eq(tables.delivery.messageId, messageId),
          eq(tables.delivery.subscriberId, input.subscriberId),
          inArray(tables.delivery.status, [...PROMOTABLE])
        )
      )
      .returning({ id: tables.delivery.id });

    t.set('delivery.promoted', updated.length);
    if (updated.length === 0) return false;

    await db
      .update(tables.message)
      .set({ delivered: sql`${tables.message.delivered} + ${updated.length}` })
      .where(eq(tables.message.id, messageId));

    return true;
  });
}
