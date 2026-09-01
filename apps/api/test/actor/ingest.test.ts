import { acceptEvent, acceptEvents, systemEvent } from '@buzzkit/api/actor/ingest';
import type { ActorEventInput } from '@buzzkit/api/actor/types';
import { describe, expect, it, vi } from 'vitest';
import { createActorStore } from '../utils/actorStore';

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

describe('acceptEvent', () => {
  it('accepts a new event and returns its id and sequence', () => {
    const { store } = createActorStore();
    expect(acceptEvent(store, event({ id: 'evt_1' }))).toEqual({
      id: 'evt_1',
      sequence: 1,
      status: 'accepted',
    });
    expect(store.listRecent(10)).toHaveLength(1);
  });

  it('returns the original id and sequence for a duplicate idempotency key', () => {
    const { store } = createActorStore();
    acceptEvent(store, event({ id: 'evt_original', idempotencyKey: 'key' }));
    acceptEvent(store, event({ id: 'evt_between' }));
    expect(acceptEvent(store, event({ id: 'evt_replay', idempotencyKey: 'key' }))).toEqual({
      id: 'evt_original',
      sequence: 1,
      status: 'duplicate',
    });
    expect(store.listRecent(10).map((row) => row.id)).toEqual(['evt_between', 'evt_original']);
  });

  it('treats a duplicate as a duplicate even when everything but the key differs', () => {
    const { store } = createActorStore();
    acceptEvent(store, event({ id: 'evt_1', idempotencyKey: 'key', name: 'a', data: { x: 1 } }));
    const outcome = acceptEvent(
      store,
      event({
        id: 'evt_2',
        idempotencyKey: 'key',
        name: 'b',
        source: 'sdk',
        timestamp: '2027-01-01T00:00:00.000Z',
        data: { x: 2 },
      })
    );
    expect(outcome).toEqual({ id: 'evt_1', sequence: 1, status: 'duplicate' });
    expect(store.listRecent(10)).toHaveLength(1);
    expect(store.listRecent(10)[0]!.name).toBe('a');
  });

  it('never dedupes events with a null idempotency key, even with identical payloads', () => {
    const { store } = createActorStore();
    const first = acceptEvent(store, event({ id: 'evt_1', data: { same: true } }));
    const second = acceptEvent(store, event({ id: 'evt_2', data: { same: true } }));
    expect(first).toEqual({ id: 'evt_1', sequence: 1, status: 'accepted' });
    expect(second).toEqual({ id: 'evt_2', sequence: 2, status: 'accepted' });
    expect(store.listRecent(10)).toHaveLength(2);
  });

  it('treats an empty idempotency key as no key: never dedupes, never throws', () => {
    const { store } = createActorStore();
    const first = acceptEvent(store, event({ id: 'evt_1', idempotencyKey: '', data: { same: true } }));
    const second = acceptEvent(store, event({ id: 'evt_2', idempotencyKey: '', data: { same: true } }));
    expect(first).toEqual({ id: 'evt_1', sequence: 1, status: 'accepted' });
    expect(second).toEqual({ id: 'evt_2', sequence: 2, status: 'accepted' });
    expect(store.listRecent(10).map((row) => row.idempotency_key)).toEqual([null, null]);
  });

  it('stores an empty idempotency key as NULL, invisible to the key lookup', () => {
    const { store } = createActorStore();
    const selectByIdempotencyKey = vi.spyOn(store, 'selectByIdempotencyKey');
    acceptEvent(store, event({ id: 'evt_1', idempotencyKey: '' }));
    expect(selectByIdempotencyKey).not.toHaveBeenCalled();
    expect(store.selectByIdempotencyKey('')).toBeNull();
    expect(store.listRecent(1)[0]!.idempotency_key).toBeNull();
  });

  it('records a projection for an event with an empty idempotency key', () => {
    const { store } = createActorStore();
    acceptEvent(store, event({ id: 'evt_1', idempotencyKey: '', name: 'order.placed' }));
    acceptEvent(store, event({ id: 'evt_2', idempotencyKey: '', name: 'order.placed' }));
    expect(store.listProjections()).toEqual([
      { name: 'order.placed', count: 2, last_sequence: 2, last_at: '2026-08-27T00:00:00.000Z' },
    ]);
  });

  it('dedupes keys exactly, not by prefix or case', () => {
    const { store } = createActorStore();
    acceptEvent(store, event({ id: 'evt_1', idempotencyKey: 'Key' }));
    expect(acceptEvent(store, event({ id: 'evt_2', idempotencyKey: 'key' })).status).toBe('accepted');
    expect(acceptEvent(store, event({ id: 'evt_3', idempotencyKey: 'Key2' })).status).toBe('accepted');
    expect(acceptEvent(store, event({ id: 'evt_4', idempotencyKey: 'Key' })).status).toBe('duplicate');
  });

  it('records a projection for an accepted event', () => {
    const { store } = createActorStore();
    acceptEvent(store, event({ id: 'evt_1', name: 'order.placed', timestamp: '2026-08-27T09:00:00.000Z' }));
    expect(store.listProjections()).toEqual([
      { name: 'order.placed', count: 1, last_sequence: 1, last_at: '2026-08-27T09:00:00.000Z' },
    ]);
  });

  it('does not touch projections for a duplicate', () => {
    const { store } = createActorStore();
    acceptEvent(store, event({ id: 'evt_1', idempotencyKey: 'key', name: 'order.placed' }));
    const recordProjection = vi.spyOn(store, 'recordProjection');
    const insertEvent = vi.spyOn(store, 'insertEvent');
    acceptEvent(
      store,
      event({
        id: 'evt_2',
        idempotencyKey: 'key',
        name: 'order.placed',
        timestamp: '2030-01-01T00:00:00.000Z',
      })
    );
    expect(recordProjection).not.toHaveBeenCalled();
    expect(insertEvent).not.toHaveBeenCalled();
    expect(store.listProjections()).toEqual([
      { name: 'order.placed', count: 1, last_sequence: 1, last_at: '2026-08-27T00:00:00.000Z' },
    ]);
  });

  it('does not look up the key when it is null', () => {
    const { store } = createActorStore();
    const selectByIdempotencyKey = vi.spyOn(store, 'selectByIdempotencyKey');
    acceptEvent(store, event({ id: 'evt_1' }));
    expect(selectByIdempotencyKey).not.toHaveBeenCalled();
  });

  it('propagates a duplicate event id as a store error', () => {
    const { store } = createActorStore();
    acceptEvent(store, event({ id: 'evt_1' }));
    expect(() => acceptEvent(store, event({ id: 'evt_1' }))).toThrow(/UNIQUE constraint failed: events\.id/);
    expect(store.listProjections()[0]!.count).toBe(1);
  });

  it('persists optional run, message and step fields', () => {
    const { store } = createActorStore();
    acceptEvent(store, event({ id: 'evt_1', runId: 'run_1', messageId: 'msg_1', step: 'welcome' }));
    expect(store.listRecent(1)[0]).toMatchObject({ run_id: 'run_1', message_id: 'msg_1', step: 'welcome' });
  });
});

describe('acceptEvents', () => {
  it('returns an empty list for an empty batch', () => {
    const { store } = createActorStore();
    expect(acceptEvents(store, [])).toEqual([]);
    expect(store.listRecent(10)).toEqual([]);
    expect(store.listProjections()).toEqual([]);
  });

  it('preserves batch order in outcomes and in sequences', () => {
    const { store } = createActorStore();
    const outcomes = acceptEvents(store, [
      event({ id: 'evt_c', name: 'c' }),
      event({ id: 'evt_a', name: 'a' }),
      event({ id: 'evt_b', name: 'b' }),
    ]);
    expect(outcomes).toEqual([
      { id: 'evt_c', sequence: 1, status: 'accepted' },
      { id: 'evt_a', sequence: 2, status: 'accepted' },
      { id: 'evt_b', sequence: 3, status: 'accepted' },
    ]);
    expect(store.listUnflushed(10).map((row) => row.id)).toEqual(['evt_c', 'evt_a', 'evt_b']);
  });

  it('dedupes a duplicate inside the same batch against the earlier entry', () => {
    const { store } = createActorStore();
    const outcomes = acceptEvents(store, [
      event({ id: 'evt_1', idempotencyKey: 'key' }),
      event({ id: 'evt_2' }),
      event({ id: 'evt_3', idempotencyKey: 'key' }),
    ]);
    expect(outcomes).toEqual([
      { id: 'evt_1', sequence: 1, status: 'accepted' },
      { id: 'evt_2', sequence: 2, status: 'accepted' },
      { id: 'evt_1', sequence: 1, status: 'duplicate' },
    ]);
    expect(store.listRecent(10).map((row) => row.id)).toEqual(['evt_2', 'evt_1']);
  });

  it('keeps sequences of accepted events contiguous across duplicates', () => {
    const { store } = createActorStore();
    acceptEvents(store, [event({ id: 'seed', idempotencyKey: 'seed' })]);
    const outcomes = acceptEvents(store, [
      event({ id: 'evt_1' }),
      event({ id: 'evt_2', idempotencyKey: 'seed' }),
      event({ id: 'evt_3', idempotencyKey: 'seed' }),
      event({ id: 'evt_4' }),
      event({ id: 'evt_5', idempotencyKey: 'fresh' }),
      event({ id: 'evt_6', idempotencyKey: 'fresh' }),
      event({ id: 'evt_7' }),
    ]);
    const accepted = outcomes.filter((outcome) => outcome.status === 'accepted');
    expect(accepted.map((outcome) => outcome.sequence)).toEqual([2, 3, 4, 5]);
    expect(accepted.map((outcome) => outcome.id)).toEqual(['evt_1', 'evt_4', 'evt_5', 'evt_7']);
    expect(outcomes.filter((outcome) => outcome.status === 'duplicate')).toEqual([
      { id: 'seed', sequence: 1, status: 'duplicate' },
      { id: 'seed', sequence: 1, status: 'duplicate' },
      { id: 'evt_5', sequence: 4, status: 'duplicate' },
    ]);
  });

  it('updates projections once per accepted event and never for duplicates', () => {
    const { store } = createActorStore();
    acceptEvents(store, [
      event({ id: 'evt_1', name: 'a', idempotencyKey: 'k1', timestamp: '2026-08-27T00:00:01.000Z' }),
      event({ id: 'evt_2', name: 'a', idempotencyKey: 'k1', timestamp: '2026-08-27T00:00:09.000Z' }),
      event({ id: 'evt_3', name: 'b', timestamp: '2026-08-27T00:00:02.000Z' }),
      event({ id: 'evt_4', name: 'a', timestamp: '2026-08-27T00:00:03.000Z' }),
      event({ id: 'evt_5', name: 'b', idempotencyKey: 'k2', timestamp: '2026-08-27T00:00:04.000Z' }),
      event({ id: 'evt_6', name: 'b', idempotencyKey: 'k2', timestamp: '2026-08-27T00:00:05.000Z' }),
    ]);
    expect(store.listProjections()).toEqual([
      { name: 'a', count: 2, last_sequence: 3, last_at: '2026-08-27T00:00:03.000Z' },
      { name: 'b', count: 2, last_sequence: 4, last_at: '2026-08-27T00:00:04.000Z' },
    ]);
  });

  it('accepts every empty-keyed event in a batch while still deduping real keys', () => {
    const { store } = createActorStore();
    const outcomes = acceptEvents(store, [
      event({ id: 'evt_1', idempotencyKey: '' }),
      event({ id: 'evt_2', idempotencyKey: '' }),
      event({ id: 'evt_3', idempotencyKey: 'key' }),
      event({ id: 'evt_4', idempotencyKey: 'key' }),
      event({ id: 'evt_5', idempotencyKey: '' }),
    ]);
    expect(outcomes.map((outcome) => outcome.status)).toEqual([
      'accepted',
      'accepted',
      'accepted',
      'duplicate',
      'accepted',
    ]);
    expect(outcomes.map((outcome) => outcome.sequence)).toEqual([1, 2, 3, 3, 4]);
    expect(store.listRecent(10).map((row) => row.idempotency_key)).toEqual([null, 'key', null, null]);
  });

  it('dedupes across batches', () => {
    const { store } = createActorStore();
    const first = acceptEvents(store, [event({ id: 'evt_1', idempotencyKey: 'key' })]);
    const second = acceptEvents(store, [
      event({ id: 'evt_2', idempotencyKey: 'key' }),
      event({ id: 'evt_3' }),
    ]);
    expect(first).toEqual([{ id: 'evt_1', sequence: 1, status: 'accepted' }]);
    expect(second).toEqual([
      { id: 'evt_1', sequence: 1, status: 'duplicate' },
      { id: 'evt_3', sequence: 2, status: 'accepted' },
    ]);
  });

  it('stops at the first failing event and keeps the earlier ones', () => {
    const { store } = createActorStore();
    expect(() =>
      acceptEvents(store, [event({ id: 'evt_1' }), event({ id: 'evt_1' }), event({ id: 'evt_3' })])
    ).toThrow(/UNIQUE constraint failed: events\.id/);
    expect(store.listRecent(10).map((row) => row.id)).toEqual(['evt_1']);
  });

  it('leaves every accepted row unflushed', () => {
    const { store } = createActorStore();
    acceptEvents(store, [event({ id: 'evt_1' }), event({ id: 'evt_2' })]);
    expect(store.readFlushedSequence()).toBe(0);
    expect(store.listUnflushed(10)).toHaveLength(2);
  });

  it('files the message id of a notification event and of a step record', () => {
    const { store } = createActorStore();
    acceptEvent(store, event({ id: 'evt_o', name: '$notification.opened', data: { messageId: 'msg_1' } }));
    acceptEvent(
      store,
      systemEvent('$run.step', { step: 'nudge' }, { runId: 'run_1', step: 'nudge', messageId: 'msg_1' })
    );
    expect(store.listRecent(10).map((row) => [row.name, row.message_id, row.run_id, row.step])).toEqual([
      ['$run.step', 'msg_1', 'run_1', 'nudge'],
      ['$notification.opened', 'msg_1', null, null],
    ]);
  });
});
