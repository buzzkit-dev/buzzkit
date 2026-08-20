import { env } from 'cloudflare:workers';
import {
  applyMessageCounters,
  type CounterDelta,
  finalizeMessageIfComplete,
} from '@buzzkit/api/api/deliveries/index';
import {
  type CredentialMemo,
  createCredentialMemo,
  type DeliveryQueueMessage,
  fanoutPage,
  processDelivery,
} from '@buzzkit/api/api/messages/index';
import { createDb } from '@buzzkit/api/libs/database';
import { log } from '@buzzkit/api/libs/logger';
import { trace } from '@buzzkit/api/libs/telemetry';
import type { Db } from '@buzzkit/database';

const DELIVERY_CONCURRENCY = 10;

const CRASH_RETRY_DELAY_SECONDS = 30;

type QueueItem = Message<DeliveryQueueMessage>;

type FanoutItem = Message<Extract<DeliveryQueueMessage, { type: 'fanout' }>>;

type DeliverItem = Message<Extract<DeliveryQueueMessage, { type: 'deliver' }>>;

type Summary = Record<'fanouts' | 'sent' | 'retrying' | 'failed' | 'invalid' | 'skipped' | 'errors', number>;

type Counters = Map<number, Record<CounterDelta, number>>;

const isFanout = (item: QueueItem): item is FanoutItem => item.body.type === 'fanout';

const isDeliver = (item: QueueItem): item is DeliverItem => item.body.type === 'deliver';

export async function handleDeliveryBatch(batch: MessageBatch<DeliveryQueueMessage>): Promise<void> {
  await trace('queue.deliveries.batch', { 'queue.batch_size': batch.messages.length }, async (t) => {
    const startedAt = Date.now();
    const db = createDb();
    const memo = createCredentialMemo();
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

    await runWithConcurrency(deliveries, DELIVERY_CONCURRENCY, (item) =>
      processDeliverJob(db, item, memo, summary, counters)
    );

    for (const [messageId, delta] of counters) {
      await applyMessageCounters(db, messageId, delta);
      await finalizeMessageIfComplete(db, messageId);
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
        await fanoutPage(db, item.body.messageId, item.body.afterId);
        summary.fanouts += 1;
        item.ack();
      } catch (error) {
        summary.errors += 1;
        t.set('error', true);
        log.error('[Deliveries] Fan-out failed', { body: item.body, error: describe(error) });
        item.retry({ delaySeconds: CRASH_RETRY_DELAY_SECONDS });
      }
    }
  );
}

async function processDeliverJob(
  db: Db,
  item: DeliverItem,
  memo: CredentialMemo,
  summary: Summary,
  counters: Counters
): Promise<void> {
  await trace(
    'queue.job.deliver',
    {
      'delivery.id': item.body.deliveryId,
      'delivery.attempt': item.body.attempt,
      'queue.message_id': item.id,
      'queue.attempt': item.attempts,
    },
    async (t) => {
      const startedAt = Date.now();
      try {
        const outcome = await processDelivery(db, item.body.deliveryId, item.body.attempt, memo);
        const application = outcome?.application ?? null;
        const result = !outcome
          ? 'skipped'
          : (application?.counterDelta ?? (application?.retryDelaySeconds ? 'retrying' : 'noop'));

        if (!outcome) {
          summary.skipped += 1;
        } else if (application?.counterDelta) {
          summary[application.counterDelta] += 1;
          bump(counters, outcome.messageId, application.counterDelta);
        } else if (application?.retryDelaySeconds) {
          summary.retrying += 1;
          await env.DELIVERIES.send(
            {
              type: 'deliver',
              deliveryId: item.body.deliveryId,
              attempt: item.body.attempt + 1,
            } satisfies DeliveryQueueMessage,
            { delaySeconds: application.retryDelaySeconds }
          );
        }

        t.set('delivery.outcome', result);
        t.set('delivery.retry_in_seconds', application?.retryDelaySeconds ?? null);
        log.info('[Deliveries] Processed', {
          deliveryId: item.body.deliveryId,
          attempt: item.body.attempt,
          outcome: result,
          retryInSeconds: application?.retryDelaySeconds ?? null,
          latencyMs: Date.now() - startedAt,
        });
        item.ack();
      } catch (error) {
        summary.errors += 1;
        t.set('error', true);
        log.error('[Deliveries] Delivery failed', { body: item.body, error: describe(error) });
        item.retry({ delaySeconds: CRASH_RETRY_DELAY_SECONDS });
      }
    }
  );
}

function bump(counters: Counters, messageId: number, delta: CounterDelta): void {
  const current = counters.get(messageId) ?? { sent: 0, failed: 0, invalid: 0 };
  current[delta] += 1;
  counters.set(messageId, current);
}

async function runWithConcurrency<T>(items: T[], limit: number, task: (item: T) => Promise<void>) {
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index++];
      if (item) await task(item);
    }
  });
  await Promise.all(workers);
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
