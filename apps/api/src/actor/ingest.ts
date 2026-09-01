import { uuidv7 } from '@buzzkit/api/utils/uuid';
import type { ActorStore } from './store';
import type { ActorEventInput, ActorIngestOutcome } from './types';

export function acceptEvents(store: ActorStore, events: ActorEventInput[]): ActorIngestOutcome[] {
  return events.map((event) => acceptEvent(store, event));
}

export function acceptEvent(store: ActorStore, input: ActorEventInput): ActorIngestOutcome {
  const event = {
    ...input,
    idempotencyKey: input.idempotencyKey || null,
    messageId: input.messageId ?? messageIdOf(input.data),
  };
  const existing = event.idempotencyKey ? store.selectByIdempotencyKey(event.idempotencyKey) : null;
  if (existing) {
    return { id: existing.id, sequence: existing.sequence, status: 'duplicate' };
  }

  const sequence = store.insertEvent(event);
  store.recordProjection(event.name, sequence, event.timestamp);
  mirrorAttributes(store, event);

  return { id: event.id, sequence, status: 'accepted' };
}

const SNAPSHOT_EVENTS = new Set(['$subscriber.created', '$subscriber.updated']);

function messageIdOf(data: Record<string, unknown>): string | null {
  return typeof data.messageId === 'string' && data.messageId.length > 0 ? data.messageId : null;
}

function mirrorAttributes(store: ActorStore, event: ActorEventInput): void {
  const attributes = event.data.attributes;
  if (typeof attributes !== 'object' || attributes === null || Array.isArray(attributes)) return;
  if (SNAPSHOT_EVENTS.has(event.name)) {
    store.writeAttributes(attributes as Record<string, unknown>);
  } else if (event.name === '$identify') {
    store.writeAttributes({ ...store.readAttributes(), ...(attributes as Record<string, unknown>) });
  }
}

export type SystemEventOrigin = { runId: string; step: string | null; messageId?: string | null; now?: Date };

export function systemEvent(
  name: string,
  data: Record<string, unknown>,
  origin: SystemEventOrigin
): ActorEventInput {
  const now = origin.now ?? new Date();

  return {
    id: `evt_${uuidv7(now.getTime())}`,
    idempotencyKey: null,
    name,
    source: 'system',
    timestamp: now.toISOString(),
    receivedAt: now.toISOString(),
    data,
    runId: origin.runId,
    step: origin.step,
    messageId: origin.messageId ?? null,
  };
}
