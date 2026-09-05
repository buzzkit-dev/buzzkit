import type { ActorEventInput } from '@buzzkit/api/actor/types';
import { describe, expect, it } from 'vitest';
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

function insertMany(store: ReturnType<typeof createActorStore>['store'], count: number, from = 1): number[] {
  const sequences: number[] = [];
  for (let index = from; index < from + count; index += 1) {
    sequences.push(store.insertEvent(event({ id: `evt_${index}` })));
  }
  return sequences;
}

describe('ActorStore', () => {
  describe('lastEvent', () => {
    it('returns the most recent occurrence of a name with its data, or null', () => {
      const { store } = createActorStore();
      store.insertEvent(event({ id: 'evt_1', name: 'cart.updated', data: { total: 1 } }));
      store.insertEvent(event({ id: 'evt_2', name: 'cart.opened' }));
      store.insertEvent(event({ id: 'evt_3', name: 'cart.updated', data: { total: 3 } }));

      expect(store.lastEvent('cart.updated')).toMatchObject({
        id: 'evt_3',
        data: JSON.stringify({ total: 3 }),
      });
      expect(store.lastEvent('cart.paid')).toBeNull();
    });
  });

  describe('migrate', () => {
    it('is idempotent', () => {
      const { store } = createActorStore();
      expect(() => store.migrate()).not.toThrow();
      store.insertEvent(event({ id: 'evt_1' }));
      store.migrate();
      expect(store.listRecent(10)).toHaveLength(1);
    });
  });

  describe('insertEvent', () => {
    it('returns monotonically increasing sequences starting at 1', () => {
      const { store } = createActorStore();
      expect(insertMany(store, 5)).toEqual([1, 2, 3, 4, 5]);
    });

    it('refuses a second row with the same id', () => {
      const { store } = createActorStore();
      store.insertEvent(event({ id: 'evt_1' }));
      expect(() => store.insertEvent(event({ id: 'evt_1' }))).toThrow(/UNIQUE constraint failed: events\.id/);
      expect(store.listRecent(10)).toHaveLength(1);
    });

    it('allows any number of rows with a null idempotency key', () => {
      const { store } = createActorStore();
      expect(insertMany(store, 3)).toEqual([1, 2, 3]);
      expect(store.listRecent(10).every((row) => row.idempotency_key === null)).toBe(true);
    });

    it('refuses a second row with the same non-null idempotency key', () => {
      const { store } = createActorStore();
      store.insertEvent(event({ id: 'evt_1', idempotencyKey: 'key' }));
      expect(() => store.insertEvent(event({ id: 'evt_2', idempotencyKey: 'key' }))).toThrow(
        /UNIQUE constraint failed: events\.idempotency_key/
      );
      expect(store.listRecent(10)).toHaveLength(1);
    });

    it('does not reuse a sequence after the constraint rejects a row', () => {
      const { store } = createActorStore();
      store.insertEvent(event({ id: 'evt_1' }));
      expect(() => store.insertEvent(event({ id: 'evt_1' }))).toThrow();
      expect(store.insertEvent(event({ id: 'evt_2' }))).toBe(2);
    });

    it('stores the data column as JSON text verbatim', () => {
      const { store } = createActorStore();
      const data = {
        nested: { list: [1, 'two', { three: 3 }], empty: {}, nothing: null },
        unicode: 'héllo wörld — 日本語 🚀',
        quotes: 'she said "hi"',
      };
      store.insertEvent(event({ id: 'evt_1', data }));
      const [row] = store.listRecent(1);
      expect(row!.data).toBe(JSON.stringify(data));
      expect(JSON.parse(row!.data)).toEqual(data);
    });

    it('stores an empty object as "{}"', () => {
      const { store } = createActorStore();
      store.insertEvent(event({ id: 'evt_1', data: {} }));
      expect(store.listRecent(1)[0]!.data).toBe('{}');
    });

    it('stores run_id, message_id and step as null when omitted', () => {
      const { store } = createActorStore();
      store.insertEvent(event({ id: 'evt_1' }));
      const [row] = store.listRecent(1);
      expect(row!.run_id).toBeNull();
      expect(row!.message_id).toBeNull();
      expect(row!.step).toBeNull();
    });

    it('stores run_id, message_id and step when set', () => {
      const { store } = createActorStore();
      store.insertEvent(event({ id: 'evt_1', runId: 'run_1', messageId: 'msg_1', step: 'welcome' }));
      const [row] = store.listRecent(1);
      expect(row!.run_id).toBe('run_1');
      expect(row!.message_id).toBe('msg_1');
      expect(row!.step).toBe('welcome');
    });

    it('stores every column of the input', () => {
      const { store } = createActorStore();
      store.insertEvent(
        event({
          id: 'evt_1',
          idempotencyKey: 'key_1',
          name: 'order.placed',
          source: 'sdk',
          timestamp: '2026-08-27T01:02:03.000Z',
          receivedAt: '2026-08-27T01:02:04.000Z',
          data: { total: 42 },
        })
      );
      expect(store.listRecent(1)[0]).toEqual({
        sequence: 1,
        id: 'evt_1',
        idempotency_key: 'key_1',
        name: 'order.placed',
        source: 'sdk',
        timestamp: '2026-08-27T01:02:03.000Z',
        received_at: '2026-08-27T01:02:04.000Z',
        data: '{"total":42}',
        run_id: null,
        message_id: null,
        step: null,
      });
    });
  });

  describe('hasLocalScheduled', () => {
    it('finds an acknowledgment by its plan id and nothing else', () => {
      const { store } = createActorStore();
      store.insertEvent(
        event({ id: 'evt_1', name: '$local.scheduled', data: { localId: '1-wf_a-2-3:remind' } })
      );
      store.insertEvent(event({ id: 'evt_2', name: 'workout.completed', data: { localId: 'other' } }));
      expect(store.hasLocalScheduled('1-wf_a-2-3:remind')).toBe(true);
      expect(store.hasLocalScheduled('1-wf_a-2-3:nudge')).toBe(false);
    });
  });

  describe('selectByIdempotencyKey', () => {
    it('returns null when no row carries the key', () => {
      const { store } = createActorStore();
      store.insertEvent(event({ id: 'evt_1', idempotencyKey: 'other' }));
      expect(store.selectByIdempotencyKey('missing')).toBeNull();
    });

    it('returns the sequence and id of the row carrying the key', () => {
      const { store } = createActorStore();
      store.insertEvent(event({ id: 'evt_1' }));
      store.insertEvent(event({ id: 'evt_2', idempotencyKey: 'key' }));
      expect(store.selectByIdempotencyKey('key')).toEqual({ sequence: 2, id: 'evt_2' });
    });

    it('never matches rows with a null key', () => {
      const { store } = createActorStore();
      store.insertEvent(event({ id: 'evt_1' }));
      expect(store.selectByIdempotencyKey('')).toBeNull();
    });
  });

  describe('recordProjection', () => {
    it('creates a projection with count 1 on first sight', () => {
      const { store } = createActorStore();
      store.recordProjection('app.opened', 1, '2026-08-27T00:00:00.000Z');
      expect(store.listProjections()).toEqual([
        { name: 'app.opened', count: 1, last_sequence: 1, last_at: '2026-08-27T00:00:00.000Z' },
      ]);
    });

    it('increments the count and advances last_sequence and last_at', () => {
      const { store } = createActorStore();
      store.recordProjection('app.opened', 1, '2026-08-27T00:00:00.000Z');
      store.recordProjection('app.opened', 2, '2026-08-27T00:00:01.000Z');
      store.recordProjection('app.opened', 3, '2026-08-27T00:00:02.000Z');
      expect(store.listProjections()).toEqual([
        { name: 'app.opened', count: 3, last_sequence: 3, last_at: '2026-08-27T00:00:02.000Z' },
      ]);
    });

    it('keeps the newest last_at when an older timestamp arrives later', () => {
      const { store } = createActorStore();
      store.recordProjection('app.opened', 1, '2026-08-27T12:00:00.000Z');
      store.recordProjection('app.opened', 2, '2026-08-26T23:59:59.000Z');
      expect(store.listProjections()).toEqual([
        { name: 'app.opened', count: 2, last_sequence: 2, last_at: '2026-08-27T12:00:00.000Z' },
      ]);
    });

    it('always takes the newest last_sequence even when the timestamp is older', () => {
      const { store } = createActorStore();
      store.recordProjection('app.opened', 7, '2026-08-27T12:00:00.000Z');
      store.recordProjection('app.opened', 8, '2020-01-01T00:00:00.000Z');
      expect(store.listProjections()[0]!.last_sequence).toBe(8);
    });

    it('tracks each name independently', () => {
      const { store } = createActorStore();
      store.recordProjection('a', 1, '2026-08-27T00:00:00.000Z');
      store.recordProjection('b', 2, '2026-08-27T00:00:01.000Z');
      store.recordProjection('a', 3, '2026-08-27T00:00:02.000Z');
      expect(store.listProjections()).toEqual([
        { name: 'a', count: 2, last_sequence: 3, last_at: '2026-08-27T00:00:02.000Z' },
        { name: 'b', count: 1, last_sequence: 2, last_at: '2026-08-27T00:00:01.000Z' },
      ]);
    });
  });

  describe('listProjections', () => {
    it('returns an empty list before anything is recorded', () => {
      const { store } = createActorStore();
      expect(store.listProjections()).toEqual([]);
    });

    it('sorts by name ascending regardless of insertion order', () => {
      const { store } = createActorStore();
      for (const name of ['zeta', 'alpha', '$system', 'Beta', 'mid']) {
        store.recordProjection(name, 1, '2026-08-27T00:00:00.000Z');
      }
      expect(store.listProjections().map((projection) => projection.name)).toEqual([
        '$system',
        'Beta',
        'alpha',
        'mid',
        'zeta',
      ]);
    });
  });

  describe('listRecent', () => {
    it('returns rows newest first up to the limit', () => {
      const { store } = createActorStore();
      insertMany(store, 5);
      expect(store.listRecent(3).map((row) => row.sequence)).toEqual([5, 4, 3]);
    });

    it('returns every row when fewer than the limit exist', () => {
      const { store } = createActorStore();
      insertMany(store, 2);
      expect(store.listRecent(10).map((row) => row.sequence)).toEqual([2, 1]);
    });

    it('returns an empty list from an empty store', () => {
      const { store } = createActorStore();
      expect(store.listRecent(10)).toEqual([]);
    });

    it('returns nothing with a limit of 0', () => {
      const { store } = createActorStore();
      insertMany(store, 2);
      expect(store.listRecent(0)).toEqual([]);
    });

    it('returns everything below a cursor at the newest row', () => {
      const { store } = createActorStore();
      insertMany(store, 5);
      expect(store.listRecent(10, 5).map((row) => row.sequence)).toEqual([4, 3, 2, 1]);
    });

    it('returns only rows below a cursor in the middle, newest first', () => {
      const { store } = createActorStore();
      insertMany(store, 5);
      expect(store.listRecent(10, 3).map((row) => row.sequence)).toEqual([2, 1]);
    });

    it('returns nothing for a cursor below the oldest row', () => {
      const { store } = createActorStore();
      insertMany(store, 5);
      expect(store.listRecent(10, 0)).toEqual([]);
      expect(store.listRecent(10, -1)).toEqual([]);
    });

    it('returns nothing for a cursor equal to 1', () => {
      const { store } = createActorStore();
      insertMany(store, 5);
      expect(store.listRecent(10, 1)).toEqual([]);
    });

    it('returns every row for a cursor beyond the newest', () => {
      const { store } = createActorStore();
      insertMany(store, 5);
      expect(store.listRecent(10, 99).map((row) => row.sequence)).toEqual([5, 4, 3, 2, 1]);
    });

    it('applies the limit to the rows below the cursor, newest first', () => {
      const { store } = createActorStore();
      insertMany(store, 10);
      expect(store.listRecent(3, 8).map((row) => row.sequence)).toEqual([7, 6, 5]);
      expect(store.listRecent(0, 8)).toEqual([]);
      expect(store.listRecent(100, 8)).toHaveLength(7);
    });

    it('excludes the cursor row itself', () => {
      const { store } = createActorStore();
      insertMany(store, 5);
      expect(store.listRecent(1, 4).map((row) => row.sequence)).toEqual([3]);
    });

    it('pages through every row exactly once when the cursor follows the last sequence', () => {
      const { store } = createActorStore();
      insertMany(store, 23);
      const seen: number[] = [];
      let page = store.listRecent(5);
      while (page.length > 0) {
        seen.push(...page.map((row) => row.sequence));
        page = store.listRecent(5, page.at(-1)!.sequence);
      }
      expect(seen).toEqual(Array.from({ length: 23 }, (_, index) => 23 - index));
    });

    it('skips sequence gaps left by prune', () => {
      const { store } = createActorStore();
      insertMany(store, 10);
      store.advanceFlushedSequence(10);
      store.prune(4);
      expect(store.listRecent(10, 9).map((row) => row.sequence)).toEqual([8, 7]);
      expect(store.listRecent(10, 3)).toEqual([]);
    });

    it('behaves like the uncursored query when the cursor is undefined', () => {
      const { store } = createActorStore();
      insertMany(store, 4);
      expect(store.listRecent(2, undefined)).toEqual(store.listRecent(2));
    });
  });

  describe('listUnflushed', () => {
    it('returns every row ascending when nothing is flushed', () => {
      const { store } = createActorStore();
      insertMany(store, 4);
      expect(store.listUnflushed(10).map((row) => row.sequence)).toEqual([1, 2, 3, 4]);
    });

    it('returns only rows above the watermark', () => {
      const { store } = createActorStore();
      insertMany(store, 5);
      store.advanceFlushedSequence(3);
      expect(store.listUnflushed(10).map((row) => row.sequence)).toEqual([4, 5]);
    });

    it('honors the limit from the lowest unflushed sequence', () => {
      const { store } = createActorStore();
      insertMany(store, 6);
      store.advanceFlushedSequence(1);
      expect(store.listUnflushed(2).map((row) => row.sequence)).toEqual([2, 3]);
    });

    it('returns an empty list when the watermark is at the newest row', () => {
      const { store } = createActorStore();
      insertMany(store, 3);
      store.advanceFlushedSequence(3);
      expect(store.listUnflushed(10)).toEqual([]);
    });

    it('returns an empty list when the watermark is beyond the newest row', () => {
      const { store } = createActorStore();
      insertMany(store, 3);
      store.advanceFlushedSequence(99);
      expect(store.listUnflushed(10)).toEqual([]);
    });

    it('returns full rows', () => {
      const { store } = createActorStore();
      store.insertEvent(event({ id: 'evt_1', idempotencyKey: 'key', data: { a: 1 } }));
      expect(store.listUnflushed(1)[0]).toMatchObject({
        sequence: 1,
        id: 'evt_1',
        idempotency_key: 'key',
        data: '{"a":1}',
      });
    });
  });

  describe('flushed sequence', () => {
    it('defaults to 0', () => {
      const { store } = createActorStore();
      expect(store.readFlushedSequence()).toBe(0);
    });

    it('reads back what was advanced', () => {
      const { store } = createActorStore();
      store.advanceFlushedSequence(42);
      expect(store.readFlushedSequence()).toBe(42);
    });

    it('overwrites on every advance, including backwards', () => {
      const { store } = createActorStore();
      store.advanceFlushedSequence(10);
      store.advanceFlushedSequence(20);
      expect(store.readFlushedSequence()).toBe(20);
      store.advanceFlushedSequence(5);
      expect(store.readFlushedSequence()).toBe(5);
    });

    it('returns a number, not the stored string', () => {
      const { store } = createActorStore();
      store.advanceFlushedSequence(7);
      expect(store.readFlushedSequence()).toBe(7);
      expect(typeof store.readFlushedSequence()).toBe('number');
    });
  });

  describe('prune', () => {
    it('returns 0 and deletes nothing from an empty store', () => {
      const { store } = createActorStore();
      expect(store.prune(10)).toBe(0);
    });

    it('returns 0 and deletes nothing when rows are at or below retained', () => {
      const { store } = createActorStore();
      insertMany(store, 5);
      store.advanceFlushedSequence(5);
      expect(store.prune(5)).toBe(0);
      expect(store.prune(10)).toBe(0);
      expect(store.listRecent(10)).toHaveLength(5);
    });

    it('deletes nothing when nothing is flushed, however far beyond the window', () => {
      const { store } = createActorStore();
      insertMany(store, 50);
      expect(store.prune(2)).toBe(0);
      expect(store.listRecent(100)).toHaveLength(50);
    });

    it('deletes only rows that are both flushed and below the retained window', () => {
      const { store } = createActorStore();
      insertMany(store, 10);
      store.advanceFlushedSequence(4);
      expect(store.prune(3)).toBe(4);
      expect(store.listUnflushed(100).map((row) => row.sequence)).toEqual([5, 6, 7, 8, 9, 10]);
      expect(store.listRecent(100).map((row) => row.sequence)).toEqual([10, 9, 8, 7, 6, 5]);
    });

    it('never deletes a row above the watermark even far beyond the window', () => {
      const { store } = createActorStore();
      insertMany(store, 1_000);
      store.advanceFlushedSequence(1);
      expect(store.prune(1)).toBe(1);
      expect(store.listRecent(2_000)).toHaveLength(999);
      expect(store.listUnflushed(2_000).map((row) => row.sequence)).toEqual(
        Array.from({ length: 999 }, (_, index) => index + 2)
      );
    });

    it('keeps exactly the retained newest rows when everything is flushed', () => {
      const { store } = createActorStore();
      insertMany(store, 10);
      store.advanceFlushedSequence(10);
      expect(store.prune(3)).toBe(7);
      expect(store.listRecent(100).map((row) => row.sequence)).toEqual([10, 9, 8]);
    });

    it('prunes exactly one row when there is one more row than retained', () => {
      const { store } = createActorStore();
      insertMany(store, 6);
      store.advanceFlushedSequence(6);
      expect(store.prune(5)).toBe(1);
      expect(store.listRecent(100).map((row) => row.sequence)).toEqual([6, 5, 4, 3, 2]);
    });

    it('prunes nothing on a second call with nothing new and still holds retained rows', () => {
      const { store } = createActorStore();
      insertMany(store, 10);
      store.advanceFlushedSequence(10);
      store.prune(3);
      expect(store.prune(3)).toBe(0);
      expect(store.listRecent(100)).toHaveLength(3);
    });

    it('measures the window by sequence, so each new flushed row evicts the oldest retained one', () => {
      const { store } = createActorStore();
      insertMany(store, 10);
      store.advanceFlushedSequence(10);
      expect(store.prune(2)).toBe(8);
      expect(store.insertEvent(event({ id: 'evt_next' }))).toBe(11);
      store.advanceFlushedSequence(11);
      expect(store.prune(2)).toBe(1);
      expect(store.listRecent(100).map((row) => row.sequence)).toEqual([11, 10]);
    });

    it('deletes every flushed row with a window of 0 and keeps sequences growing', () => {
      const { store } = createActorStore();
      insertMany(store, 3);
      store.advanceFlushedSequence(3);
      expect(store.prune(0)).toBe(3);
      expect(store.listRecent(100)).toEqual([]);
      expect(store.insertEvent(event({ id: 'evt_next' }))).toBe(4);
    });

    it('keeps unflushed rows beyond the window with a window of 0', () => {
      const { store } = createActorStore();
      insertMany(store, 3);
      store.advanceFlushedSequence(1);
      expect(store.prune(0)).toBe(1);
      expect(store.listRecent(100).map((row) => row.sequence)).toEqual([3, 2]);
    });

    it('does not touch projections or the watermark', () => {
      const { store } = createActorStore();
      insertMany(store, 10);
      store.recordProjection('app.opened', 10, '2026-08-27T00:00:00.000Z');
      store.advanceFlushedSequence(10);
      store.prune(2);
      expect(store.readFlushedSequence()).toBe(10);
      expect(store.listProjections()).toHaveLength(1);
    });
  });

  describe('identity', () => {
    it('is null on a fresh store', () => {
      const { store } = createActorStore();
      expect(store.readIdentity()).toBeNull();
    });

    it('round-trips through the meta table', () => {
      const { store } = createActorStore();
      store.writeIdentity({ tenantId: 12, subscriberId: 345, externalId: 'user_abc' });
      expect(store.readIdentity()).toEqual({ tenantId: 12, subscriberId: 345, externalId: 'user_abc' });
    });

    it('returns numbers for the ids', () => {
      const { store } = createActorStore();
      store.writeIdentity({ tenantId: 1, subscriberId: 2, externalId: 'x' });
      const identity = store.readIdentity();
      expect(typeof identity?.tenantId).toBe('number');
      expect(typeof identity?.subscriberId).toBe('number');
    });

    it('overwrites on a second write', () => {
      const { store } = createActorStore();
      store.writeIdentity({ tenantId: 1, subscriberId: 2, externalId: 'first' });
      store.writeIdentity({ tenantId: 3, subscriberId: 4, externalId: 'second' });
      expect(store.readIdentity()).toEqual({ tenantId: 3, subscriberId: 4, externalId: 'second' });
    });

    it('preserves an empty external id', () => {
      const { store } = createActorStore();
      store.writeIdentity({ tenantId: 1, subscriberId: 2, externalId: '' });
      expect(store.readIdentity()).toEqual({ tenantId: 1, subscriberId: 2, externalId: '' });
    });

    it('is null when any of the three keys is missing', () => {
      for (const missing of ['tenant_id', 'subscriber_id', 'external_id']) {
        const { store, database } = createActorStore();
        store.writeIdentity({ tenantId: 1, subscriberId: 2, externalId: 'x' });
        database.prepare('DELETE FROM meta WHERE key = ?').run(missing);
        expect(store.readIdentity(), missing).toBeNull();
      }
    });

    it('keeps the flushed sequence separate from the identity', () => {
      const { store } = createActorStore();
      store.advanceFlushedSequence(5);
      expect(store.readIdentity()).toBeNull();
      store.writeIdentity({ tenantId: 1, subscriberId: 2, externalId: 'x' });
      expect(store.readFlushedSequence()).toBe(5);
    });
  });

  describe('listNamedSince', () => {
    it('lists the occurrences of a name at or after an instant, newest first', () => {
      const { store } = createActorStore();
      store.insertEvent(event({ id: 'evt_1', name: '$app.opened', timestamp: '2026-08-27T00:00:00.000Z' }));
      store.insertEvent(event({ id: 'evt_2', name: '$app.opened', timestamp: '2026-08-27T00:05:00.000Z' }));
      store.insertEvent(
        event({ id: 'evt_3', name: '$session.ended', timestamp: '2026-08-27T00:06:00.000Z' })
      );
      store.insertEvent(event({ id: 'evt_4', name: '$app.opened', timestamp: '2026-08-27T00:07:00.000Z' }));

      expect(store.listNamedSince('$app.opened', '2026-08-27T00:05:00.000Z').map((row) => row.id)).toEqual([
        'evt_4',
        'evt_2',
      ]);
      expect(store.listNamedSince('$app.opened', '2026-08-27T00:08:00.000Z')).toEqual([]);
      expect(store.listNamedSince('$app.closed', '2026-08-27T00:00:00.000Z')).toEqual([]);
    });
  });
});
