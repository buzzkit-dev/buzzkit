import {
  applyMessageCounters,
  expireOverdueDeliveries,
  finalizeMessageIfComplete,
  listDueRetries,
  listStaleUnsettled,
  listUnfinalizedMessages,
} from '@buzzkit/api/api/deliveries/index';
import { enqueueDeliveries, enqueueFanout, listStalledFanouts } from '@buzzkit/api/api/messages/index';
import type { Db } from '@buzzkit/database';
import { sweep } from './sweep';

const SWEEP_LIMIT = 1000;

const SWEEP_ROUNDS = 10;

export async function reconcileDeliveries(): Promise<void> {
  await sweep('reconcile', reconcile);
}

async function drain<T>(
  list: (db: Db, limit: number) => Promise<T[]>,
  db: Db,
  handle: (rows: T[]) => Promise<void>
) {
  let total = 0;
  for (let round = 0; round < SWEEP_ROUNDS; round++) {
    const rows = await list(db, SWEEP_LIMIT);
    if (rows.length === 0) break;
    await handle(rows);
    total += rows.length;
    if (rows.length < SWEEP_LIMIT) break;
  }
  return total;
}

async function reconcile(db: Db): Promise<Record<string, number>> {
  const dueRetries = await drain(listDueRetries, db, (rows) =>
    enqueueDeliveries(rows.map((row) => ({ deliveryId: row.id, attempt: row.attempts + 1 })))
  );
  const stale = await drain(listStaleUnsettled, db, (rows) =>
    enqueueDeliveries(rows.map((row) => ({ deliveryId: row.id, attempt: row.attempts + 1 })))
  );

  let expiredMessages = 0;
  for (let round = 0; round < SWEEP_ROUNDS; round++) {
    const expired = await expireOverdueDeliveries(db, SWEEP_LIMIT);
    if (expired.size === 0) break;
    for (const [messageId, count] of expired) {
      await applyMessageCounters(db, messageId, { sent: 0, failed: count, invalid: 0 });
      await finalizeMessageIfComplete(db, messageId);
    }
    expiredMessages += expired.size;
  }

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
