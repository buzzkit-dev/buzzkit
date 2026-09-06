import { exportActorHistory, ingestActorHistory } from '@buzzkit/api/actor/merge';
import type { ActorEventInput, ActorHistoryInput, ActorProjection } from '@buzzkit/api/actor/types';
import { describe, expect, it } from 'vitest';
import { createActorStore } from '../utils/actorStore';

type Store = ReturnType<typeof createActorStore>['store'];

function event(overrides: Partial<ActorEventInput> & { id: string }): ActorEventInput {
  return {
    idempotencyKey: null,
    name: 'app.opened',
    source: 'server',
    timestamp: '2026-08-27T00:00:00.000Z',
    receivedAt: '2026-08-27T00:00:00.000Z',
    data: {},
    ...overrides,
  };
}

function fill(store: Store, count: number, from = 1): void {
  for (let index = from; index < from + count; index += 1) {
    store.insertEvent(event({ id: `evt_${index}` }));
  }
}

function historyOf(store: Store, from = 7, projections: ActorProjection[] = []): ActorHistoryInput {
  const exported = exportActorHistory(store, 100);
  return {
    tenantId: 1,
    subscriberId: 2,
    externalId: 'user_42',
    from,
    ...exported,
    projections: projections.length > 0 ? projections : exported.projections,
  };
}

describe('exportActorHistory', () => {
  it('takes the newest events, oldest first, so a copy keeps their order', () => {
    const { store } = createActorStore();
    fill(store, 5);

    const exported = exportActorHistory(store, 3);

    expect(exported.events.map((row) => row.id)).toEqual(['evt_3', 'evt_4', 'evt_5']);
    expect(exported.truncated).toBe(true);
  });

  it('reports nothing truncated when everything fits', () => {
    const { store } = createActorStore();
    fill(store, 3);

    const exported = exportActorHistory(store, 3);

    expect(exported.events.map((row) => row.id)).toEqual(['evt_1', 'evt_2', 'evt_3']);
    expect(exported.truncated).toBe(false);
  });

  it('carries the projections alongside the events', () => {
    const { store } = createActorStore();
    store.recordProjection('cart.paid', 1, '2026-08-27T00:00:00.000Z');

    expect(exportActorHistory(store, 10).projections).toEqual([
      { name: 'cart.paid', count: 1, last_sequence: 1, last_at: '2026-08-27T00:00:00.000Z' },
    ]);
  });
});

describe('ingestActorHistory', () => {
  it('copies the events, merges the counts and never leaves them to flush again', () => {
    const source = createActorStore().store;
    fill(source, 3);
    for (const sequence of [1, 2, 3]) {
      source.recordProjection('cart.paid', sequence, `2026-08-27T00:00:0${sequence}.000Z`);
    }

    const { store } = createActorStore();
    const outcome = ingestActorHistory(store, historyOf(source), true);

    expect(outcome).toEqual({ events: 3, projections: 1, applied: true, pending: false });
    expect(store.listHistory(10).map((row) => row.id)).toEqual(['evt_1', 'evt_2', 'evt_3']);
    expect(store.countUnflushed()).toBe(0);
    expect(store.listProjections()).toEqual([
      { name: 'cart.paid', count: 3, last_sequence: 0, last_at: '2026-08-27T00:00:03.000Z' },
    ]);
  });

  it('adds absorbed counts onto the destination without double counting the events', () => {
    const source = createActorStore().store;
    fill(source, 2);
    for (const sequence of [1, 2]) {
      source.recordProjection('app.opened', sequence, `2026-08-27T00:00:0${sequence}.000Z`);
    }

    const { store } = createActorStore();
    store.advanceFlushedSequence(store.insertEvent(event({ id: 'own_1' })));
    store.recordProjection('app.opened', 1, '2026-08-26T00:00:00.000Z');

    ingestActorHistory(store, historyOf(source), true);

    expect(store.listProjections()).toEqual([
      { name: 'app.opened', count: 3, last_sequence: 1, last_at: '2026-08-27T00:00:02.000Z' },
    ]);
  });

  it('refuses while the destination still has rows waiting to be flushed', () => {
    const source = createActorStore().store;
    fill(source, 2);

    const { store } = createActorStore();
    store.insertEvent(event({ id: 'pending_1' }));

    const outcome = ingestActorHistory(store, historyOf(source), true);

    expect(outcome).toEqual({ events: 0, projections: 0, applied: false, pending: true });
    expect(store.listHistory(10).map((row) => row.id)).toEqual(['pending_1']);
    expect(store.hasMergedFrom(7)).toBe(false);
  });

  it('refuses when the flush itself could not complete', () => {
    const source = createActorStore().store;
    fill(source, 2);

    const { store } = createActorStore();
    const outcome = ingestActorHistory(store, historyOf(source), false);

    expect(outcome).toEqual({ events: 0, projections: 0, applied: false, pending: true });
    expect(store.listHistory(10)).toEqual([]);
  });

  it('is a no-op the second time so a retried merge never counts twice', () => {
    const source = createActorStore().store;
    fill(source, 2);
    for (const sequence of [1, 2]) {
      source.recordProjection('app.opened', sequence, `2026-08-27T00:00:0${sequence}.000Z`);
    }

    const { store } = createActorStore();
    const input = historyOf(source);
    ingestActorHistory(store, input, true);
    const again = ingestActorHistory(store, input, true);

    expect(again).toEqual({ events: 0, projections: 0, applied: false, pending: false });
    expect(store.listHistory(10)).toHaveLength(2);
    expect(store.listProjections()[0]?.count).toBe(2);
  });

  it('absorbs a second source separately from the first', () => {
    const first = createActorStore().store;
    fill(first, 1, 1);
    const second = createActorStore().store;
    fill(second, 1, 2);

    const { store } = createActorStore();
    ingestActorHistory(store, historyOf(first, 7), true);
    ingestActorHistory(store, historyOf(second, 8), true);

    expect(store.listHistory(10).map((row) => row.id)).toEqual(['evt_1', 'evt_2']);
    expect(store.hasMergedFrom(7)).toBe(true);
    expect(store.hasMergedFrom(8)).toBe(true);
  });

  it('skips an event the destination already holds', () => {
    const source = createActorStore().store;
    fill(source, 2);

    const { store } = createActorStore();
    store.insertEvent(event({ id: 'evt_1' }));
    store.advanceFlushedSequence(1);

    const outcome = ingestActorHistory(store, historyOf(source), true);

    expect(outcome.events).toBe(1);
    expect(store.listHistory(10).map((row) => row.id)).toEqual(['evt_1', 'evt_2']);
  });

  it('records nothing to copy when the source is empty', () => {
    const source = createActorStore().store;

    const { store } = createActorStore();
    const outcome = ingestActorHistory(store, historyOf(source), true);

    expect(outcome).toEqual({ events: 0, projections: 0, applied: true, pending: false });
    expect(store.hasMergedFrom(7)).toBe(true);
  });
});
