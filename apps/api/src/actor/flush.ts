import type { ActorStore } from './store';
import type { ActorEventRow, ActorFlushOutcome } from './types';

export type FlushPorts = {
  enqueue: (rows: ActorEventRow[]) => Promise<boolean>;
  scheduleRetry: () => Promise<void>;
};

export type FlushOptions = {
  batchRows: number;
  retainedRows: number;
};

export async function flushEvents(
  store: ActorStore,
  ports: FlushPorts,
  options: FlushOptions
): Promise<ActorFlushOutcome> {
  const outcome: ActorFlushOutcome = { flushed: 0, batches: 0, retryScheduled: false, pruned: 0 };

  let batch = store.listUnflushed(options.batchRows);
  while (batch.length > 0) {
    if (!(await ports.enqueue(batch))) {
      await ports.scheduleRetry();
      outcome.retryScheduled = true;
      break;
    }
    store.advanceFlushedSequence(batch.at(-1)!.sequence);
    outcome.flushed += batch.length;
    outcome.batches += 1;
    batch = batch.length < options.batchRows ? [] : store.listUnflushed(options.batchRows);
  }

  if (!outcome.retryScheduled) {
    outcome.pruned = store.prune(options.retainedRows);
  }

  return outcome;
}
