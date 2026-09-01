import type { ActorEventInput, ActorIngestInput, ActorIngestOutcome } from '@buzzkit/api/actor/types';
import { MAX_EVENT_AGE_MS, MAX_EVENT_SKEW_MS } from '@buzzkit/api/api/events/constants';
import {
  recordSystemEvents,
  resolveTimestamp,
  subscriberAttributes,
  trackEvents,
} from '@buzzkit/api/api/events/track';
import type { EventInput } from '@buzzkit/api/api/events/types';
import { resolveSubscriptionEventData, upsertSubscriber } from '@buzzkit/api/api/subscribers/index';
import type { Tenant } from '@buzzkit/api/api/tenants/index';
import { subscriberActor } from '@buzzkit/api/libs/actor';
import { BadRequestError } from '@buzzkit/api/libs/error';
import type { Db } from '@buzzkit/database';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@buzzkit/api/api/subscribers/index', () => ({
  upsertSubscriber: vi.fn(),
  resolveSubscriptionEventData: vi.fn(),
}));
vi.mock('@buzzkit/api/libs/actor', () => ({ subscriberActor: vi.fn() }));
vi.mock('@buzzkit/api/libs/telemetry', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  currentTraceparent: vi.fn(() => '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01'),
}));

const now = new Date('2026-08-27T12:00:00.000Z');
const db = {} as Db;
const tenant = { id: 3 } as Tenant;

const subscribers: Record<
  string,
  { id: number; attributes: Record<string, unknown> | null; created: boolean }
> = {
  user_a: { id: 7, attributes: { plan: 'pro' }, created: false },
  user_b: { id: 8, attributes: null, created: false },
  user_new: { id: 9, attributes: { $country: 'DE' }, created: true },
};

const ingest = vi.fn(
  async (input: ActorIngestInput): Promise<ActorIngestOutcome[]> =>
    input.events.map((event, index) => ({
      id: event.id,
      sequence: index + 1,
      status: event.idempotencyKey === 'dup' ? 'duplicate' : 'accepted',
    }))
);

const ingestedEvents = (call = 0): ActorEventInput[] => ingest.mock.calls[call]![0].events;

function expectBadRequest(error: unknown, code: string, param: string) {
  expect(error).toBeInstanceOf(BadRequestError);
  const typed = error as InstanceType<typeof BadRequestError>;
  expect(typed.code).toBe(code);
  expect(typed.param).toBe(param);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.mocked(upsertSubscriber).mockImplementation(async (_db, _tenantId, externalId) => {
    const entry = subscribers[externalId]!;
    return {
      subscriber: { id: entry.id, externalId, attributes: entry.attributes } as never,
      created: entry.created,
      changed: entry.created,
    };
  });
  vi.mocked(subscriberActor).mockImplementation(() => ({ ingest }) as never);
});

afterEach(() => {
  vi.useRealTimers();
  vi.mocked(upsertSubscriber).mockReset();
  vi.mocked(subscriberActor).mockReset();
  vi.mocked(resolveSubscriptionEventData).mockReset();
  ingest.mockClear();
});

describe('resolveTimestamp', () => {
  it('defaults to now with millisecond precision', () => {
    expect(resolveTimestamp(undefined, now)).toBe('2026-08-27T12:00:00.000Z');
    expect(resolveTimestamp('', now)).toBe('2026-08-27T12:00:00.000Z');
  });

  it('rejects anything that does not parse', () => {
    for (const value of ['yesterday', '2026-13-45T00:00:00Z', 'NaN']) {
      let thrown: unknown;
      try {
        resolveTimestamp(value, now);
      } catch (error) {
        thrown = error;
      }
      expectBadRequest(thrown, 'invalid_timestamp', 'timestamp');
      expect((thrown as Error).message).toContain('ISO 8601');
    }
  });

  it('accepts exactly seven days ago and rejects one millisecond older', () => {
    const boundary = new Date(now.getTime() - MAX_EVENT_AGE_MS);
    expect(resolveTimestamp(boundary.toISOString(), now)).toBe('2026-08-20T12:00:00.000Z');
    let thrown: unknown;
    try {
      resolveTimestamp(new Date(boundary.getTime() - 1).toISOString(), now);
    } catch (error) {
      thrown = error;
    }
    expectBadRequest(thrown, 'invalid_timestamp', 'timestamp');
    expect((thrown as Error).message).toContain('7 days');
  });

  it('accepts exactly one hour ahead and rejects one millisecond further', () => {
    const boundary = new Date(now.getTime() + MAX_EVENT_SKEW_MS);
    expect(resolveTimestamp(boundary.toISOString(), now)).toBe('2026-08-27T13:00:00.000Z');
    let thrown: unknown;
    try {
      resolveTimestamp(new Date(boundary.getTime() + 1).toISOString(), now);
    } catch (error) {
      thrown = error;
    }
    expectBadRequest(thrown, 'invalid_timestamp', 'timestamp');
    expect((thrown as Error).message).toContain('future');
  });

  it('normalises offsets and second precision to UTC with milliseconds', () => {
    expect(resolveTimestamp('2026-08-27T13:30:00+02:00', now)).toBe('2026-08-27T11:30:00.000Z');
    expect(resolveTimestamp('2026-08-27T11:30:00Z', now)).toBe('2026-08-27T11:30:00.000Z');
    expect(resolveTimestamp('2026-08-27T11:30:00.5Z', now)).toBe('2026-08-27T11:30:00.500Z');
  });
});

describe('subscriberAttributes', () => {
  it('returns the attributes and falls back to an empty object', () => {
    expect(subscriberAttributes({ attributes: { plan: 'pro' } })).toEqual({ plan: 'pro' });
    expect(subscriberAttributes({ attributes: null })).toEqual({});
  });
});

describe('trackEvents', () => {
  it('stamps a single event and returns the actor outcome', async () => {
    const results = await trackEvents(db, tenant, {
      source: 'server',
      events: [{ externalId: 'user_a', name: 'order.paid', data: { total: 42 } }],
    });

    expect(upsertSubscriber).toHaveBeenCalledTimes(1);
    expect(upsertSubscriber).toHaveBeenCalledWith(db, 3, 'user_a', {
      verifiedNow: undefined,
      systemAttributes: undefined,
    });
    expect(subscriberActor).toHaveBeenCalledWith(3, 7);
    expect(ingest).toHaveBeenCalledTimes(1);
    expect(ingest.mock.calls[0]![0]).toMatchObject({
      tenantId: 3,
      subscriberId: 7,
      externalId: 'user_a',
      traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
    });

    const [event] = ingestedEvents();
    expect(event).toEqual({
      id: expect.stringMatching(/^evt_[0-9a-f-]{36}$/),
      idempotencyKey: null,
      name: 'order.paid',
      source: 'server',
      timestamp: '2026-08-27T12:00:00.000Z',
      receivedAt: '2026-08-27T12:00:00.000Z',
      data: { total: 42 },
    });

    expect(results).toEqual([
      {
        id: event!.id,
        sequence: 1,
        externalId: 'user_a',
        name: 'order.paid',
        source: 'server',
        timestamp: '2026-08-27T12:00:00.000Z',
        receivedAt: '2026-08-27T12:00:00.000Z',
        data: { total: 42 },
        status: 'accepted',
      },
    ]);
  });

  it('passes verifiedNow and system attributes through to the upsert', async () => {
    await trackEvents(db, tenant, {
      source: 'ios',
      events: [{ externalId: 'user_a', name: 'tap' }],
      verifiedNow: true,
      systemAttributes: { $country: 'DE' },
    });
    expect(upsertSubscriber).toHaveBeenCalledWith(db, 3, 'user_a', {
      verifiedNow: true,
      systemAttributes: { $country: 'DE' },
    });
  });

  it('keeps the caller id as the idempotency key and nulls it when absent', async () => {
    await trackEvents(db, tenant, {
      source: 'server',
      events: [
        { externalId: 'user_a', name: 'a', id: 'client-1' },
        { externalId: 'user_a', name: 'b' },
      ],
    });
    expect(ingestedEvents().map((event) => event.idempotencyKey)).toEqual(['client-1', null]);
  });

  it('defaults data to an empty object and uses the caller timestamp when given', async () => {
    await trackEvents(db, tenant, {
      source: 'server',
      events: [{ externalId: 'user_a', name: 'a', timestamp: '2026-08-27T10:00:00+01:00' }],
    });
    expect(ingestedEvents()[0]).toMatchObject({
      data: {},
      timestamp: '2026-08-27T09:00:00.000Z',
      receivedAt: '2026-08-27T12:00:00.000Z',
    });
  });

  it('groups by externalId, ingests once per subscriber and answers in the caller order', async () => {
    const results = await trackEvents(db, tenant, {
      source: 'server',
      events: [
        { externalId: 'user_a', name: 'first' },
        { externalId: 'user_b', name: 'second' },
        { externalId: 'user_a', name: 'third' },
      ],
    });

    expect(upsertSubscriber).toHaveBeenCalledTimes(2);
    expect(vi.mocked(upsertSubscriber).mock.calls.map((call) => call[2])).toEqual(['user_a', 'user_b']);
    expect(ingest).toHaveBeenCalledTimes(2);
    expect(ingestedEvents(0).map((event) => event.name)).toEqual(['first', 'third']);
    expect(ingestedEvents(1).map((event) => event.name)).toEqual(['second']);
    expect(vi.mocked(subscriberActor).mock.calls).toEqual([
      [3, 7],
      [3, 8],
    ]);

    expect(results.map((result) => [result.externalId, result.name, result.sequence])).toEqual([
      ['user_a', 'first', 1],
      ['user_b', 'second', 1],
      ['user_a', 'third', 2],
    ]);
  });

  it('prepends a system subscriber.created event when the upsert created the subscriber', async () => {
    const results = await trackEvents(db, tenant, {
      source: 'ios',
      events: [{ externalId: 'user_new', name: '$app.opened' }],
    });

    const events = ingestedEvents();
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({
      id: expect.stringMatching(/^evt_/),
      idempotencyKey: null,
      name: '$subscriber.created',
      source: 'system',
      timestamp: '2026-08-27T12:00:00.000Z',
      receivedAt: '2026-08-27T12:00:00.000Z',
      data: { externalId: 'user_new', attributes: { $country: 'DE' } },
    });
    expect(events[1]).toMatchObject({ name: '$app.opened', source: 'ios' });
    expect(events[0]!.id).not.toBe(events[1]!.id);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ name: '$app.opened', sequence: 2, status: 'accepted' });
  });

  it('does not prepend anything for an existing subscriber', async () => {
    await trackEvents(db, tenant, { source: 'server', events: [{ externalId: 'user_a', name: 'a' }] });
    expect(ingestedEvents().map((event) => event.name)).toEqual(['a']);
  });

  it('reports duplicates per outcome', async () => {
    const results = await trackEvents(db, tenant, {
      source: 'server',
      events: [
        { externalId: 'user_a', name: 'a', id: 'dup' },
        { externalId: 'user_a', name: 'b', id: 'fresh' },
      ],
    });
    expect(results.map((result) => result.status)).toEqual(['duplicate', 'accepted']);
  });

  it('mints distinct ids for every event of one call', async () => {
    const results = await trackEvents(db, tenant, {
      source: 'server',
      events: Array.from({ length: 20 }, (_, index) => ({ externalId: 'user_a', name: `e${index}` })),
    });
    const ids = results.map((result) => result.id);
    expect(new Set(ids).size).toBe(20);
    expect([...ids].sort()).toEqual(ids);
  });

  it('rejects oversized data before touching the subscriber or the actor', async () => {
    let thrown: unknown;
    try {
      await trackEvents(db, tenant, {
        source: 'server',
        events: [{ externalId: 'user_a', name: 'a', data: { blob: 'x'.repeat(8 * 1024) } }],
      });
    } catch (error) {
      thrown = error;
    }
    expectBadRequest(thrown, 'event_data_too_large', 'data');
    expect(upsertSubscriber).not.toHaveBeenCalled();
    expect(subscriberActor).not.toHaveBeenCalled();
    expect(ingest).not.toHaveBeenCalled();
  });

  it('accepts data at exactly the limit', async () => {
    const data = { blob: 'x'.repeat(8 * 1024 - '{"blob":""}'.length) };
    expect(JSON.stringify(data).length).toBe(8 * 1024);
    await expect(
      trackEvents(db, tenant, { source: 'server', events: [{ externalId: 'user_a', name: 'a', data }] })
    ).resolves.toHaveLength(1);
  });

  it('rejects reserved names before touching the subscriber or the actor', async () => {
    const cases: Array<[EventInput['name'], 'server' | 'ios']> = [
      ['$app.opened', 'server'],
      ['$subscriber.created', 'ios'],
      ['$anything', 'ios'],
    ];
    for (const [name, source] of cases) {
      let thrown: unknown;
      try {
        await trackEvents(db, tenant, { source, events: [{ externalId: 'user_a', name }] });
      } catch (error) {
        thrown = error;
      }
      expectBadRequest(thrown, 'reserved_event', 'name');
    }
    expect(upsertSubscriber).not.toHaveBeenCalled();
    expect(ingest).not.toHaveBeenCalled();
  });

  it('surfaces a subscriber failure and still lets the other subscribers ingest', async () => {
    vi.mocked(upsertSubscriber).mockImplementation(async (_db, _tenantId, externalId) => {
      if (externalId === 'user_b') throw new Error('database unavailable');
      return { subscriber: { id: 7, externalId, attributes: null } as never, created: false, changed: false };
    });
    await expect(
      trackEvents(db, tenant, {
        source: 'server',
        events: [
          { externalId: 'user_a', name: 'a' },
          { externalId: 'user_b', name: 'b' },
        ],
      })
    ).rejects.toThrow('database unavailable');
    expect(ingest).toHaveBeenCalledTimes(1);
    expect(ingestedEvents().map((event) => event.name)).toEqual(['a']);
  });

  it('rejects the whole batch when a later event is invalid', async () => {
    let thrown: unknown;
    try {
      await trackEvents(db, tenant, {
        source: 'server',
        events: [
          { externalId: 'user_a', name: 'fine' },
          { externalId: 'user_b', name: 'late', timestamp: '2020-01-01T00:00:00Z' },
        ],
      });
    } catch (error) {
      thrown = error;
    }
    expectBadRequest(thrown, 'invalid_timestamp', 'timestamp');
    expect(upsertSubscriber).not.toHaveBeenCalled();
    expect(ingest).not.toHaveBeenCalled();
  });

  it('returns an empty list for an empty batch without touching anything', async () => {
    await expect(trackEvents(db, tenant, { source: 'server', events: [] })).resolves.toEqual([]);
    expect(upsertSubscriber).not.toHaveBeenCalled();
    expect(ingest).not.toHaveBeenCalled();
  });
});

describe('recordSystemEvents', () => {
  const subscriber = { id: 7, externalId: 'user_a' };

  it('never touches the actor for an empty list', async () => {
    await recordSystemEvents(3, subscriber, []);
    expect(subscriberActor).not.toHaveBeenCalled();
    expect(ingest).not.toHaveBeenCalled();
  });

  it('prefixes the name, stamps the system source and ingests with the trace context', async () => {
    const data = { externalId: 'user_a', channel: 'push', platform: 'ios', endpoint: 'tok', enabled: true };
    await recordSystemEvents(3, subscriber, [{ name: 'subscription.registered', data }]);

    expect(subscriberActor).toHaveBeenCalledWith(3, 7);
    expect(ingest).toHaveBeenCalledTimes(1);
    expect(ingest.mock.calls[0]![0]).toEqual({
      tenantId: 3,
      subscriberId: 7,
      externalId: 'user_a',
      traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
      events: [
        {
          id: expect.stringMatching(/^evt_[0-9a-f-]{36}$/),
          idempotencyKey: null,
          name: '$subscription.registered',
          source: 'system',
          timestamp: '2026-08-27T12:00:00.000Z',
          receivedAt: '2026-08-27T12:00:00.000Z',
          data,
        },
      ],
    });
  });

  it('keeps an explicit timestamp verbatim and mints ordered ids for a list', async () => {
    await recordSystemEvents(3, subscriber, [
      { name: 'subscriber.deleted', data: { externalId: 'user_a' }, timestamp: '2026-08-27T11:00:00.000Z' },
      { name: 'preferences.updated', data: { changes: { marketing: false } } },
    ]);
    const events = ingestedEvents();
    expect(events.map((event) => [event.name, event.timestamp])).toEqual([
      ['$subscriber.deleted', '2026-08-27T11:00:00.000Z'],
      ['$preferences.updated', '2026-08-27T12:00:00.000Z'],
    ]);
    expect(events[0]!.id < events[1]!.id).toBe(true);
    expect(events.every((event) => event.receivedAt === '2026-08-27T12:00:00.000Z')).toBe(true);
  });
});
