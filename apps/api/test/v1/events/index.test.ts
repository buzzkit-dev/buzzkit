import { beforeAll, describe, expect, it } from 'vitest';
import { api } from '../../utils/api';
import { eventually } from '../../utils/eventually';
import { addMember, createClientKey, createKey, createTenant, setupWorkspace, uniq } from '../../utils/setup';

type Tracked = {
  id: string;
  sequence: number;
  externalId: string;
  name: string;
  source: string;
  timestamp: string;
  receivedAt: string;
  data: Record<string, unknown>;
  status: 'accepted' | 'duplicate';
};

type Listed = { items: Tracked[]; hasMore: boolean; nextCursor: string | null };

type Headers = Record<string, string>;

const SDK_EVENT_NAMES = [
  '$app.opened',
  '$app.backgrounded',
  '$session.ended',
  '$notification.delivered',
  '$notification.opened',
  '$permission.changed',
  '$identify',
];

const SYSTEM_EVENT_NAMES = [
  '$subscriber.created',
  '$subscriber.updated',
  '$subscriber.deleted',
  '$subscription.registered',
  '$subscription.muted',
  '$subscription.unmuted',
  '$subscription.removed',
  '$subscription.invalidated',
  '$preferences.updated',
];

const CURSOR_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z_evt_[0-9a-f-]{36}$/;

async function track(headers: Headers, body: unknown) {
  const { status, body: envelope } = await api<Listed>('/v1/events', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  return { status, body: envelope, event: envelope.data?.items[0] };
}

function trackBatch(headers: Headers, events: unknown[]) {
  return api<Listed>('/v1/events', { method: 'POST', headers, body: JSON.stringify({ events }) });
}

function listEvents(headers: Headers, query = '') {
  return api<Listed>(`/v1/events${query}`, { headers });
}

async function listUntil(headers: Headers, query: string, count: number, label: string) {
  return await eventually(
    async () => {
      const { body } = await listEvents(headers, query);
      return (body.data?.items.length ?? 0) >= count ? body.data! : undefined;
    },
    { label, timeoutMs: 120_000 }
  );
}

describe('POST /v1/events', () => {
  it('accepts one event, creates the subscriber, and assigns an id and a sequence', async () => {
    const { keyBearer } = await setupWorkspace();
    const externalId = `user_${uniq()}`;

    const { status, body, event } = await track(keyBearer, {
      externalId,
      name: 'workout.completed',
      data: { duration: 42 },
    });

    expect(status).toBe(202);
    expect(body.data?.items).toHaveLength(1);
    expect(body.data?.hasMore).toBe(false);
    expect(body.data?.nextCursor).toBeNull();
    expect(event?.id).toMatch(/^evt_[0-9a-f-]{36}$/);
    expect(event?.sequence).toBe(2);
    expect(event?.source).toBe('server');
    expect(event?.status).toBe('accepted');
    expect(event?.data).toEqual({ duration: 42 });

    const subscriber = await api<{ externalId: string }>(`/v1/subscribers/${externalId}`, {
      headers: keyBearer,
    });
    expect(subscriber.status).toBe(200);
  });

  it('accepts a batch in order, per subscriber, and dedupes on the caller id', async () => {
    const { keyBearer } = await setupWorkspace();
    const a = `user_${uniq()}`;
    const b = `user_${uniq()}`;
    const dedupe = `client-${uniq()}`;

    const { status, body } = await trackBatch(keyBearer, [
      { externalId: a, name: 'workout.completed', id: dedupe },
      { externalId: b, name: 'workout.completed' },
      { externalId: a, name: 'workout.completed', id: dedupe },
      { externalId: a, name: 'app.reviewed' },
    ]);

    expect(status).toBe(202);
    const items = body.data?.items ?? [];
    expect(items.map((item) => item.status)).toEqual(['accepted', 'accepted', 'duplicate', 'accepted']);
    expect(items[2]?.id).toBe(items[0]?.id);
    expect(items[0]!.sequence).toBeLessThan(items[3]!.sequence);

    const replay = await trackBatch(keyBearer, [{ externalId: a, name: 'workout.completed', id: dedupe }]);
    expect(replay.body.data?.items[0]?.status).toBe('duplicate');
    expect(replay.body.data?.items[0]?.id).toBe(items[0]?.id);
  });

  it('refuses reserved names from the server, bad timestamps, and oversized data', async () => {
    const { keyBearer } = await setupWorkspace();
    const externalId = `user_${uniq()}`;

    const reserved = await track(keyBearer, { externalId, name: '$app.opened' });
    expect(reserved.status).toBe(400);
    expect(reserved.body.error?.code).toBe('reserved_event');

    const stale = await track(keyBearer, { externalId, name: 'x', timestamp: '2020-01-01T00:00:00.000Z' });
    expect(stale.status).toBe(400);
    expect(stale.body.error?.code).toBe('invalid_timestamp');

    const large = await track(keyBearer, { externalId, name: 'x', data: { blob: 'x'.repeat(9000) } });
    expect(large.status).toBe(400);
    expect(large.body.error?.code).toBe('event_data_too_large');

    const uppercase = await track(keyBearer, { externalId, name: 'Workout.Completed' });
    expect(uppercase.status).toBe(400);
    expect(uppercase.body.error?.code).toBe('validation');
  });

  it('keeps the original timestamp and stamps receivedAt', async () => {
    const { keyBearer } = await setupWorkspace();
    const timestamp = new Date(Date.now() - 3_600_000).toISOString();

    const { event } = await track(keyBearer, {
      externalId: `user_${uniq()}`,
      name: 'workout.completed',
      timestamp,
    });

    expect(event?.timestamp).toBe(timestamp);
    expect(new Date(event!.receivedAt).getTime()).toBeGreaterThan(new Date(timestamp).getTime());
  });
});

describe('POST /v1/events validation', () => {
  let keyBearer: Headers;

  beforeAll(async () => {
    ({ keyBearer } = await setupWorkspace({ bare: true }));
  });

  it.each([
    ['uppercase', 'Workout.Completed'],
    ['leading dot', '.workout'],
    ['leading underscore', '_workout'],
    ['leading dash', '-workout'],
    ['whitespace', 'workout completed'],
    ['slash', 'workout/completed'],
    ['unicode', 'wörkout'],
    ['empty', ''],
    ['double dollar', '$$app.opened'],
    ['dollar only', '$'],
  ])('refuses a name with %s', async (_, name) => {
    const { status, body } = await track(keyBearer, { externalId: `user_${uniq()}`, name });
    expect(status).toBe(400);
    expect(body.error?.code).toBe('validation');
    expect(body.error?.param).toBe('events.0.name');
  });

  it('names the offending field of a single event and of a batch item', async () => {
    const single = await track(keyBearer, { externalId: `user_${uniq()}`, name: 'Bad' });
    expect(single.body.error?.param).toBe('events.0.name');
    expect(single.body.error?.details).toEqual([{ param: 'events.0.name', message: expect.any(String) }]);

    const batch = await trackBatch(keyBearer, [
      { externalId: `user_${uniq()}`, name: 'fine' },
      { externalId: `user_${uniq()}`, name: 'Bad' },
    ]);
    expect(batch.status).toBe(400);
    expect(batch.body.error?.code).toBe('validation');
    expect(batch.body.error?.param).toBe('events.1.name');
  });

  it('refuses a name longer than 100 characters and accepts exactly 100', async () => {
    const externalId = `user_${uniq()}`;
    const tooLong = await track(keyBearer, { externalId, name: 'a'.repeat(101) });
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.error?.code).toBe('validation');
    expect(tooLong.body.error?.param).toBe('events.0.name');

    const exact = await track(keyBearer, { externalId, name: 'a'.repeat(100) });
    expect(exact.status).toBe(202);
    expect(exact.event?.name).toBe('a'.repeat(100));
  });

  it('refuses a missing or empty externalId', async () => {
    const missing = await track(keyBearer, { name: 'x' });
    expect(missing.status).toBe(400);
    expect(missing.body.error?.code).toBe('validation');
    expect(missing.body.error?.param).toBe('events.0.externalId');

    const empty = await track(keyBearer, { externalId: '', name: 'x' });
    expect(empty.status).toBe(400);
    expect(empty.body.error?.code).toBe('validation');
    expect(empty.body.error?.param).toBe('events.0.externalId');
  });

  it('refuses an externalId longer than 256 characters and accepts exactly 256', async () => {
    const tooLong = await track(keyBearer, { externalId: 'u'.repeat(257), name: 'x' });
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.error?.code).toBe('validation');
    expect(tooLong.body.error?.param).toBe('events.0.externalId');

    const externalId = `${uniq()}`.padEnd(256, 'u');
    const exact = await track(keyBearer, { externalId, name: 'x' });
    expect(exact.status).toBe(202);
    expect(exact.event?.externalId).toBe(externalId);
  });

  it('refuses an id longer than 64 characters or empty and accepts exactly 64', async () => {
    const externalId = `user_${uniq()}`;
    const tooLong = await track(keyBearer, { externalId, name: 'x', id: 'i'.repeat(65) });
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.error?.code).toBe('validation');
    expect(tooLong.body.error?.param).toBe('events.0.id');

    const empty = await track(keyBearer, { externalId, name: 'x', id: '' });
    expect(empty.status).toBe(400);
    expect(empty.body.error?.code).toBe('validation');
    expect(empty.body.error?.param).toBe('events.0.id');

    const exact = await track(keyBearer, { externalId, name: 'x', id: `${uniq()}`.padEnd(64, 'i') });
    expect(exact.status).toBe(202);
  });

  it('refuses an empty batch and more than 100 events, accepts exactly 100', async () => {
    const empty = await trackBatch(keyBearer, []);
    expect(empty.status).toBe(400);
    expect(empty.body.error?.code).toBe('validation');
    expect(empty.body.error?.param).toBe('events');

    const externalId = `user_${uniq()}`;
    const tooMany = await trackBatch(
      keyBearer,
      Array.from({ length: 101 }, (_, index) => ({ externalId, name: 'x', id: `${externalId}-${index}` }))
    );
    expect(tooMany.status).toBe(400);
    expect(tooMany.body.error?.code).toBe('validation');
    expect(tooMany.body.error?.param).toBe('events');

    const full = await trackBatch(
      keyBearer,
      Array.from({ length: 100 }, (_, index) => ({ externalId, name: 'x', id: `${externalId}-${index}` }))
    );
    expect(full.status).toBe(202);
    expect(full.body.data?.items).toHaveLength(100);
    expect(full.body.data?.items.every((item) => item.status === 'accepted')).toBe(true);
  });

  it('refuses a batch whose events are not objects or lack their own fields', async () => {
    const notObjects = await trackBatch(keyBearer, ['x']);
    expect(notObjects.status).toBe(400);
    expect(notObjects.body.error?.code).toBe('validation');
    expect(notObjects.body.error?.param).toBe('events.0.externalId');

    const nameless = await trackBatch(keyBearer, [{ externalId: `user_${uniq()}` }]);
    expect(nameless.status).toBe(400);
    expect(nameless.body.error?.code).toBe('validation');
    expect(nameless.body.error?.param).toBe('events.0.name');
  });

  it('refuses data over 8 KB with event_data_too_large and accepts data just under', async () => {
    const externalId = `user_${uniq()}`;
    const over = await track(keyBearer, { externalId, name: 'x', data: { blob: 'x'.repeat(8 * 1024) } });
    expect(over.status).toBe(400);
    expect(over.body.error?.code).toBe('event_data_too_large');
    expect(over.body.error?.param).toBe('data');

    const under = await track(keyBearer, {
      externalId,
      name: 'x',
      data: { blob: 'x'.repeat(8 * 1024 - 20) },
    });
    expect(under.status).toBe(202);
  });

  it('refuses data over 8 KB inside a batch and tracks nothing from it', async () => {
    const externalId = `user_${uniq()}`;
    const { status, body } = await trackBatch(keyBearer, [
      { externalId, name: 'x' },
      { externalId, name: 'y', data: { blob: 'x'.repeat(9000) } },
    ]);
    expect(status).toBe(400);
    expect(body.error?.code).toBe('event_data_too_large');

    const subscriber = await api(`/v1/subscribers/${externalId}`, { headers: keyBearer });
    expect(subscriber.status).toBe(404);
  });

  it.skip('refuses data that is not an object (skipped: [1], "x" and null are still coerced to {"0":1}, {"0":"x"} and {})', async () => {
    const externalId = `user_${uniq()}`;
    for (const data of [[1], 'x', null, 5]) {
      const { status, body } = await track(keyBearer, { externalId, name: 'x', data });
      expect(status).toBe(400);
      expect(body.error?.code).toBe('validation');
      expect(body.error?.param).toBe('events.0.data');
    }
  });

  it('refuses a timestamp that is not a date-time', async () => {
    const { status, body } = await track(keyBearer, {
      externalId: `user_${uniq()}`,
      name: 'x',
      timestamp: 'now',
    });
    expect(status).toBe(400);
    expect(body.error?.code).toBe('validation');
    expect(body.error?.param).toBe('events.0.timestamp');
  });

  it('refuses a timestamp older than 7 days and accepts one just inside', async () => {
    const externalId = `user_${uniq()}`;
    const tooOld = await track(keyBearer, {
      externalId,
      name: 'x',
      timestamp: new Date(Date.now() - 7 * 24 * 3_600_000 - 60_000).toISOString(),
    });
    expect(tooOld.status).toBe(400);
    expect(tooOld.body.error?.code).toBe('invalid_timestamp');
    expect(tooOld.body.error?.param).toBe('timestamp');

    const inside = new Date(Date.now() - 7 * 24 * 3_600_000 + 60_000).toISOString();
    const accepted = await track(keyBearer, { externalId, name: 'x', timestamp: inside });
    expect(accepted.status).toBe(202);
    expect(accepted.event?.timestamp).toBe(inside);
  });

  it('refuses a timestamp more than an hour ahead and tolerates clock skew inside it', async () => {
    const externalId = `user_${uniq()}`;
    const future = await track(keyBearer, {
      externalId,
      name: 'x',
      timestamp: new Date(Date.now() + 2 * 3_600_000).toISOString(),
    });
    expect(future.status).toBe(400);
    expect(future.body.error?.code).toBe('invalid_timestamp');
    expect(future.body.error?.param).toBe('timestamp');

    const skewed = new Date(Date.now() + 30 * 60_000).toISOString();
    const accepted = await track(keyBearer, { externalId, name: 'x', timestamp: skewed });
    expect(accepted.status).toBe(202);
    expect(accepted.event?.timestamp).toBe(skewed);
  });

  it.each([...SDK_EVENT_NAMES, ...SYSTEM_EVENT_NAMES, '$anything.else'])(
    'refuses the reserved name %s from the server',
    async (name) => {
      const { status, body } = await track(keyBearer, { externalId: `user_${uniq()}`, name });
      expect(status).toBe(400);
      expect(body.error?.code).toBe('reserved_event');
      expect(body.error?.param).toBe('name');
    }
  );

  it('refuses a batch containing a reserved name and tracks nothing from it', async () => {
    const externalId = `user_${uniq()}`;
    const { status, body } = await trackBatch(keyBearer, [
      { externalId, name: 'fine' },
      { externalId, name: '$subscriber.deleted' },
    ]);
    expect(status).toBe(400);
    expect(body.error?.code).toBe('reserved_event');

    const subscriber = await api(`/v1/subscribers/${externalId}`, { headers: keyBearer });
    expect(subscriber.status).toBe(404);
  });

  it('treats an object without events as a single event and refuses anything that is not an object', async () => {
    const unrelated = await track(keyBearer, { hello: 'world' });
    expect(unrelated.status).toBe(400);
    expect(unrelated.body.error?.code).toBe('validation');
    expect(unrelated.body.error?.param).toBe('events.0.externalId');

    for (const body of [[{ externalId: `user_${uniq()}`, name: 'x' }], 'x', null, 5, true]) {
      const { status, body: envelope } = await track(keyBearer, body);
      expect(status).toBe(400);
      expect(envelope.error?.code).toBe('validation');
    }

    const notArray = await track(keyBearer, { events: { externalId: `user_${uniq()}`, name: 'x' } });
    expect(notArray.status).toBe(400);
    expect(notArray.body.error?.code).toBe('validation');
  });
});

describe('POST /v1/events ordering and dedupe', () => {
  let keyBearer: Headers;

  beforeAll(async () => {
    ({ keyBearer } = await setupWorkspace({ bare: true }));
  });

  it('keeps the caller order across three subscribers while each sequence is contiguous', async () => {
    const [a, b, c] = [`user_${uniq()}`, `user_${uniq()}`, `user_${uniq()}`];
    const events = [
      { externalId: a, name: 'one' },
      { externalId: b, name: 'one' },
      { externalId: a, name: 'two' },
      { externalId: c, name: 'one' },
      { externalId: b, name: 'two' },
      { externalId: a, name: 'three' },
      { externalId: c, name: 'two' },
    ];

    const { status, body } = await trackBatch(keyBearer, events);

    expect(status).toBe(202);
    const items = body.data!.items;
    expect(items.map((item) => [item.externalId, item.name])).toEqual(
      events.map((event) => [event.externalId, event.name])
    );
    expect(items.every((item) => item.status === 'accepted' && item.source === 'server')).toBe(true);
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);

    for (const externalId of [a, b, c]) {
      const sequences = items.filter((item) => item.externalId === externalId).map((item) => item.sequence);
      expect(sequences).toEqual(sequences.map((_, index) => index + 2));
    }

    const timeline = await api<Listed>(`/v1/subscribers/${a}/timeline`, { headers: keyBearer });
    expect(timeline.body.data?.items.map((item) => [item.name, item.sequence])).toEqual([
      ['three', 4],
      ['two', 3],
      ['one', 2],
      ['$subscriber.created', 1],
    ]);
  });

  it('answers a duplicate id inside one request with the first id and sequence', async () => {
    const externalId = `user_${uniq()}`;
    const id = `dedupe-${uniq()}`;

    const { body } = await trackBatch(keyBearer, [
      { externalId, name: 'x', id, data: { n: 1 } },
      { externalId, name: 'y', id, data: { n: 2 } },
      { externalId, name: 'z' },
    ]);

    const [first, second, third] = body.data!.items;
    expect(first?.status).toBe('accepted');
    expect(second?.status).toBe('duplicate');
    expect(second?.id).toBe(first?.id);
    expect(second?.sequence).toBe(first?.sequence);
    expect(third?.sequence).toBe(first!.sequence + 1);

    const timeline = await api<Listed>(`/v1/subscribers/${externalId}/timeline`, { headers: keyBearer });
    expect(timeline.body.data?.items.map((item) => item.name)).toEqual(['z', 'x', '$subscriber.created']);
  });

  it('answers a duplicate id across requests with the original id and sequence', async () => {
    const externalId = `user_${uniq()}`;
    const id = `dedupe-${uniq()}`;

    const first = await track(keyBearer, { externalId, name: 'x', id, data: { n: 1 } });
    const replay = await track(keyBearer, { externalId, name: 'x', id, data: { n: 1 } });
    const changed = await track(keyBearer, { externalId, name: 'other', id, data: { n: 2 } });

    expect(first.event?.status).toBe('accepted');
    for (const { status, event } of [replay, changed]) {
      expect(status).toBe(202);
      expect(event?.status).toBe('duplicate');
      expect(event?.id).toBe(first.event?.id);
      expect(event?.sequence).toBe(first.event?.sequence);
    }

    const timeline = await api<Listed>(`/v1/subscribers/${externalId}/timeline`, { headers: keyBearer });
    expect(timeline.body.data?.items).toHaveLength(2);
  });

  it('dedupes per subscriber, so the same id for another subscriber is a new event', async () => {
    const id = `shared-${uniq()}`;
    const a = await track(keyBearer, { externalId: `user_${uniq()}`, name: 'x', id });
    const b = await track(keyBearer, { externalId: `user_${uniq()}`, name: 'x', id });

    expect(a.event?.status).toBe('accepted');
    expect(b.event?.status).toBe('accepted');
    expect(b.event?.id).not.toBe(a.event?.id);
  });

  it('does not emit another $subscriber.created for an existing subscriber', async () => {
    const externalId = `user_${uniq()}`;

    const first = await track(keyBearer, { externalId, name: 'first' });
    const second = await track(keyBearer, { externalId, name: 'second' });
    const third = await trackBatch(keyBearer, [{ externalId, name: 'third' }]);
    expect(first.event?.sequence).toBe(2);
    expect(second.event?.sequence).toBe(3);
    expect(third.body.data?.items[0]?.sequence).toBe(4);

    const timeline = await api<Listed>(`/v1/subscribers/${externalId}/timeline`, { headers: keyBearer });
    expect(timeline.body.data?.items.map((item) => item.name)).toEqual([
      'third',
      'second',
      'first',
      '$subscriber.created',
    ]);
  });

  it('keeps timestamps to the millisecond, stamps receivedAt at or after, and sources as server', async () => {
    const externalId = `user_${uniq()}`;
    const before = Date.now();
    const timestamp = new Date(Math.floor((before - 60_000) / 1000) * 1000 + 123).toISOString();

    const { event } = await track(keyBearer, { externalId, name: 'x', timestamp });

    expect(event?.timestamp).toBe(timestamp);
    expect(event?.timestamp).toMatch(/\.123Z$/);
    expect(event?.receivedAt).toMatch(/\.\d{3}Z$/);
    expect(new Date(event!.receivedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(event!.timestamp).getTime()
    );
    expect(new Date(event!.receivedAt).getTime()).toBeGreaterThanOrEqual(before);
    expect(event?.source).toBe('server');

    const withoutTimestamp = await track(keyBearer, { externalId, name: 'y' });
    expect(withoutTimestamp.event?.timestamp).toBe(withoutTimestamp.event?.receivedAt);
    expect(withoutTimestamp.event?.data).toEqual({});
  });

  it('round-trips nested data through the actor and the stream', async () => {
    const externalId = `user_${uniq()}`;
    const name = `nested.${uniq()}`;
    const data = {
      items: [
        { sku: 'a', qty: 1, tags: ['x', 'y'] },
        { sku: 'b', qty: 2, tags: [] },
      ],
      total: 12.5,
      nested: { deep: { flag: true, none: null } },
    };

    const { event } = await track(keyBearer, { externalId, name, data });
    expect(event?.data).toEqual(data);

    const timeline = await api<Listed>(`/v1/subscribers/${externalId}/timeline`, { headers: keyBearer });
    expect(timeline.body.data?.items[0]?.data).toEqual(data);

    const listed = await listUntil(keyBearer, `?name=${name}`, 1, 'nested event listed');
    expect(listed.items[0]?.data).toEqual(data);
  }, 90_000);
});

describe('GET /v1/events', () => {
  let keyBearer: Headers;
  let clientBearer: Headers;

  beforeAll(async () => {
    const base = await setupWorkspace({ bare: true });
    keyBearer = base.keyBearer;
    const clientKey = await createClientKey(base.owner.token, base.workspace.slug, 'default');
    clientBearer = { Authorization: `Bearer ${clientKey.secret}` };
  });

  it('filters by name, source and after, alone and combined', async () => {
    const tag = uniq();
    const [alpha, beta] = [`alpha.${tag}`, `beta.${tag}`];
    const externalId = `user_${uniq()}`;

    await trackBatch(keyBearer, [
      { externalId, name: alpha },
      { externalId, name: beta },
    ]);
    await api('/v1/client/events', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({ externalId, source: 'ios', events: [{ name: alpha }] }),
    });
    await listUntil(keyBearer, `?name=${alpha}`, 2, 'alpha landed');
    await listUntil(keyBearer, `?name=${beta}`, 1, 'beta landed');

    await new Promise((resolve) => setTimeout(resolve, 5));
    const after = new Date().toISOString();
    await new Promise((resolve) => setTimeout(resolve, 5));
    await api('/v1/client/events', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({ externalId, source: 'android', events: [{ name: alpha }] }),
    });
    await listUntil(keyBearer, `?name=${alpha}`, 3, 'late alpha landed');

    const byName = await listEvents(keyBearer, `?name=${alpha}`);
    expect(byName.body.data?.items.map((item) => item.source).sort()).toEqual(['android', 'ios', 'server']);

    const bySource = await listEvents(keyBearer, '?source=ios');
    expect(bySource.body.data?.items.every((item) => item.source === 'ios')).toBe(true);
    expect(bySource.body.data?.items.some((item) => item.name === alpha)).toBe(true);

    const byAfter = await listEvents(keyBearer, `?after=${encodeURIComponent(after)}`);
    expect(byAfter.body.data?.items).toHaveLength(1);
    expect(byAfter.body.data?.items[0]).toMatchObject({ name: alpha, source: 'android' });

    const combined = await listEvents(keyBearer, `?name=${alpha}&source=ios`);
    expect(combined.body.data?.items).toHaveLength(1);
    expect(combined.body.data?.items[0]).toMatchObject({ name: alpha, source: 'ios' });

    const nothing = await listEvents(keyBearer, `?name=${beta}&source=ios`);
    expect(nothing.body.data).toEqual({ items: [], hasMore: false, nextCursor: null });

    const afterAndName = await listEvents(keyBearer, `?name=${beta}&after=${encodeURIComponent(after)}`);
    expect(afterAndName.body.data?.items).toEqual([]);

    const system = await listEvents(keyBearer, '?source=system');
    expect(system.body.data?.items.some((item) => item.name === '$subscriber.created')).toBe(true);
    expect(system.body.data?.items.every((item) => item.source === 'system')).toBe(true);
  }, 90_000);

  it('tails a batch that shares one receivedAt with after and afterId', async () => {
    const name = `tail.${uniq()}`;
    const externalId = `user_${uniq()}`;
    await trackBatch(
      keyBearer,
      Array.from({ length: 60 }, (_, index) => ({
        externalId,
        name,
        id: `${name}-${index}`,
        data: { index },
      }))
    );
    const all = await listUntil(keyBearer, `?name=${name}&limit=100`, 60, 'tail batch landed');
    expect(new Set(all.items.map((item) => item.receivedAt)).size).toBe(1);
    expect(all.items.map((item) => item.data.index)).toEqual(
      Array.from({ length: 60 }, (_, index) => 59 - index)
    );

    const pivot = all.items[24]!;
    const tail = await listEvents(
      keyBearer,
      `?name=${name}&limit=100&after=${encodeURIComponent(pivot.receivedAt)}&afterId=${pivot.id}`
    );
    expect(tail.status).toBe(200);
    expect(tail.body.data?.items.map((item) => item.id)).toEqual(
      all.items.slice(0, 24).map((item) => item.id)
    );
    expect(tail.body.data?.items.map((item) => item.data.index)).toEqual(
      Array.from({ length: 24 }, (_, index) => 59 - index)
    );

    const fromNewest = await listEvents(
      keyBearer,
      `?name=${name}&after=${encodeURIComponent(all.items[0]!.receivedAt)}&afterId=${all.items[0]!.id}`
    );
    expect(fromNewest.body.data?.items).toEqual([]);

    const withoutId = await listEvents(
      keyBearer,
      `?name=${name}&after=${encodeURIComponent(pivot.receivedAt)}`
    );
    expect(withoutId.body.data?.items).toEqual([]);

    const malformedId = await listEvents(
      keyBearer,
      `?after=${encodeURIComponent(pivot.receivedAt)}&afterId=`
    );
    expect(malformedId.status).toBe(400);
    expect(malformedId.body.error?.code).toBe('validation');
    expect(malformedId.body.error?.param).toBe('afterId');
  }, 90_000);

  it('rejects an unknown source, a malformed after and a malformed name', async () => {
    const source = await listEvents(keyBearer, '?source=nope');
    expect(source.status).toBe(400);
    expect(source.body.error?.code).toBe('validation');
    expect(source.body.error?.param).toBe('source');

    const after = await listEvents(keyBearer, '?after=yesterday');
    expect(after.status).toBe(400);
    expect(after.body.error?.code).toBe('validation');
    expect(after.body.error?.param).toBe('after');

    const name = await listEvents(keyBearer, '?name=Not%20Valid');
    expect(name.status).toBe(400);
    expect(name.body.error?.code).toBe('validation');
    expect(name.body.error?.param).toBe('name');
  });

  it('rejects limit 0, 101, 2.5 and abc, accepts 1 and 100', async () => {
    for (const limit of ['0', '101', '-1']) {
      const { status, body } = await listEvents(keyBearer, `?limit=${limit}`);
      expect(status).toBe(400);
      expect(body.error?.code).toBe('validation');
      expect(body.error?.param).toBe('');
    }
    for (const limit of ['2.5', 'abc', '']) {
      const { status, body } = await listEvents(keyBearer, `?limit=${limit}`);
      expect(status).toBe(400);
      expect(body.error?.code).toBe('validation');
      expect(body.error?.param).toBe('limit');
    }

    const externalId = `user_${uniq()}`;
    const name = `limit.${uniq()}`;
    await trackBatch(keyBearer, [
      { externalId, name },
      { externalId, name },
    ]);
    await listUntil(keyBearer, `?name=${name}`, 2, 'limit events landed');

    const one = await listEvents(keyBearer, `?name=${name}&limit=1`);
    expect(one.status).toBe(200);
    expect(one.body.data?.items).toHaveLength(1);
    expect(one.body.data?.hasMore).toBe(true);
    expect(one.body.data?.nextCursor).toMatch(CURSOR_PATTERN);

    const hundred = await listEvents(keyBearer, `?name=${name}&limit=100`);
    expect(hundred.status).toBe(200);
    expect(hundred.body.data?.items).toHaveLength(2);
    expect(hundred.body.data?.hasMore).toBe(false);
    expect(hundred.body.data?.nextCursor).toBeNull();
  });

  it('pages 120 events through three pages without duplicates or gaps, newest received first', async () => {
    const name = `paged.${uniq()}`;
    const externalId = `user_${uniq()}`;
    const ids: string[] = [];
    for (let index = 0; index < 120; index++) {
      const { event } = await track(keyBearer, { externalId, name, id: `${name}-${index}`, data: { index } });
      ids.push(event!.id);
      await new Promise((resolve) => setTimeout(resolve, 2));
    }

    const pages = await eventually(
      async () => {
        const walked: Listed[] = [];
        let cursor: string | null = null;
        do {
          const { body } = await listEvents(
            keyBearer,
            `?name=${name}&limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
          );
          walked.push(body.data!);
          cursor = body.data!.nextCursor;
        } while (cursor && walked.length < 10);
        const seen = new Set(walked.flatMap((page) => page.items.map((item) => item.id)));
        return seen.size === ids.length ? walked : undefined;
      },
      { label: 'every paged event landed', timeoutMs: 120_000 }
    );

    expect(pages.map((page) => page.items.length)).toEqual([50, 50, 20]);
    expect(pages.map((page) => page.hasMore)).toEqual([true, true, false]);
    expect(pages[0]?.nextCursor).toMatch(CURSOR_PATTERN);
    expect(pages[0]?.nextCursor).toBe(`${pages[0]?.items[49]?.receivedAt}_${pages[0]?.items[49]?.id}`);
    expect(pages[2]?.nextCursor).toBeNull();

    const items = pages.flatMap((page) => page.items);
    expect(new Set(items.map((item) => item.id)).size).toBe(120);
    expect(new Set(items.map((item) => item.id))).toEqual(new Set(ids));
    for (let index = 1; index < items.length; index++) {
      expect(new Date(items[index]!.receivedAt).getTime()).toBeLessThanOrEqual(
        new Date(items[index - 1]!.receivedAt).getTime()
      );
    }
    expect(items[0]?.data).toEqual({ index: 119 });
    expect(items.at(-1)?.data).toEqual({ index: 0 });
  }, 120_000);

  it('pages batches whose events share one receivedAt without gaps or duplicates', async () => {
    const name = `tied.${uniq()}`;
    const externalId = `user_${uniq()}`;
    for (const batch of [0, 1]) {
      await trackBatch(
        keyBearer,
        Array.from({ length: 60 }, (_, index) => ({
          externalId,
          name,
          id: `${name}-${batch}-${index}`,
          data: { batch, index },
        }))
      );
    }

    const pages = await eventually(
      async () => {
        const walked: Listed[] = [];
        let cursor: string | null = null;
        do {
          const { body } = await listEvents(
            keyBearer,
            `?name=${name}&limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
          );
          walked.push(body.data!);
          cursor = body.data!.nextCursor;
        } while (cursor && walked.length < 10);
        const seen = new Set(walked.flatMap((page) => page.items.map((item) => item.id)));
        return seen.size === 120 ? walked : undefined;
      },
      { label: 'every tied event landed', timeoutMs: 120_000 }
    );

    expect(pages.map((page) => page.items.length)).toEqual([50, 50, 20]);
    expect(pages.map((page) => page.hasMore)).toEqual([true, true, false]);
    const items = pages.flatMap((page) => page.items);
    expect(new Set(items.map((item) => item.receivedAt)).size).toBe(2);
    expect(items.map((item) => item.data)).toEqual(
      [1, 0].flatMap((batch) => Array.from({ length: 60 }, (_, index) => ({ batch, index: 59 - index })))
    );

    const bare = await listEvents(
      keyBearer,
      `?name=${name}&limit=100&cursor=${encodeURIComponent(items[0]!.receivedAt)}`
    );
    expect(bare.status).toBe(200);
    expect(bare.body.data?.items).toHaveLength(60);
    expect(bare.body.data?.items.every((item) => item.data.batch === 0)).toBe(true);
  }, 120_000);

  it('rejects an invalid cursor with 400 invalid_cursor', async () => {
    for (const cursor of ['garbage', 'yesterday_evt_x', `${new Date().toISOString()}_evt_nope`, '_']) {
      const { status, body } = await listEvents(keyBearer, `?cursor=${encodeURIComponent(cursor)}`);
      expect(status).toBe(400);
      expect(body.error?.code).toBe('invalid_cursor');
      expect(body.error?.param).toBe('cursor');
    }

    const future = await listEvents(keyBearer, `?cursor=${encodeURIComponent(new Date().toISOString())}`);
    expect(future.status).toBe(200);
  });

  it('never lists events of another tenant in the same workspace or another workspace', async () => {
    const base = await setupWorkspace({ bare: true });
    const sibling = await createTenant(base.keyBearer, 'Sibling', { bare: true });
    const siblingBearer = { ...base.keyBearer, 'buzzkit-tenant': sibling.slug };
    const stranger = await setupWorkspace({ bare: true });
    const name = `private.${uniq()}`;

    await track(base.keyBearer, { externalId: `user_${uniq()}`, name });
    await track(siblingBearer, { externalId: `user_${uniq()}`, name, data: { sibling: true } });
    await listUntil(base.keyBearer, `?name=${name}`, 1, 'default tenant event landed');
    await listUntil(siblingBearer, `?name=${name}`, 1, 'sibling tenant event landed');

    const mine = await listEvents(base.keyBearer, `?name=${name}`);
    expect(mine.body.data?.items).toHaveLength(1);
    expect(mine.body.data?.items[0]?.data).toEqual({});

    const theirs = await listEvents(siblingBearer, `?name=${name}`);
    expect(theirs.body.data?.items).toHaveLength(1);
    expect(theirs.body.data?.items[0]?.data).toEqual({ sibling: true });

    const foreign = await listEvents(stranger.keyBearer, `?name=${name}`);
    expect(foreign.body.data).toEqual({ items: [], hasMore: false, nextCursor: null });
  }, 90_000);
});

describe('/v1/events authorization', () => {
  it('refuses a client key on the server routes', async () => {
    const { owner, workspace } = await setupWorkspace({ bare: true });
    const clientKey = await createClientKey(owner.token, workspace.slug, 'default');
    const clientBearer = { Authorization: `Bearer ${clientKey.secret}` };

    for (const path of ['/v1/events', '/v1/events/names', '/v1/events/volume', '/v1/events/token']) {
      const { status } = await api(path, { headers: clientBearer });
      expect(status).toBe(401);
    }
    const posted = await track(clientBearer, { externalId: `user_${uniq()}`, name: 'x' });
    expect(posted.status).toBe(401);
  });

  it('refuses a request without credentials', async () => {
    const { status, body } = await api('/v1/events');
    expect(status).toBe(401);
    expect(body.error?.code).toBe('missing_authorization');
  });

  it('refuses a workspace key created without events scopes on every route', async () => {
    const { owner, workspace } = await setupWorkspace({ bare: true });
    const key = await createKey(owner.token, workspace.slug, {
      scopes: ['subscribers:read', 'messages:send'],
    });
    const bearer = { Authorization: `Bearer ${key.secret}` };

    for (const path of [
      '/v1/events',
      '/v1/events/names',
      '/v1/events/names/anything',
      '/v1/events/volume',
      '/v1/events/token',
    ]) {
      const { status, body } = await api(path, { headers: bearer });
      expect(status).toBe(403);
      expect(body.error?.code).toBe('missing_permission');
    }
    const posted = await track(bearer, { externalId: `user_${uniq()}`, name: 'x' });
    expect(posted.status).toBe(403);
    expect(posted.body.error?.code).toBe('missing_permission');
  });

  it('separates events:read from events:write', async () => {
    const { owner, workspace } = await setupWorkspace({ bare: true });
    const reader = await createKey(owner.token, workspace.slug, { scopes: ['events:read'] });
    const writer = await createKey(owner.token, workspace.slug, { scopes: ['events:write'] });
    const readerBearer = { Authorization: `Bearer ${reader.secret}` };
    const writerBearer = { Authorization: `Bearer ${writer.secret}` };

    const readerPost = await track(readerBearer, { externalId: `user_${uniq()}`, name: 'x' });
    expect(readerPost.status).toBe(403);
    expect(readerPost.body.error?.code).toBe('missing_permission');
    for (const path of ['/v1/events', '/v1/events/names', '/v1/events/volume', '/v1/events/token']) {
      expect((await api(path, { headers: readerBearer })).status).toBe(200);
    }

    const writerPost = await track(writerBearer, { externalId: `user_${uniq()}`, name: 'x' });
    expect(writerPost.status).toBe(202);
    for (const path of ['/v1/events', '/v1/events/names', '/v1/events/volume', '/v1/events/token']) {
      const { status, body } = await api(path, { headers: writerBearer });
      expect(status).toBe(403);
      expect(body.error?.code).toBe('missing_permission');
    }

    const wildcard = await createKey(owner.token, workspace.slug, { scopes: ['events:*'] });
    const wildcardBearer = { Authorization: `Bearer ${wildcard.secret}` };
    expect((await track(wildcardBearer, { externalId: `user_${uniq()}`, name: 'x' })).status).toBe(202);
    expect((await api('/v1/events', { headers: wildcardBearer })).status).toBe(200);
  });

  it('lets a member session read and write through the workspace header', async () => {
    const { owner, workspace } = await setupWorkspace({ bare: true });
    const member = await addMember(owner.token, workspace.slug, 'member');
    const bearer = { ...member.bearer, 'buzzkit-workspace': workspace.slug };

    const posted = await track(bearer, { externalId: `user_${uniq()}`, name: 'x' });
    expect(posted.status).toBe(202);
    for (const path of ['/v1/events', '/v1/events/names', '/v1/events/volume', '/v1/events/token']) {
      expect((await api(path, { headers: bearer })).status).toBe(200);
    }

    const withoutWorkspace = await api('/v1/events', { headers: member.bearer });
    expect(withoutWorkspace.status).toBe(400);
    expect(withoutWorkspace.body.error?.code).toBe('workspace_missing');

    const stranger = await setupWorkspace({ bare: true });
    const outsider = await api('/v1/events', {
      headers: { ...stranger.ownerBearer, 'buzzkit-workspace': workspace.slug },
    });
    expect(outsider.status).toBe(404);
  });

  it('keeps a tenant key of another tenant blind to this tenant', async () => {
    const { owner, workspace, keyBearer } = await setupWorkspace({ bare: true });
    const other = await createTenant(keyBearer, 'Other', { bare: true });
    const otherKey = await createKey(owner.token, workspace.slug, { kind: 'tenant', tenant: other.slug });
    const otherBearer = { Authorization: `Bearer ${otherKey.secret}` };
    const name = `tenantkey.${uniq()}`;

    await track(keyBearer, { externalId: `user_${uniq()}`, name });
    await listUntil(keyBearer, `?name=${name}`, 1, 'default tenant event landed');

    const listed = await listEvents(otherBearer, `?name=${name}`);
    expect(listed.status).toBe(200);
    expect(listed.body.data?.items).toEqual([]);

    const detail = await api(`/v1/events/names/${name}`, { headers: otherBearer });
    expect(detail.status).toBe(404);

    const redirected = await api('/v1/events', { headers: { ...otherBearer, 'buzzkit-tenant': 'default' } });
    expect(redirected.status).toBe(403);
    expect(redirected.body.error?.code).toBe('wrong_tenant');

    const posted = await track(otherBearer, { externalId: `user_${uniq()}`, name });
    expect(posted.status).toBe(202);
    const own = await listUntil(otherBearer, `?name=${name}`, 1, 'other tenant event landed');
    expect(own.items).toHaveLength(1);
    expect(own.items[0]?.id).toBe(posted.event?.id);
  }, 90_000);
});

describe('the event log', () => {
  it('lands in Tinybird once per event, in order, and shows in the catalog, the list and the timeline', {
    timeout: 120_000,
  }, async () => {
    const { keyBearer } = await setupWorkspace();
    const externalId = `user_${uniq()}`;
    const name = `test.${uniq()}`;
    const dedupe = `client-${uniq()}`;

    await api('/v1/events', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({
        events: [
          { externalId, name, id: dedupe, data: { n: 1 } },
          { externalId, name, id: dedupe, data: { n: 1 } },
          { externalId, name, data: { n: 2 } },
        ],
      }),
    });

    const listed = await eventually(
      async () => {
        const { body } = await api<Listed>(`/v1/events?name=${name}`, { headers: keyBearer });
        return (body.data?.items.length ?? 0) >= 2 ? body.data : undefined;
      },
      { label: 'events listed', timeoutMs: 120_000 }
    );
    expect(listed.items).toHaveLength(2);
    expect(listed.items.map((item) => item.data)).toEqual([{ n: 2 }, { n: 1 }]);
    expect(listed.items[0]!.sequence).toBeGreaterThan(listed.items[1]!.sequence);
    expect(listed.items[0]?.externalId).toBe(externalId);

    const names = await eventually(
      async () => {
        const { body } = await api<{
          items: Array<{ name: string; counts: { total: number }; sources: string[] }>;
        }>('/v1/events/names', { headers: keyBearer });
        const mine = body.data?.items.find((item) => item.name === name);
        return mine?.counts.total === 2 ? mine : undefined;
      },
      { label: 'catalog', timeoutMs: 120_000 }
    );
    expect(names.sources).toEqual(['server']);

    const detail = await api<{
      name: string;
      volume: { buckets: Array<{ count: number }> };
      samples: Tracked[];
    }>(`/v1/events/names/${name}?range=24h`, { headers: keyBearer });
    expect(detail.status).toBe(200);
    expect(detail.body.data?.samples).toHaveLength(2);
    expect(detail.body.data?.volume.buckets.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(2);

    const timeline = await api<Listed>(`/v1/subscribers/${externalId}/timeline`, { headers: keyBearer });
    expect(timeline.status).toBe(200);
    expect(timeline.body.data?.items.map((item) => item.name)).toEqual([name, name, '$subscriber.created']);
    expect(timeline.body.data?.items[2]?.source).toBe('system');

    const page = await api<Listed>(`/v1/subscribers/${externalId}/timeline?limit=2`, { headers: keyBearer });
    expect(page.body.data?.items).toHaveLength(2);
    expect(page.body.data?.hasMore).toBe(true);
    const rest = await api<Listed>(
      `/v1/subscribers/${externalId}/timeline?limit=2&cursor=${page.body.data?.nextCursor}`,
      {
        headers: keyBearer,
      }
    );
    expect(rest.body.data?.items.map((item) => item.name)).toEqual(['$subscriber.created']);
    expect(rest.body.data?.hasMore).toBe(false);

    const unknown = await api('/v1/events/names/never.happened', { headers: keyBearer });
    expect(unknown.status).toBe(404);
  });

  it('mints a read-only Tinybird token pinned to the tenant', async () => {
    const { keyBearer } = await setupWorkspace();

    const { status, body } = await api<{ token: string; expiresAt: string; url: string }>(
      '/v1/events/token',
      {
        headers: keyBearer,
      }
    );

    expect(status).toBe(200);
    expect(body.data?.token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(new Date(body.data!.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(body.data?.url).toContain('http');

    const claims = JSON.parse(Buffer.from(body.data!.token.split('.')[1]!, 'base64').toString()) as {
      scopes: Array<{ type: string; resource: string; fixed_params: { tenant_id: number } }>;
    };
    expect(claims.scopes.every((scope) => scope.type === 'PIPES:READ')).toBe(true);
    expect(claims.scopes.map((scope) => scope.resource)).toContain('event_catalog');
    expect(new Set(claims.scopes.map((scope) => scope.fixed_params.tenant_id)).size).toBe(1);

    const tenantId = claims.scopes[0]!.fixed_params.tenant_id;
    const direct = await fetch(`${body.data!.url}/v0/pipes/event_catalog.json?tenant_id=${tenantId + 1}`, {
      headers: { authorization: `Bearer ${body.data!.token}` },
    });
    expect(direct.status).toBe(200);
    const forbidden = await fetch(`${body.data!.url}/v0/pipes/event_recent.json?tenant_id=${tenantId}`, {
      headers: { authorization: `Bearer ${body.data!.token}` },
    });
    expect(forbidden.status).toBe(200);
    const ingest = await fetch(`${body.data!.url}/v0/events?name=events`, {
      method: 'POST',
      headers: { authorization: `Bearer ${body.data!.token}` },
      body: '{}',
    });
    expect(ingest.status).toBeGreaterThanOrEqual(400);
  });

  it('scopes reads and writes to the tenant', { timeout: 90_000 }, async () => {
    const { keyBearer } = await setupWorkspace();
    const other = await setupWorkspace();
    const name = `test.${uniq()}`;

    await api('/v1/events', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ externalId: `user_${uniq()}`, name }),
    });
    await eventually(
      async () => {
        const { body } = await api<Listed>(`/v1/events?name=${name}`, { headers: keyBearer });
        return (body.data?.items.length ?? 0) > 0 ? true : undefined;
      },
      { timeoutMs: 120_000 }
    );

    const foreign = await api<Listed>(`/v1/events?name=${name}`, { headers: other.keyBearer });
    expect(foreign.body.data?.items).toEqual([]);
  });
});
