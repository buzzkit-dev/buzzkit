import { encodeId } from '@buzzkit/api/libs/sqids';
import type { WebhookAttempt, WebhookDelivery, WebhookEndpoint, WebhookEvent } from './types';

export function secretOverlapActive(
  endpoint: Pick<WebhookEndpoint, 'previousSecret' | 'previousSecretExpiresAt'>
): boolean {
  return (
    endpoint.previousSecret !== null &&
    endpoint.previousSecretExpiresAt !== null &&
    endpoint.previousSecretExpiresAt.getTime() > Date.now()
  );
}

export function signingSecrets(endpoint: WebhookEndpoint): string[] {
  return secretOverlapActive(endpoint) ? [endpoint.secret, endpoint.previousSecret!] : [endpoint.secret];
}

export function serializeEndpoint(
  endpoint: WebhookEndpoint,
  options: { secret: boolean } = { secret: false }
) {
  return {
    id: encodeId('webhook', endpoint.id),
    tenantId: endpoint.tenantId === null ? null : encodeId('tenant', endpoint.tenantId),
    url: endpoint.url,
    description: endpoint.description,
    events: endpoint.events,
    enabled: endpoint.disabledAt === null,
    disabledAt: endpoint.disabledAt,
    disabledReason: endpoint.disabledReason,
    failingSince: endpoint.failingSince,
    ...(options.secret
      ? {
          secret: endpoint.secret,
          previousSecret: secretOverlapActive(endpoint) ? endpoint.previousSecret : null,
          previousSecretExpiresAt: secretOverlapActive(endpoint) ? endpoint.previousSecretExpiresAt : null,
        }
      : {}),
    createdAt: endpoint.createdAt,
    updatedAt: endpoint.updatedAt,
  };
}

export function serializeWebhookEvent(event: WebhookEvent) {
  return {
    id: encodeId('webhookEvent', event.id),
    type: event.type,
    source: event.source,
    tenantId: event.tenantId === null ? null : encodeId('tenant', event.tenantId),
    payload: event.payload,
    createdAt: event.createdAt,
  };
}

export function serializeDelivery(delivery: WebhookDelivery & { eventType?: string }) {
  return {
    id: encodeId('webhookDelivery', delivery.id),
    endpointId: encodeId('webhook', delivery.endpointId),
    eventId: encodeId('webhookEvent', delivery.eventId),
    eventType: delivery.eventType ?? null,
    status: delivery.status,
    attempts: delivery.attempts,
    nextAttemptAt: delivery.nextAttemptAt,
    lastStatus: delivery.lastStatus,
    lastError: delivery.lastError,
    lastAttemptAt: delivery.lastAttemptAt,
    createdAt: delivery.createdAt,
    updatedAt: delivery.updatedAt,
  };
}

export function serializeAttempt(attempt: WebhookAttempt) {
  return {
    id: encodeId('webhookAttempt', attempt.id),
    attempt: attempt.attempt,
    status: attempt.status,
    error: attempt.error,
    durationMs: attempt.durationMs,
    responseBody: attempt.responseBody,
    createdAt: attempt.createdAt,
  };
}
