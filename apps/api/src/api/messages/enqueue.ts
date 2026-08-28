import { env } from 'cloudflare:workers';
import type { DeliveryJob } from '@buzzkit/api/api/deliveries/index';
import { QUEUE_BATCH_SIZE } from './constants';
import type { DeliveryQueueMessage } from './types';

export async function enqueueFanout(
  messageId: number,
  afterId = 0,
  batch: { zones?: string[]; final?: boolean } = {}
): Promise<void> {
  await env.DELIVERIES.send({ type: 'fanout', messageId, afterId, ...batch } satisfies DeliveryQueueMessage);
}

export async function enqueueDeliveries(jobs: Array<DeliveryJob & { delaySeconds?: number }>): Promise<void> {
  for (let i = 0; i < jobs.length; i += QUEUE_BATCH_SIZE) {
    const batch = jobs.slice(i, i + QUEUE_BATCH_SIZE);
    await env.DELIVERIES.sendBatch(
      batch.map(({ delaySeconds, ...job }) => ({
        body: { type: 'deliver', ...job } satisfies DeliveryQueueMessage,
        ...(delaySeconds ? { delaySeconds } : {}),
      }))
    );
  }
}
