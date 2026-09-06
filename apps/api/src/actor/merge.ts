import { toHistoryEvent } from './ingest';
import type { ActorStore } from './store';
import type { ActorHistory, ActorHistoryInput, ActorHistoryOutcome } from './types';

export function exportActorHistory(store: ActorStore, limit: number): ActorHistory {
  const rows = store.listHistory(limit + 1);
  const truncated = rows.length > limit;
  return {
    events: truncated ? rows.slice(1) : rows,
    projections: store.listProjections(),
    truncated,
  };
}

export function ingestActorHistory(
  store: ActorStore,
  input: ActorHistoryInput,
  flushed: boolean
): ActorHistoryOutcome {
  if (store.hasMergedFrom(input.from)) {
    return { events: 0, projections: 0, applied: false, pending: false };
  }
  if (!flushed || store.countUnflushed() > 0) {
    return { events: 0, projections: 0, applied: false, pending: true };
  }

  let events = 0;
  let lastSequence = 0;
  for (const row of input.events) {
    if (store.hasEvent(row.id)) continue;
    lastSequence = store.insertEvent(toHistoryEvent(row));
    events += 1;
  }
  const settled = lastSequence > 0 && store.countUnflushed() === events;
  if (settled) store.advanceFlushedSequence(lastSequence);

  for (const projection of input.projections) {
    store.mergeProjection(projection);
  }
  store.recordMergedFrom(input.from);

  return { events, projections: input.projections.length, applied: true, pending: false };
}
