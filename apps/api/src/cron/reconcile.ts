import {
  applyMessageCounters,
  expireOverdueDeliveries,
  finalizeMessageIfComplete,
  listDueRetries,
  listStaleUnsettled,
  listUnfinalizedMessages,
} from '@buzzkit/api/api/deliveries/index';
import { enqueueDeliveries, enqueueFanout, listStalledFanouts } from '@buzzkit/api/api/messages/index';
import { drain } from '@buzzkit/api/utils/drain';
import type { Db } from '@buzzkit/database';
import { sweep } from './sweep';

const SWEEP_LIMIT = 1000;

const SWEEP_ROUNDS = 10;

export async function reconcileDeliveries(): Promise<void> {
  await sweep('reconcile', reconcile);
}

const SWEEP_OPTIONS = { limit: SWEEP_LIMIT, rounds: SWEEP_ROUNDS };

async function reconcile(db: Db): Promise<Record<string, number>> {
  const enqueueRetries = (rows: Array<{ id: number; attempts: number }>) =>
    enqueueDeliveries(rows.map((row) => ({ deliveryId: row.id, attempt: row.attempts + 1 })));

  const dueRetries = await drain((limit) => listDueRetries(db, limit), enqueueRetries, SWEEP_OPTIONS);
  const stale = await drain((limit) => listStaleUnsettled(db, limit), enqueueRetries, SWEEP_OPTIONS);

  const expiredMessages = await drain(
    async (limit) => [...(await expireOverdueDeliveries(db, limit))],
    async (expired) => {
      for (const [messageId, count] of expired) {
        await applyMessageCounters(db, messageId, { sent: 0, failed: count, invalid: 0 });
        await finalizeMessageIfComplete(db, messageId);
      }
    },
    SWEEP_OPTIONS
  );

  const stalled = await listStalledFanouts(db, SWEEP_LIMIT);
  for (const row of stalled) {
    await enqueueFanout(row.id, row.cursor);
  }

  const unfinalized = await listUnfinalizedMessages(db, SWEEP_LIMIT);
  let healed = 0;
  for (const row of unfinalized) {
    if (await finalizeMessageIfComplete(db, row.id)) healed += 1;
  }

  return {
    dueRetries,
    stalePending: stale,
    expiredMessages,
    stalledFanouts: stalled.length,
    healedMessages: healed,
  };
}
