import type { DeliveryQueueMessage } from '@buzzkit/api/api/messages/index';
import { handleDeliveryBatch } from './deliveries';
import { type EventsQueueMessage, handleEventsBatch, handleEventsDeadLetterBatch } from './events';

export type QueueMessage = DeliveryQueueMessage | EventsQueueMessage;

export async function handleQueueBatch(batch: MessageBatch<QueueMessage>): Promise<void> {
  if (batch.queue === 'buzzkit-events') {
    await handleEventsBatch(batch as MessageBatch<EventsQueueMessage>);
    return;
  }

  if (batch.queue === 'buzzkit-events-dlq') {
    await handleEventsDeadLetterBatch(batch as MessageBatch<EventsQueueMessage>);
    return;
  }

  if (batch.queue === 'buzzkit-deliveries') {
    await handleDeliveryBatch(batch as MessageBatch<DeliveryQueueMessage>);
    return;
  }

  throw new Error(`No consumer for queue '${batch.queue}'`);
}
