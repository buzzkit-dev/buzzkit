import type { Expression } from 'buzzkit/expressions';
import { beforeAll, describe, expect, it } from 'vitest';
import { api } from '../../utils/api';
import { eventually } from '../../utils/eventually';
import { fakeToken } from '../../utils/fixtures';
import { addMember, createClientKey, createKey, createTenant, setupWorkspace, uniq } from '../../utils/setup';

type Headers = Record<string, string>;

type SegmentBody = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  version: { id: string; number: number; expression: Expression; createdAt: string } | null;
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
};

type SubscriberBody = {
  id: string;
  externalId: string;
  attributes: Record<string, unknown>;
  channels: string[];
  platforms: string[];
  lastSeenAt: string | null;
};

type Page<T> = { items: T[]; hasMore: boolean; nextCursor: string | null; total?: number };

type MessageBody = {
  id: string;
  status: string;
  targets: Record<string, unknown>;
  counts: { total: number };
};

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

async function setup() {
  const base = await setupWorkspace({ push: 'unusable' });
  const clientKey = await createClientKey(base.owner.token, base.workspace.slug, 'default');
  return { ...base, clientBearer: { Authorization: `Bearer ${clientKey.secret}` } };
}

function createSegment(headers: Headers, input: Record<string, unknown>) {
  return api<SegmentBody>('/v1/segments', {
    method: 'POST',
    headers,
    body: JSON.stringify({ slug: `seg-${uniq()}`, name: 'Segment', ...input }),
  });
}

async function preview(headers: Headers, expression: Expression) {
  const { status, body } = await api<{ count: number; sample: SubscriberBody[] }>('/v1/segments/preview', {
    method: 'POST',
    headers,
    body: JSON.stringify({ expression }),
  });
  if (status !== 200) throw new Error(`preview failed: ${status} ${JSON.stringify(body)}`);
  return body.data!;
}

async function previewCount(headers: Headers, expression: Expression) {
  return (await preview(headers, expression)).count;
}

async function countUntil(headers: Headers, expression: Expression, expected: number, label: string) {
  await eventually(async () => (await previewCount(headers, expression)) === expected, {
    label,
    timeoutMs: 90_000,
    intervalMs: 1000,
  });
}

function members(headers: Headers, slug: string, query = '') {
  return api<Page<SubscriberBody>>(`/v1/segments/${slug}/members${query}`, { headers });
}

async function putSubscriber(headers: Headers, externalId: string, attributes: Record<string, unknown>) {
  const { status } = await api(`/v1/subscribers/${encodeURIComponent(externalId)}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ attributes }),
  });
  if (status !== 200 && status !== 201) throw new Error(`put subscriber failed: ${status}`);
}

async function subscribe(headers: Headers, externalId: string, channel: 'push' | 'email' = 'push') {
  const { status, body } = await api<{ id: string }>('/v1/subscriptions', {
    method: 'POST',
    headers,
    body: JSON.stringify(
      channel === 'push'
        ? { externalId, channel, platform: 'ios', environment: 'sandbox', token: fakeToken('s') }
        : { externalId, channel, address: `${externalId}@buzzkit.dev` }
    ),
  });
  if (status !== 201 && status !== 200)
    throw new Error(`subscribe failed: ${status} ${JSON.stringify(body)}`);
  return body.data!.id;
}

async function trackServer(
  headers: Headers,
  events: Array<{ externalId: string; name: string; timestamp?: string }>
) {
  const { status, body } = await api('/v1/events', {
    method: 'POST',
    headers,
    body: JSON.stringify({ events }),
  });
  if (status !== 202) throw new Error(`track failed: ${status} ${JSON.stringify(body)}`);
}

async function trackDevice(headers: Headers, externalId: string, names: string[], timestamp?: string) {
  const { status, body } = await api('/v1/client/events', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      externalId,
      source: 'ios',
      events: names.map((name) => ({ id: uniq(), name, ...(timestamp ? { timestamp } : {}) })),
    }),
  });
  if (status !== 202) throw new Error(`device track failed: ${status} ${JSON.stringify(body)}`);
}

async function send(headers: Headers, input: Record<string, unknown>) {
  return api<MessageBody>('/v1/messages', {
    method: 'POST',
    headers,
    body: JSON.stringify({ title: 'Hello', body: 'World', ...input }),
  });
}

async function awaitCompletion(headers: Headers, id: string) {
  return eventually(
    async () => {
      const { body } = await api<MessageBody>(`/v1/messages/${id}`, { headers });
      return body.data?.status === 'completed' ? body.data : undefined;
    },
    { label: `message ${id} completed`, timeoutMs: 120_000, intervalMs: 250 }
  );
}

async function deliveredTo(headers: Headers, id: string) {
  const { body } = await api<Page<{ externalId: string }>>(`/v1/messages/${id}/deliveries?limit=100`, {
    headers,
  });
  return (body.data?.items ?? []).map((item) => item.externalId).sort();
}

const pushAndPro: Expression = { all: [{ ref: 'attributes.plan', eq: 'pro' }, { channel: 'push' }] };

describe('segments CRUD', () => {
  it('creates a segment with its first version and lists, reads, updates and deletes it', async () => {
    const { keyBearer } = await setup();
    const slug = `seg-${uniq()}`;

    const created = await createSegment(keyBearer, { slug, name: 'Pro on push', expression: pushAndPro });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      slug,
      name: 'Pro on push',
      description: null,
      version: { number: 1, expression: pushAndPro },
    });
    expect(created.body.data?.id).toMatch(/^seg_/);
    expect(created.body.data?.version?.id).toMatch(/^sgv_/);
    const firstVersion = created.body.data!.version!.id;

    const listed = await api<Page<SegmentBody>>('/v1/segments', { headers: keyBearer });
    expect(listed.status).toBe(200);
    expect(listed.body.data?.items.map((item) => item.slug)).toEqual([slug]);

    const read = await api<SegmentBody>(`/v1/segments/${slug}`, { headers: keyBearer });
    expect(read.status).toBe(200);
    expect(read.body.data?.id).toBe(created.body.data?.id);

    const renamed = await api<SegmentBody>(`/v1/segments/${slug}`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ name: 'Pro users on push', description: 'Paying, reachable' }),
    });
    expect(renamed.status).toBe(200);
    expect(renamed.body.data).toMatchObject({ name: 'Pro users on push', description: 'Paying, reachable' });
    expect(renamed.body.data?.version?.id).toBe(firstVersion);

    const sameExpression = await api<SegmentBody>(`/v1/segments/${slug}`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ expression: pushAndPro }),
    });
    expect(sameExpression.body.data?.version?.id).toBe(firstVersion);

    const nextExpression: Expression = { all: [{ ref: 'attributes.plan', eq: 'pro' }, { channel: 'email' }] };
    const revised = await api<SegmentBody>(`/v1/segments/${slug}`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ expression: nextExpression, description: null }),
    });
    expect(revised.status).toBe(200);
    expect(revised.body.data?.description).toBeNull();
    expect(revised.body.data?.version).toMatchObject({ number: 2, expression: nextExpression });
    expect(revised.body.data?.version?.id).not.toBe(firstVersion);

    const empty = await api<SegmentBody>(`/v1/segments/${slug}`, {
      method: 'PATCH',
      headers: keyBearer,
      body: '{}',
    });
    expect(empty.status).toBe(200);
    expect(empty.body.data?.version).toMatchObject({ number: 2 });

    const deleted = await api<SegmentBody>(`/v1/segments/${slug}`, { method: 'DELETE', headers: keyBearer });
    expect(deleted.status).toBe(200);
    expect(deleted.body.data?.deleted).toBe(true);
    expect((await api(`/v1/segments/${slug}`, { headers: keyBearer })).status).toBe(404);
    expect(
      (await api(`/v1/segments/${slug}`, { method: 'PATCH', headers: keyBearer, body: '{"name":"x"}' }))
        .status
    ).toBe(404);
    const afterDelete = await api<Page<SegmentBody>>('/v1/segments', { headers: keyBearer });
    expect(afterDelete.body.data?.items).toEqual([]);

    const reused = await createSegment(keyBearer, { slug, expression: pushAndPro });
    expect(reused.status).toBe(201);
  });

  it('refuses a taken slug and an expression it cannot compile, naming the field', async () => {
    const { keyBearer } = await setup();
    const slug = `seg-${uniq()}`;
    expect((await createSegment(keyBearer, { slug, expression: pushAndPro })).status).toBe(201);

    const taken = await createSegment(keyBearer, { slug, expression: pushAndPro });
    expect(taken.status).toBe(409);
    expect(taken.body.error?.code).toBe('slug_taken');

    const invalid = await createSegment(keyBearer, {
      expression: { all: [{ channel: 'push' }, { ref: 'email', eq: 'a@b.c' }] },
    });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error?.code).toBe('invalid_expression');
    expect(invalid.body.error?.param).toBe('expression.all[1]');

    const malformed = await createSegment(keyBearer, { expression: { channel: 'fax' } });
    expect(malformed.status).toBe(400);

    const emptyGroup = await createSegment(keyBearer, { expression: { all: [] } });
    expect(emptyGroup.status).toBe(400);

    const badUpdate = await api(`/v1/segments/${slug}`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ expression: { lastSeen: {} } }),
    });
    expect(badUpdate.status).toBe(400);
    expect(badUpdate.body.error?.code).toBe('invalid_expression');
  });

  it('keeps segments per tenant', async () => {
    const { keyBearer, owner, workspace } = await setup();
    const other = await createTenant(keyBearer, 'Other', { bare: true });
    const otherKey = await createKey(owner.token, workspace.slug, { kind: 'tenant', tenant: other.slug });
    const otherBearer = { Authorization: `Bearer ${otherKey.secret}` };
    const slug = `seg-${uniq()}`;

    expect((await createSegment(keyBearer, { slug, expression: pushAndPro })).status).toBe(201);
    expect((await api(`/v1/segments/${slug}`, { headers: otherBearer })).status).toBe(404);
    const listed = await api<Page<SegmentBody>>('/v1/segments', { headers: otherBearer });
    expect(listed.body.data?.items).toEqual([]);
    expect((await createSegment(otherBearer, { slug, expression: pushAndPro })).status).toBe(201);
  });

  it('lets members read and only admins write', async () => {
    const { owner, workspace, keyBearer } = await setup();
    const slug = `seg-${uniq()}`;
    expect((await createSegment(keyBearer, { slug, expression: pushAndPro })).status).toBe(201);

    const member = await addMember(owner.token, workspace.slug, 'member');
    const memberHeaders = { ...member.bearer, 'buzzkit-workspace': workspace.slug };
    expect((await api('/v1/segments', { headers: memberHeaders })).status).toBe(200);
    expect((await api(`/v1/segments/${slug}`, { headers: memberHeaders })).status).toBe(200);
    expect((await createSegment(memberHeaders, { expression: pushAndPro })).status).toBe(403);
    expect((await api(`/v1/segments/${slug}`, { method: 'DELETE', headers: memberHeaders })).status).toBe(
      403
    );

    const readOnly = await createKey(owner.token, workspace.slug, { scopes: ['segments:read'] });
    const readOnlyBearer = { Authorization: `Bearer ${readOnly.secret}` };
    expect((await api('/v1/segments', { headers: readOnlyBearer })).status).toBe(200);
    expect((await createSegment(readOnlyBearer, { expression: pushAndPro })).status).toBe(403);
    const previewed = await api('/v1/segments/preview', {
      method: 'POST',
      headers: readOnlyBearer,
      body: JSON.stringify({ expression: pushAndPro }),
    });
    expect(previewed.status).toBe(200);

    const unrelated = await createKey(owner.token, workspace.slug, { scopes: ['events:write'] });
    expect(
      (await api('/v1/segments', { headers: { Authorization: `Bearer ${unrelated.secret}` } })).status
    ).toBe(403);
  });
});

describe('segment membership', () => {
  const ids = {
    alice: `alice_${uniq()}`,
    bob: `bob_${uniq()}`,
    carol: `carol_${uniq()}`,
    dave: `dave_${uniq()}`,
    erin: `erin_${uniq()}`,
    frank: `frank_${uniq()}`,
    grace: `grace_${uniq()}`,
  };
  const everyone: Expression = { ref: 'externalId', in: Object.values(ids) };
  const only = (...conditions: Expression[]): Expression => ({ all: [everyone, ...conditions] });
  let keyBearer: Headers;
  let clientBearer: Headers;

  beforeAll(async () => {
    const base = await setup();
    keyBearer = base.keyBearer;
    clientBearer = base.clientBearer;

    await putSubscriber(keyBearer, ids.alice, { plan: 'pro', age: 34, beta: true, city: 'Berlin' });
    await putSubscriber(keyBearer, ids.bob, { plan: 'pro', age: 19, beta: false, city: 'Hamburg' });
    await putSubscriber(keyBearer, ids.carol, { plan: 'pro', age: 52, city: 'berlin' });
    await putSubscriber(keyBearer, ids.dave, { plan: 'pro', age: 41 });
    await putSubscriber(keyBearer, ids.erin, { plan: 'free', age: 27, city: 'Munich' });
    await putSubscriber(keyBearer, ids.frank, { plan: 'pro', age: 60 });
    await putSubscriber(keyBearer, ids.grace, { plan: 'team', age: 30, address: { city: 'Berlin' } });

    for (const name of ['alice', 'bob', 'carol', 'erin', 'frank'] as const)
      await subscribe(keyBearer, ids[name]);
    await subscribe(keyBearer, ids.dave, 'email');
    await subscribe(keyBearer, ids.grace, 'email');

    const workouts = (externalId: string, count: number, timestamp?: string) =>
      Array.from({ length: count }, () => ({ externalId, name: 'workout.completed', timestamp }));
    await trackServer(keyBearer, [
      ...workouts(ids.alice, 3),
      ...workouts(ids.bob, 1),
      ...workouts(ids.carol, 3),
      { externalId: ids.carol, name: 'app.reviewed' },
      ...workouts(ids.dave, 3),
      ...workouts(ids.erin, 3),
      ...workouts(ids.frank, 3),
      ...workouts(ids.grace, 2, daysAgo(5)),
    ]);

    for (const name of ['alice', 'bob', 'carol', 'dave', 'erin'] as const) {
      await trackDevice(clientBearer, ids[name], ['$app.opened']);
    }
    await trackDevice(clientBearer, ids.frank, ['$app.opened'], daysAgo(5));

    await countUntil(keyBearer, everyone, 7, 'subscribers on the stream');
    await countUntil(keyBearer, only({ count: 'workout.completed', gte: 1 }), 7, 'events on the stream');
    await countUntil(keyBearer, only({ channel: 'push' }), 5, 'subscriptions on the stream');
    await countUntil(keyBearer, only({ lastSeen: { within: '1d' } }), 5, 'activity on the stream');
  }, 180_000);

  async function expectMembers(expression: Expression, expected: Array<keyof typeof ids>) {
    expect(await previewCount(keyBearer, only(expression))).toBe(expected.length);
    const slug = `seg-${uniq()}`;
    await createSegment(keyBearer, { slug, expression: only(expression) });
    const { body } = await members(keyBearer, slug, '?limit=20');
    expect(body.data?.items.map((item) => item.externalId).sort()).toEqual(
      expected.map((name) => ids[name]).sort()
    );
  }

  it('previews the five-leaf segment from the acceptance criteria', async () => {
    const expression: Expression = {
      all: [
        { ref: 'attributes.plan', eq: 'pro' },
        { count: 'workout.completed', within: '7d', gte: 3 },
        { never: 'app.reviewed' },
        { lastSeen: { within: '1d' } },
        { channel: 'push' },
      ],
    };
    await expectMembers(expression, ['alice']);

    const previewed = await preview(keyBearer, only(expression));
    expect(previewed.count).toBe(1);
    expect(previewed.sample).toHaveLength(1);
    expect(previewed.sample[0]).toMatchObject({
      externalId: ids.alice,
      attributes: { plan: 'pro', age: 34, beta: true, city: 'Berlin' },
      channels: ['push'],
      platforms: ['ios'],
    });
    expect(previewed.sample[0]?.id).toMatch(/^sub_/);
  });

  it('filters on attributes with every comparator', async () => {
    await expectMembers({ ref: 'attributes.plan', eq: 'pro' }, ['alice', 'bob', 'carol', 'dave', 'frank']);
    await expectMembers({ ref: 'attributes.plan', neq: 'pro' }, ['erin', 'grace']);
    await expectMembers({ ref: 'attributes.plan', in: ['free', 'team'] }, ['erin', 'grace']);
    await expectMembers({ ref: 'attributes.age', gt: 50 }, ['carol', 'frank']);
    await expectMembers({ ref: 'attributes.age', gte: 52 }, ['carol', 'frank']);
    await expectMembers({ ref: 'attributes.age', lt: 27 }, ['bob']);
    await expectMembers({ ref: 'attributes.age', lte: 27 }, ['bob', 'erin']);
    await expectMembers({ ref: 'attributes.age', gte: 30, lt: 41 }, ['alice', 'grace']);
    await expectMembers({ ref: 'attributes.beta', eq: true }, ['alice']);
    await expectMembers({ ref: 'attributes.beta', eq: false }, ['bob']);
    await expectMembers({ ref: 'attributes.beta', neq: true }, [
      'bob',
      'carol',
      'dave',
      'erin',
      'frank',
      'grace',
    ]);
    await expectMembers({ ref: 'attributes.city', neq: 'Berlin' }, [
      'bob',
      'carol',
      'dave',
      'erin',
      'frank',
      'grace',
    ]);
    await expectMembers({ ref: 'attributes.city', contains: 'berl' }, ['alice', 'carol']);
    await expectMembers({ ref: 'attributes.city', exists: true }, ['alice', 'bob', 'carol', 'erin']);
    await expectMembers({ ref: 'attributes.city', exists: false }, ['dave', 'frank', 'grace']);
    await expectMembers({ ref: 'attributes.city', eq: null }, ['dave', 'frank', 'grace']);
    await expectMembers({ ref: 'attributes.address.city', eq: 'Berlin' }, ['grace']);
    await expectMembers({ ref: 'externalId', eq: ids.dave }, ['dave']);
    await expectMembers({ ref: 'externalId', contains: 'GRACE' }, ['grace']);
  });

  it('filters on event counts, absence, activity and channels', async () => {
    await expectMembers({ count: 'workout.completed', gte: 3 }, ['alice', 'carol', 'dave', 'erin', 'frank']);
    await expectMembers({ count: 'workout.completed', eq: 1 }, ['bob']);
    await expectMembers({ count: 'workout.completed', lt: 3 }, ['bob', 'grace']);
    await expectMembers({ count: 'workout.completed', lte: 2, gte: 1 }, ['bob', 'grace']);
    await expectMembers({ count: 'workout.completed', within: '1d', gte: 1 }, [
      'alice',
      'bob',
      'carol',
      'dave',
      'erin',
      'frank',
    ]);
    await expectMembers({ count: 'app.reviewed', eq: 0 }, ['alice', 'bob', 'dave', 'erin', 'frank', 'grace']);
    await expectMembers({ count: '$app.opened', gte: 1 }, ['alice', 'bob', 'carol', 'dave', 'erin', 'frank']);
    await expectMembers({ never: 'app.reviewed' }, ['alice', 'bob', 'dave', 'erin', 'frank', 'grace']);
    await expectMembers({ never: 'workout.completed', within: '1d' }, ['grace']);
    await expectMembers({ lastSeen: { within: '1d' } }, ['alice', 'bob', 'carol', 'dave', 'erin']);
    await expectMembers({ lastSeen: { olderThan: '1d' } }, ['frank']);
    await expectMembers({ lastSeen: { within: '30d' } }, ['alice', 'bob', 'carol', 'dave', 'erin', 'frank']);
    await expectMembers({ not: { lastSeen: { within: '30d' } } }, ['grace']);
    await expectMembers({ channel: 'push' }, ['alice', 'bob', 'carol', 'erin', 'frank']);
    await expectMembers({ channel: 'email' }, ['dave', 'grace']);
    await expectMembers({ channel: 'sms' }, []);
  });

  it('combines groups', async () => {
    await expectMembers(
      {
        any: [
          { ref: 'attributes.plan', eq: 'team' },
          { all: [{ ref: 'attributes.beta', eq: true }, { channel: 'push' }] },
        ],
      },
      ['alice', 'grace']
    );
    await expectMembers({ not: { any: [{ channel: 'push' }, { ref: 'attributes.plan', eq: 'team' }] } }, [
      'dave',
    ]);
  });

  it('drops a subscriber from the channel condition once the subscription is muted or removed', async () => {
    const externalId = `henry_${uniq()}`;
    await putSubscriber(keyBearer, externalId, { plan: 'pro' });
    const subscriptionId = await subscribe(keyBearer, externalId);
    const condition: Expression = { all: [{ ref: 'externalId', eq: externalId }, { channel: 'push' }] };
    await countUntil(keyBearer, condition, 1, 'subscription registered');

    const muted = await api(`/v1/subscriptions/${subscriptionId}`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ enabled: false }),
    });
    expect(muted.status).toBe(200);
    await countUntil(keyBearer, condition, 0, 'subscription muted');

    await api(`/v1/subscriptions/${subscriptionId}`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ enabled: true }),
    });
    await countUntil(keyBearer, condition, 1, 'subscription unmuted');

    expect(
      (await api(`/v1/subscriptions/${subscriptionId}`, { method: 'DELETE', headers: keyBearer })).status
    ).toBe(200);
    await countUntil(keyBearer, condition, 0, 'subscription removed');

    await subscribe(keyBearer, externalId);
    await countUntil(keyBearer, condition, 1, 'subscription registered again');
  });

  it('forgets a mute once the subscription is re-registered', async () => {
    const externalId = `jack_${uniq()}`;
    await putSubscriber(keyBearer, externalId, { plan: 'pro' });
    const subscriptionId = await subscribe(keyBearer, externalId);
    const condition: Expression = { all: [{ ref: 'externalId', eq: externalId }, { channel: 'push' }] };
    await countUntil(keyBearer, condition, 1, 'subscription registered');

    await api(`/v1/subscriptions/${subscriptionId}`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ enabled: false }),
    });
    await countUntil(keyBearer, condition, 0, 'subscription muted');
    const removed = await api(`/v1/subscriptions/${subscriptionId}`, {
      method: 'DELETE',
      headers: keyBearer,
    });
    expect(removed.status).toBe(200);
    await countUntil(keyBearer, condition, 0, 'subscription removed');

    await subscribe(keyBearer, externalId);
    await countUntil(keyBearer, condition, 1, 'fresh registration is enabled');
  });

  it('follows attribute changes', async () => {
    const externalId = `ivy_${uniq()}`;
    const condition: Expression = {
      all: [
        { ref: 'externalId', eq: externalId },
        { ref: 'attributes.plan', eq: 'pro' },
      ],
    };
    await putSubscriber(keyBearer, externalId, { plan: 'free' });
    await countUntil(keyBearer, { ref: 'externalId', eq: externalId }, 1, 'subscriber created');
    expect(await previewCount(keyBearer, condition)).toBe(0);
    await putSubscriber(keyBearer, externalId, { plan: 'pro' });
    await countUntil(keyBearer, condition, 1, 'subscriber upgraded');
  });

  it('pages the preview by subscriber and reports the total once', async () => {
    const slug = `seg-${uniq()}`;
    await createSegment(keyBearer, { slug, expression: only({ ref: 'attributes.plan', eq: 'pro' }) });

    const first = await members(keyBearer, slug, '?limit=2');
    expect(first.status).toBe(200);
    expect(first.body.data?.total).toBe(5);
    expect(first.body.data?.items).toHaveLength(2);
    expect(first.body.data?.hasMore).toBe(true);
    expect(first.body.data?.nextCursor).toMatch(/^\d+$/);
    expect(first.body.data?.items[0]).toMatchObject({ externalId: ids.alice, attributes: { plan: 'pro' } });

    const seen = [...first.body.data!.items.map((item) => item.externalId)];
    let cursor = first.body.data!.nextCursor;
    while (cursor) {
      const page = await members(keyBearer, slug, `?limit=2&cursor=${cursor}`);
      expect(page.body.data?.total).toBeUndefined();
      seen.push(...page.body.data!.items.map((item) => item.externalId));
      cursor = page.body.data!.hasMore ? page.body.data!.nextCursor : null;
    }
    expect(seen).toEqual([ids.alice, ids.bob, ids.carol, ids.dave, ids.frank]);

    expect((await members(keyBearer, slug, '?limit=100')).body.data?.items).toHaveLength(5);
    expect((await members(keyBearer, slug, '?limit=500')).status).toBe(400);
    expect((await members(keyBearer, slug, '?cursor=abc')).status).toBe(400);
    expect((await members(keyBearer, `missing-${uniq()}`)).status).toBe(404);
  });

  it('sends to a segment and reaches exactly its members', async () => {
    const slug = `seg-${uniq()}`;
    const created = await createSegment(keyBearer, {
      slug,
      expression: only({
        all: [
          { ref: 'attributes.plan', eq: 'pro' },
          { count: 'workout.completed', within: '7d', gte: 3 },
          { never: 'app.reviewed' },
          { lastSeen: { within: '1d' } },
          { channel: 'push' },
        ],
      }),
    });

    const { status, body } = await send(keyBearer, { segment: slug });
    expect(status).toBe(202);
    expect(body.data?.targets).toEqual({ segment: slug, segmentVersion: created.body.data?.version?.id });

    const completed = await awaitCompletion(keyBearer, body.data!.id);
    expect(completed.counts.total).toBe(1);
    expect(await deliveredTo(keyBearer, body.data!.id)).toEqual([ids.alice]);

    const wide = await send(keyBearer, { segment: slug });
    expect(wide.body.data?.id).not.toBe(body.data?.id);
  });

  it('sends to a segment through every subscription of its members', async () => {
    const slug = `seg-${uniq()}`;
    await createSegment(keyBearer, { slug, expression: only({ ref: 'attributes.plan', eq: 'pro' }) });

    const { body } = await send(keyBearer, { segment: slug });
    const completed = await awaitCompletion(keyBearer, body.data!.id);
    expect(completed.counts.total).toBe(4);
    expect(await deliveredTo(keyBearer, body.data!.id)).toEqual(
      [ids.alice, ids.bob, ids.carol, ids.frank].sort()
    );
  });

  it('pins the version a message was sent with', async () => {
    const slug = `seg-${uniq()}`;
    const created = await createSegment(keyBearer, {
      slug,
      expression: only({ ref: 'attributes.plan', eq: 'pro' }),
    });
    await api(`/v1/segments/${slug}`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ expression: only({ ref: 'attributes.plan', eq: 'free' }) }),
    });

    const { body } = await send(keyBearer, { segment: slug });
    expect(body.data?.targets.segmentVersion).not.toBe(created.body.data?.version?.id);
    const completed = await awaitCompletion(keyBearer, body.data!.id);
    expect(completed.counts.total).toBe(1);
    expect(await deliveredTo(keyBearer, body.data!.id)).toEqual([ids.erin]);
  });

  it('completes a send to an empty segment', async () => {
    const slug = `seg-${uniq()}`;
    await createSegment(keyBearer, { slug, expression: only({ channel: 'sms' }) });
    const { body } = await send(keyBearer, { segment: slug });
    const completed = await awaitCompletion(keyBearer, body.data!.id);
    expect(completed.counts.total).toBe(0);
  });

  it('sends to an inline expression without a saved segment', async () => {
    const where = only({ all: [{ ref: 'attributes.plan', eq: 'pro' }, { channel: 'push' }] });
    const { status, body } = await send(keyBearer, { where });
    expect(status).toBe(202);
    expect(body.data?.targets).toEqual({ where });

    const completed = await awaitCompletion(keyBearer, body.data!.id);
    expect(completed.counts.total).toBe(4);
    expect(await deliveredTo(keyBearer, body.data!.id)).toEqual(
      [ids.alice, ids.bob, ids.carol, ids.frank].sort()
    );

    const invalid = await send(keyBearer, {
      where: { all: [{ channel: 'push' }, { ref: 'email', eq: 'x' }] },
    });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error?.code).toBe('invalid_expression');
    expect(invalid.body.error?.param).toBe('where.all[1]');

    const malformed = await send(keyBearer, { where: { channel: 'fax' } });
    expect(malformed.status).toBe(400);
  });

  it('rejects conflicting or unknown targets', async () => {
    const slug = `seg-${uniq()}`;
    await createSegment(keyBearer, { slug, expression: only({ channel: 'push' }) });

    const conflict = await send(keyBearer, { segment: slug, to: ids.alice });
    expect(conflict.status).toBe(400);
    expect(conflict.body.error?.code).toBe('targets_conflict');

    const inlineConflict = await send(keyBearer, { segment: slug, where: { channel: 'push' } });
    expect(inlineConflict.status).toBe(400);
    expect(inlineConflict.body.error?.code).toBe('targets_conflict');
    const inlineToConflict = await send(keyBearer, { to: ids.alice, where: { channel: 'push' } });
    expect(inlineToConflict.status).toBe(400);
    expect(inlineToConflict.body.error?.code).toBe('targets_conflict');

    const missing = await send(keyBearer, { segment: `missing-${uniq()}` });
    expect(missing.status).toBe(404);

    const deleted = await api(`/v1/segments/${slug}`, { method: 'DELETE', headers: keyBearer });
    expect(deleted.status).toBe(200);
    expect((await send(keyBearer, { segment: slug })).status).toBe(404);
  });
});

describe('segment fan-out at scale', () => {
  it('walks every page of members, even ones nobody on them can receive', async () => {
    const { keyBearer } = await setup();
    const prefix = `bulk${uniq()}`;
    const externalIds = Array.from(
      { length: 520 },
      (_, index) => `${prefix}_${String(index).padStart(4, '0')}`
    );
    for (let offset = 0; offset < externalIds.length; offset += 100) {
      await trackServer(
        keyBearer,
        externalIds.slice(offset, offset + 100).map((externalId) => ({ externalId, name: 'bulk.seen' }))
      );
    }
    const reachable = externalIds.slice(-2);
    for (const externalId of reachable) await subscribe(keyBearer, externalId);

    const expression: Expression = {
      all: [
        { ref: 'externalId', contains: prefix },
        { count: 'bulk.seen', gte: 1 },
      ],
    };
    await countUntil(keyBearer, expression, externalIds.length, 'bulk subscribers on the stream');

    const slug = `seg-${uniq()}`;
    await createSegment(keyBearer, { slug, expression });
    const { status, body } = await send(keyBearer, { segment: slug });
    expect(status).toBe(202);
    const completed = await awaitCompletion(keyBearer, body.data!.id);
    expect(completed.counts.total).toBe(2);
    expect(await deliveredTo(keyBearer, body.data!.id)).toEqual(reachable);

    const inline = await send(keyBearer, { where: expression });
    expect(inline.status).toBe(202);
    const inlineCompleted = await awaitCompletion(keyBearer, inline.body.data!.id);
    expect(inlineCompleted.counts.total).toBe(2);
    expect(await deliveredTo(keyBearer, inline.body.data!.id)).toEqual(reachable);
  }, 240_000);
});
