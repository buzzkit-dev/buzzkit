import {
  applyMessageCounters,
  type CounterDelta,
  finalizeMessageIfComplete,
} from '@buzzkit/api/api/deliveries/index';
import {
  createCredentialMemo,
  type DeliveryQueueMessage,
  enqueueDeliveries,
  fanoutPage,
  processDeliveryBatch,
} from '@buzzkit/api/api/messages/index';
import { describeError } from '@buzzkit/api/libs/error';
import { log } from '@buzzkit/api/libs/logger';
import { trace } from '@buzzkit/api/libs/telemetry';
import { createTokenMemo } from '@buzzkit/api/providers/shared/cache';
import { CRASH_RETRY_DELAY_SECONDS, consume } from '@buzzkit/api/queue/consume';
import type { Db } from '@buzzkit/database';

type QueueItem = Message<DeliveryQueueMessage>;

type FanoutItem = Message<Extract<DeliveryQueueMessage, { type: 'fanout' }>>;

type DeliverItem = Message<Extract<DeliveryQueueMessage, { type: 'deliver' }>>;

type Summary = Record<'fanouts' | 'sent' | 'retrying' | 'failed' | 'invalid' | 'skipped' | 'errors', number>;

type Counters = Map<number, Record<CounterDelta, number>>;

const isFanout = (item: QueueItem): item is FanoutItem => item.body.type === 'fanout';

const isDeliver = (item: QueueItem): item is DeliverItem => item.body.type === 'deliver';

export async function handleDeliveryBatch(batch: MessageBatch<DeliveryQueueMessage>): Promise<void> {
  await consume('deliveries.batch', batch, async (db, t) => {
    const startedAt = Date.now();
    const summary: Summary = {
      fanouts: 0,
      sent: 0,
      retrying: 0,
      failed: 0,
      invalid: 0,
      skipped: 0,
      errors: 0,
    };
    const counters: Counters = new Map();

    const fanouts = batch.messages.filter(isFanout);
    const deliveries = batch.messages.filter(isDeliver);
    t.set('queue.fanouts', fanouts.length);
    t.set('queue.deliveries', deliveries.length);

    for (const item of fanouts) {
      await processFanoutJob(db, item, summary);
    }

    if (deliveries.length > 0) {
      await processDeliverJobs(db, deliveries, summary, counters);
    }

    for (const [messageId, delta] of counters) {
      try {
        await applyMessageCounters(db, messageId, delta);
        await finalizeMessageIfComplete(db, messageId);
      } catch (error) {
        summary.errors += 1;
        log.error('[Deliveries] Counter update failed', { messageId, error: describeError(error) });
      }
    }

    for (const [key, value] of Object.entries(summary)) {
      t.set(`queue.${key}`, value);
    }

    log.info('[Deliveries] Batch', {
      ...summary,
      messagesTouched: counters.size,
      latencyMs: Date.now() - startedAt,
    });
  });
}

async function processFanoutJob(db: Db, item: FanoutItem, summary: Summary): Promise<void> {
  await trace(
    'queue.job.fanout',
    {
      'message.id': item.body.messageId,
      'fanout.after_id': item.body.afterId,
      'queue.message_id': item.id,
      'queue.attempt': item.attempts,
    },
    async (t) => {
      try {
        await fanoutPage(db, item.body.messageId, item.body.afterId, {
          zones: item.body.zones,
          final: item.body.final,
        });
        summary.fanouts += 1;
        item.ack();
      } catch (error) {
        summary.errors += 1;
        t.set('error', true);
        log.error('[Deliveries] Fan-out failed', { body: item.body, error: describeError(error) });
        item.retry({ delaySeconds: CRASH_RETRY_DELAY_SECONDS });
      }
    }
  );
}

async function processDeliverJobs(
  db: Db,
  items: DeliverItem[],
  summary: Summary,
  counters: Counters
): Promise<void> {
  const byDelivery = new Map(items.map((item) => [item.body.deliveryId, item]));
  try {
    const processed = await processDeliveryBatch(
      db,
      items.map((item) => item.body),
      createCredentialMemo(),
      createTokenMemo()
    );
    const retries = processed
      .filter((entry) => entry.retryDelaySeconds !== null)
      .map((entry) => {
        return {
          deliveryId: entry.job.deliveryId,
          attempt: entry.job.attempt + 1,
          delaySeconds: entry.retryDelaySeconds ?? undefined,
        };
      });
    await enqueueDeliveries(retries);

    for (const entry of processed) {
      summary[entry.outcome] += 1;
      if (
        entry.messageId !== null &&
        (entry.outcome === 'sent' || entry.outcome === 'failed' || entry.outcome === 'invalid')
      ) {
        bump(counters, entry.messageId, entry.outcome);
      }
      log.debug('[Deliveries] Processed', {
        deliveryId: entry.job.deliveryId,
        attempt: entry.job.attempt,
        outcome: entry.outcome,
        retryInSeconds: entry.retryDelaySeconds,
      });
      byDelivery.get(entry.job.deliveryId)?.ack();
    }
  } catch (error) {
    summary.errors += items.length;
    log.error('[Deliveries] Delivery batch failed', { count: items.length, error: describeError(error) });
    for (const item of items) item.retry({ delaySeconds: CRASH_RETRY_DELAY_SECONDS });
  }
}

function bump(counters: Counters, messageId: number, delta: CounterDelta): void {
  const current = counters.get(messageId) ?? { sent: 0, failed: 0, invalid: 0 };
  current[delta] += 1;
  counters.set(messageId, current);
}
