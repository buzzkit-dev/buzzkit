import type { SourceMapping, SourceProvider, SourceStatus, Verification } from '@buzzkit/schema/sources';
import type { Source, SourceDelivery } from './types';

function ingestUrl(sourceId: string): string {
  return `/v1/sources/${sourceId}/ingest`;
}

export function serializeSource(source: Source, id: string) {
  return {
    id: source.id,
    name: source.name,
    provider: source.provider as SourceProvider,
    status: source.status as SourceStatus,
    url: ingestUrl(id),
    mapping: source.mapping as SourceMapping,
    verification: source.verification as Verification,
    hasSecret: source.secretCiphertext !== null,
    lastDeliveryAt: source.lastDeliveryAt,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  };
}

export function serializeSourceDelivery(delivery: SourceDelivery) {
  return {
    id: delivery.id,
    sourceId: delivery.sourceId,
    providerEventId: delivery.providerEventId,
    providerType: delivery.providerType,
    outcome: delivery.outcome,
    reason: delivery.reason,
    detail: delivery.detail,
    subscriberId: delivery.subscriberId,
    event: delivery.eventName,
    eventId: delivery.eventId,
    payload: delivery.payload,
    receivedAt: delivery.receivedAt,
  };
}
