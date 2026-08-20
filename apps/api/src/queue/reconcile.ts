import {
  applyMessageCounters,
  expireOverdueDeliveries,
  finalizeMessageIfComplete,
  findDueRetries,
  findStaleUnsettled,
  findUnfinalizedMessages,
} from '@buzzkit/api/api/deliveries/index';
import { STALLED_FANOUT_MINUTES } from '@buzzkit/api/api/deliveries/policy';
import { type DeliveryQueueMessage, enqueueDeliveries, enqueueFanout } from '@buzzkit/api/api/messages/index';
import { createDb } from '@buzzkit/api/libs/database';
import { log } from '@buzzkit/api/libs/logger';
import { type Span, trace } from '@buzzkit/api/libs/telemetry';
import { and, eq, isNull, lt, tables } from '@buzzkit/database';

const SWEEP_LIMIT = 1000;

export async function reconcileDeliveries(): Promise<void> {
  await trace('scheduler.reconcile', async (t) => reconcileDeliveriesInner(t));
}

async function reconcileDeliveriesInner(t: Span): Promise<void> {
  const db = createDb();

  const due = await findDueRetries(db, SWEEP_LIMIT);
  const stale = await findStaleUnsettled(db, SWEEP_LIMIT);
  await enqueueDeliveries(
    [...due, ...stale].map((row) => ({ deliveryId: row.id, attempt: row.attempts + 1 }))
  );

  const expired = await expireOverdueDeliveries(db, SWEEP_LIMIT);
  for (const [messageId, count] of expired) {
    await applyMessageCounters(db, messageId, { sent: 0, failed: count, invalid: 0 });
    await finalizeMessageIfComplete(db, messageId);
  }

  const stalledCutoff = new Date(Date.now() - STALLED_FANOUT_MINUTES * 60 * 1000);
  const stalled = await db
    .select({ id: tables.message.id, cursor: tables.message.fanoutCursor })
    .from(tables.message)
    .where(
      and(
        eq(tables.message.status, 'processing'),
        isNull(tables.message.fanoutCompletedAt),
        lt(tables.message.updatedAt, stalledCutoff)
      )
    )
    .limit(SWEEP_LIMIT);
  for (const row of stalled) {
    await enqueueFanout(row.id, row.cursor);
  }

  const unfinalized = await findUnfinalizedMessages(db, SWEEP_LIMIT);
  let healed = 0;
  for (const row of unfinalized) {
    if (await finalizeMessageIfComplete(db, row.id)) healed += 1;
  }

  t.set('reconcile.due_retries', due.length);
  t.set('reconcile.stale_pending', stale.length);
  t.set('reconcile.expired_messages', expired.size);
  t.set('reconcile.stalled_fanouts', stalled.length);
  t.set('reconcile.healed_messages', healed);

  log.info('[Reconcile] sweep', {
    dueRetries: due.length,
    stalePending: stale.length,
    expiredMessages: expired.size,
    stalledFanouts: stalled.length,
    healedMessages: healed,
  });
}

export type { DeliveryQueueMessage };
