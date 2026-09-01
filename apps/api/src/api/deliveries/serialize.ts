import { encodeId } from '@buzzkit/api/libs/sqids';
import type { Delivery, DeliveryAttempt, MessageDeliveryRow, SubscriberDeliveryRow } from './types';

export function serializeDelivery(delivery: Delivery) {
  return {
    id: delivery.id,
    messageId: delivery.messageId,
    subscriberId: delivery.subscriberId,
    subscriptionId: delivery.subscriptionId,
    channel: delivery.channel,
    provider: delivery.provider,
    status: delivery.status,
    attempts: delivery.attempts,
    lastErrorCode: delivery.lastErrorCode,
    lastErrorMessage: delivery.lastErrorMessage,
    providerMessageId: delivery.providerMessageId,
    nextAttemptAt: delivery.nextAttemptAt,
    firstAttemptedAt: delivery.firstAttemptedAt,
    lastAttemptedAt: delivery.lastAttemptedAt,
    sentAt: delivery.sentAt,
    settledAt: delivery.settledAt,
    createdAt: delivery.createdAt,
    updatedAt: delivery.updatedAt,
  };
}

export function serializeAttempt(attempt: DeliveryAttempt) {
  return {
    id: attempt.id,
    deliveryId: attempt.deliveryId,
    attempt: attempt.attempt,
    provider: attempt.provider,
    outcome: attempt.outcome,
    errorCode: attempt.errorCode,
    providerReason: attempt.providerReason,
    providerStatus: attempt.providerStatus,
    providerMessageId: attempt.providerMessageId,
    request: attempt.request,
    response: attempt.response,
    latencyMs: attempt.latencyMs,
    nextAttemptAt: attempt.nextAttemptAt,
    startedAt: attempt.startedAt,
    finishedAt: attempt.finishedAt,
  };
}

export function serializeMessageDelivery(row: MessageDeliveryRow) {
  return {
    ...serializeDelivery(row.delivery),
    externalId: row.externalId,
    platform: row.platform,
    endpoint: row.endpoint,
  };
}

export function serializeSubscriberDelivery(row: SubscriberDeliveryRow) {
  const payload = row.message.payload as { title?: string; body?: string };

  return {
    ...serializeDelivery(row.delivery),
    message: {
      id: encodeId('message', row.message.id),
      channel: row.message.channel,
      topic: row.message.topic,
      title: payload.title ?? null,
      body: payload.body ?? null,
      createdAt: row.message.createdAt,
    },
  };
}
