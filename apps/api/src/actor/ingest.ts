import type { ActorStore } from './store';
import type { ActorEventInput, ActorIngestOutcome } from './types';

export function acceptEvents(store: ActorStore, events: ActorEventInput[]): ActorIngestOutcome[] {
  return events.map((event) => acceptEvent(store, event));
}

export function acceptEvent(store: ActorStore, input: ActorEventInput): ActorIngestOutcome {
  const event = { ...input, idempotencyKey: input.idempotencyKey || null };
  const existing = event.idempotencyKey ? store.findByIdempotencyKey(event.idempotencyKey) : null;
  if (existing) {
    return { id: existing.id, sequence: existing.sequence, status: 'duplicate' };
  }

  const sequence = store.insertEvent(event);
  store.recordProjection(event.name, sequence, event.timestamp);
  return { id: event.id, sequence, status: 'accepted' };
}
