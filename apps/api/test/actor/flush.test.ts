import { type FlushPorts, flushEvents } from '@buzzkit/api/actor/flush';
import type { ActorStore } from '@buzzkit/api/actor/store';
import type { ActorEventRow } from '@buzzkit/api/actor/types';
import { describe, expect, it, vi } from 'vitest';
import { createActorStore } from '../utils/actorStore';

function seed(store: ActorStore, count: number, from = 1): void {
  for (let index = from; index < from + count; index += 1) {
    store.insertEvent({
      id: `evt_${index}`,
      idempotencyKey: null,
      name: 'app.opened',
      source: 'server',
      timestamp: '2026-08-27T00:00:00.000Z',
      receivedAt: '2026-08-27T00:00:00.000Z',
      data: { index },
    });
  }
}

function createPorts(enqueue: FlushPorts['enqueue'] = async () => true) {
  return {
    enqueue: vi.fn(enqueue),
    scheduleRetry: vi.fn(async () => {}),
  };
}

function sequences(rows: ActorEventRow[]): number[] {
  return rows.map((row) => row.sequence);
}

function enqueuedSequences(ports: ReturnType<typeof createPorts>): number[][] {
  return ports.enqueue.mock.calls.map(([rows]) => sequences(rows));
}

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, index) => from + index);
}

describe('flushEvents', () => {
  describe('with nothing to flush', () => {
    it('reports a zero outcome and never touches the ports', async () => {
      const { store } = createActorStore();
      const ports = createPorts();
      const outcome = await flushEvents(store, ports, { batchRows: 10, retainedRows: 5 });
      expect(outcome).toEqual({ flushed: 0, batches: 0, retryScheduled: false, pruned: 0 });
      expect(ports.enqueue).not.toHaveBeenCalled();
      expect(ports.scheduleRetry).not.toHaveBeenCalled();
      expect(store.readFlushedSequence()).toBe(0);
    });

    it('still runs prune with the configured window', async () => {
      const { store } = createActorStore();
      const prune = vi.spyOn(store, 'prune');
      await flushEvents(store, createPorts(), { batchRows: 10, retainedRows: 5 });
      expect(prune).toHaveBeenCalledTimes(1);
      expect(prune).toHaveBeenCalledWith(5);
    });

    it('reports rows pruned down to a tighter window even when nothing was flushed', async () => {
      const { store } = createActorStore();
      seed(store, 20);
      await flushEvents(store, createPorts(), { batchRows: 100, retainedRows: 100 });
      const outcome = await flushEvents(store, createPorts(), { batchRows: 100, retainedRows: 4 });
      expect(outcome).toEqual({ flushed: 0, batches: 0, retryScheduled: false, pruned: 16 });
      expect(sequences(store.listRecent(100))).toEqual([20, 19, 18, 17]);
    });
  });

  describe('batching', () => {
    it('sends fewer rows than batchRows as one batch without a second query', async () => {
      const { store } = createActorStore();
      seed(store, 3);
      const listUnflushed = vi.spyOn(store, 'listUnflushed');
      const ports = createPorts();
      const outcome = await flushEvents(store, ports, { batchRows: 10, retainedRows: 100 });
      expect(outcome).toEqual({ flushed: 3, batches: 1, retryScheduled: false, pruned: 0 });
      expect(listUnflushed).toHaveBeenCalledTimes(1);
      expect(ports.enqueue).toHaveBeenCalledTimes(1);
      expect(enqueuedSequences(ports)).toEqual([[1, 2, 3]]);
      expect(store.readFlushedSequence()).toBe(3);
    });

    it('sends exactly batchRows as one batch followed by an empty second query', async () => {
      const { store } = createActorStore();
      seed(store, 10);
      const listUnflushed = vi.spyOn(store, 'listUnflushed');
      const ports = createPorts();
      const outcome = await flushEvents(store, ports, { batchRows: 10, retainedRows: 100 });
      expect(outcome).toEqual({ flushed: 10, batches: 1, retryScheduled: false, pruned: 0 });
      expect(listUnflushed).toHaveBeenCalledTimes(2);
      expect(listUnflushed.mock.results[1]!.value).toEqual([]);
      expect(ports.enqueue).toHaveBeenCalledTimes(1);
      expect(enqueuedSequences(ports)).toEqual([range(1, 10)]);
      expect(store.readFlushedSequence()).toBe(10);
    });

    it('splits batchRows + 1 into two batches and advances the watermark to the last sequence', async () => {
      const { store } = createActorStore();
      seed(store, 11);
      const listUnflushed = vi.spyOn(store, 'listUnflushed');
      const ports = createPorts();
      const outcome = await flushEvents(store, ports, { batchRows: 10, retainedRows: 100 });
      expect(outcome).toEqual({ flushed: 11, batches: 2, retryScheduled: false, pruned: 0 });
      expect(enqueuedSequences(ports)).toEqual([range(1, 10), [11]]);
      expect(listUnflushed).toHaveBeenCalledTimes(2);
      expect(store.readFlushedSequence()).toBe(11);
      expect(store.listUnflushed(100)).toEqual([]);
    });

    it('sends every row as its own batch when batchRows is 1', async () => {
      const { store } = createActorStore();
      seed(store, 4);
      const ports = createPorts();
      const outcome = await flushEvents(store, ports, { batchRows: 1, retainedRows: 100 });
      expect(outcome).toMatchObject({ flushed: 4, batches: 4 });
      expect(enqueuedSequences(ports)).toEqual([[1], [2], [3], [4]]);
    });

    it('hands the store rows to enqueue verbatim', async () => {
      const { store } = createActorStore();
      seed(store, 2);
      const ports = createPorts();
      await flushEvents(store, ports, { batchRows: 10, retainedRows: 100 });
      expect(ports.enqueue.mock.calls[0]![0]).toEqual([
        expect.objectContaining({ sequence: 1, id: 'evt_1', name: 'app.opened', data: '{"index":1}' }),
        expect.objectContaining({ sequence: 2, id: 'evt_2', name: 'app.opened', data: '{"index":2}' }),
      ]);
    });

    it('advances the watermark only after a batch is accepted', async () => {
      const { store } = createActorStore();
      seed(store, 25);
      const watermarksSeen: number[] = [];
      const ports = createPorts(async () => {
        watermarksSeen.push(store.readFlushedSequence());
        return true;
      });
      await flushEvents(store, ports, { batchRows: 10, retainedRows: 100 });
      expect(watermarksSeen).toEqual([0, 10, 20]);
      expect(store.readFlushedSequence()).toBe(25);
    });

    it('skips rows already below the watermark', async () => {
      const { store } = createActorStore();
      seed(store, 8);
      store.advanceFlushedSequence(5);
      const ports = createPorts();
      const outcome = await flushEvents(store, ports, { batchRows: 10, retainedRows: 100 });
      expect(outcome).toMatchObject({ flushed: 3, batches: 1 });
      expect(enqueuedSequences(ports)).toEqual([[6, 7, 8]]);
    });

    it('never schedules a retry when every batch is accepted', async () => {
      const { store } = createActorStore();
      seed(store, 35);
      const ports = createPorts();
      await flushEvents(store, ports, { batchRows: 10, retainedRows: 100 });
      expect(ports.scheduleRetry).not.toHaveBeenCalled();
    });
  });

  describe('when the queue refuses a batch', () => {
    it('schedules one retry, keeps the watermark, and skips pruning on the first batch', async () => {
      const { store } = createActorStore();
      seed(store, 15);
      const prune = vi.spyOn(store, 'prune');
      const ports = createPorts(async () => false);
      const outcome = await flushEvents(store, ports, { batchRows: 10, retainedRows: 2 });
      expect(outcome).toEqual({ flushed: 0, batches: 0, retryScheduled: true, pruned: 0 });
      expect(ports.enqueue).toHaveBeenCalledTimes(1);
      expect(ports.scheduleRetry).toHaveBeenCalledTimes(1);
      expect(prune).not.toHaveBeenCalled();
      expect(store.readFlushedSequence()).toBe(0);
      expect(sequences(store.listUnflushed(100))).toEqual(range(1, 15));
      expect(store.listRecent(100)).toHaveLength(15);
    });

    it('keeps the first batch flushed when the second batch is refused', async () => {
      const { store } = createActorStore();
      seed(store, 15);
      const prune = vi.spyOn(store, 'prune');
      let calls = 0;
      const ports = createPorts(async () => {
        calls += 1;
        return calls === 1;
      });
      const outcome = await flushEvents(store, ports, { batchRows: 10, retainedRows: 2 });
      expect(outcome).toEqual({ flushed: 10, batches: 1, retryScheduled: true, pruned: 0 });
      expect(enqueuedSequences(ports)).toEqual([range(1, 10), range(11, 15)]);
      expect(ports.scheduleRetry).toHaveBeenCalledTimes(1);
      expect(prune).not.toHaveBeenCalled();
      expect(store.readFlushedSequence()).toBe(10);
      expect(sequences(store.listUnflushed(100))).toEqual(range(11, 15));
    });

    it('resumes from the watermark on the next flush and re-sends only unflushed rows', async () => {
      const { store } = createActorStore();
      seed(store, 15);
      let calls = 0;
      const failing = createPorts(async () => {
        calls += 1;
        return calls === 1;
      });
      await flushEvents(store, failing, { batchRows: 10, retainedRows: 100 });

      const retry = createPorts();
      const outcome = await flushEvents(store, retry, { batchRows: 10, retainedRows: 100 });
      expect(outcome).toEqual({ flushed: 5, batches: 1, retryScheduled: false, pruned: 0 });
      expect(enqueuedSequences(retry)).toEqual([range(11, 15)]);
      expect(retry.scheduleRetry).not.toHaveBeenCalled();
      expect(store.readFlushedSequence()).toBe(15);
      expect(store.listUnflushed(100)).toEqual([]);
    });

    it('schedules a retry again when the retry is refused too', async () => {
      const { store } = createActorStore();
      seed(store, 3);
      const first = createPorts(async () => false);
      const second = createPorts(async () => false);
      await flushEvents(store, first, { batchRows: 10, retainedRows: 100 });
      const outcome = await flushEvents(store, second, { batchRows: 10, retainedRows: 100 });
      expect(outcome).toEqual({ flushed: 0, batches: 0, retryScheduled: true, pruned: 0 });
      expect(second.scheduleRetry).toHaveBeenCalledTimes(1);
      expect(enqueuedSequences(second)).toEqual([[1, 2, 3]]);
      expect(store.readFlushedSequence()).toBe(0);
    });

    it('includes rows that arrived after a refusal in the next flush', async () => {
      const { store } = createActorStore();
      seed(store, 3);
      await flushEvents(
        store,
        createPorts(async () => false),
        { batchRows: 10, retainedRows: 100 }
      );
      seed(store, 2, 4);
      const ports = createPorts();
      const outcome = await flushEvents(store, ports, { batchRows: 10, retainedRows: 100 });
      expect(outcome).toMatchObject({ flushed: 5, batches: 1 });
      expect(enqueuedSequences(ports)).toEqual([[1, 2, 3, 4, 5]]);
    });
  });

  describe('when enqueue throws', () => {
    it('propagates the error, keeps the watermark, and skips both retry and prune', async () => {
      const { store } = createActorStore();
      seed(store, 15);
      const prune = vi.spyOn(store, 'prune');
      let calls = 0;
      const ports = createPorts(async () => {
        calls += 1;
        if (calls === 2) throw new Error('queue unavailable');
        return true;
      });
      await expect(flushEvents(store, ports, { batchRows: 10, retainedRows: 2 })).rejects.toThrow(
        'queue unavailable'
      );
      expect(ports.scheduleRetry).not.toHaveBeenCalled();
      expect(prune).not.toHaveBeenCalled();
      expect(store.readFlushedSequence()).toBe(10);
      expect(sequences(store.listUnflushed(100))).toEqual(range(11, 15));
    });
  });

  describe('pruning', () => {
    it('reports the rows pruned after a full flush, leaving exactly retained rows', async () => {
      const { store } = createActorStore();
      seed(store, 30);
      const outcome = await flushEvents(store, createPorts(), { batchRows: 10, retainedRows: 5 });
      expect(outcome).toEqual({ flushed: 30, batches: 3, retryScheduled: false, pruned: 25 });
      expect(sequences(store.listRecent(100))).toEqual([30, 29, 28, 27, 26]);
      expect(store.readFlushedSequence()).toBe(30);
    });

    it('prunes nothing when the flushed rows fit the window', async () => {
      const { store } = createActorStore();
      seed(store, 5);
      const outcome = await flushEvents(store, createPorts(), { batchRows: 10, retainedRows: 5 });
      expect(outcome.pruned).toBe(0);
      expect(store.listRecent(100)).toHaveLength(5);
    });

    it('passes retainedRows to prune verbatim', async () => {
      const { store } = createActorStore();
      seed(store, 5);
      const prune = vi.spyOn(store, 'prune');
      await flushEvents(store, createPorts(), { batchRows: 10, retainedRows: 1234 });
      expect(prune).toHaveBeenCalledWith(1234);
    });

    it('runs prune once per flush, after the last batch', async () => {
      const { store } = createActorStore();
      seed(store, 25);
      const prune = vi.spyOn(store, 'prune');
      const ports = createPorts();
      await flushEvents(store, ports, { batchRows: 10, retainedRows: 100 });
      expect(prune).toHaveBeenCalledTimes(1);
      expect(ports.enqueue).toHaveBeenCalledTimes(3);
      expect(prune.mock.invocationCallOrder[0]).toBeGreaterThan(
        ports.enqueue.mock.invocationCallOrder.at(-1)!
      );
    });
  });

  describe('across flushes', () => {
    it('picks up a row inserted between two flushes', async () => {
      const { store } = createActorStore();
      seed(store, 3);
      await flushEvents(store, createPorts(), { batchRows: 10, retainedRows: 100 });
      seed(store, 1, 4);
      const ports = createPorts();
      const outcome = await flushEvents(store, ports, { batchRows: 10, retainedRows: 100 });
      expect(outcome).toEqual({ flushed: 1, batches: 1, retryScheduled: false, pruned: 0 });
      expect(enqueuedSequences(ports)).toEqual([[4]]);
      expect(store.readFlushedSequence()).toBe(4);
    });

    it('reports a zero outcome when flushed again with nothing new', async () => {
      const { store } = createActorStore();
      seed(store, 3);
      await flushEvents(store, createPorts(), { batchRows: 10, retainedRows: 100 });
      const ports = createPorts();
      const outcome = await flushEvents(store, ports, { batchRows: 10, retainedRows: 100 });
      expect(outcome).toEqual({ flushed: 0, batches: 0, retryScheduled: false, pruned: 0 });
      expect(ports.enqueue).not.toHaveBeenCalled();
    });

    it('never re-sends a row once it has been flushed', async () => {
      const { store } = createActorStore();
      const sent: number[] = [];
      const ports = createPorts(async (rows) => {
        sent.push(...sequences(rows));
        return true;
      });
      for (let round = 0; round < 5; round += 1) {
        seed(store, 7, round * 7 + 1);
        await flushEvents(store, ports, { batchRows: 3, retainedRows: 100 });
      }
      expect(sent).toEqual(range(1, 35));
    });
  });

  describe('at volume', () => {
    it('flushes 2,500 rows in 25 batches of 100 and prunes down to exactly the retained rows', async () => {
      const { store } = createActorStore();
      seed(store, 2_500);
      const listUnflushed = vi.spyOn(store, 'listUnflushed');
      const ports = createPorts();
      const outcome = await flushEvents(store, ports, { batchRows: 100, retainedRows: 500 });
      expect(outcome).toEqual({ flushed: 2_500, batches: 25, retryScheduled: false, pruned: 2_000 });
      expect(ports.enqueue).toHaveBeenCalledTimes(25);
      expect(listUnflushed).toHaveBeenCalledTimes(26);
      const batches = enqueuedSequences(ports);
      expect(batches.every((batch) => batch.length === 100)).toBe(true);
      expect(batches.flat()).toEqual(range(1, 2_500));
      expect(store.readFlushedSequence()).toBe(2_500);
      expect(store.listUnflushed(10_000)).toEqual([]);
      const remaining = sequences(store.listRecent(10_000));
      expect(remaining).toHaveLength(500);
      expect(remaining).toEqual(range(2_001, 2_500).reverse());
    });
  });
});
