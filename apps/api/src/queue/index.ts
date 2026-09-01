import type { DeliveryQueueMessage } from '@buzzkit/api/api/messages/index';
import { log } from '@buzzkit/api/libs/logger';
import { handleDeliveryBatch } from './deliveries';
import { type EventsQueueMessage, handleEventsBatch, handleEventsDeadLetterBatch } from './events';
import { handleWebhookBatch, type WebhookQueueMessage } from './webhooks';

export type QueueMessage = DeliveryQueueMessage | EventsQueueMessage | WebhookQueueMessage;

function handleDeadLetterBatch(batch: MessageBatch<QueueMessage>): void {
  for (const item of batch.messages) {
    log.error('[Queue] Dead-lettered message dropped, the reconcile sweep re-enqueues live work', {
      queue: batch.queue,
      body: item.body,
      attempts: item.attempts,
    });
    item.ack();
  }
}

export async function handleQueueBatch(batch: MessageBatch<QueueMessage>): Promise<void> {
  if (batch.queue === 'buzzkit-events') {
    await handleEventsBatch(batch as MessageBatch<EventsQueueMessage>);
    return;
  }

  if (batch.queue === 'buzzkit-events-dlq') {
    await handleEventsDeadLetterBatch(batch as MessageBatch<EventsQueueMessage>);
    return;
  }

  if (batch.queue === 'buzzkit-webhooks') {
    await handleWebhookBatch(batch as MessageBatch<WebhookQueueMessage>);
    return;
  }

  if (batch.queue === 'buzzkit-deliveries') {
    await handleDeliveryBatch(batch as MessageBatch<DeliveryQueueMessage>);
    return;
  }

  if (batch.queue === 'buzzkit-deliveries-dlq' || batch.queue === 'buzzkit-webhooks-dlq') {
    handleDeadLetterBatch(batch);
    return;
  }

  throw new Error(`No consumer for queue '${batch.queue}'`);
}
