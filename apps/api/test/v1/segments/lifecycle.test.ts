import type { Expression } from 'buzzkit/expressions';
import { describe, expect, it } from 'vitest';
import { api } from '../../utils/api';
import { eventually } from '../../utils/eventually';
import { fakeToken } from '../../utils/fixtures';
import { createKey, createTenant, setupWorkspace, uniq } from '../../utils/setup';

type Headers = Record<string, string>;

type SegmentBody = { id: string; slug: string; version: { id: string; number: number } | null };

type Page<T> = { items: T[]; hasMore: boolean; nextCursor: string | null; total?: number };

type AuditItem = { event: string; targetId: string | null; data: Record<string, unknown> | null };

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

const only = (externalIds: string[], ...conditions: Expression[]): Expression => ({
  all: [{ ref: 'externalId', in: externalIds }, ...conditions],
});

function createSegment(headers: Headers, input: Record<string, unknown>) {
  return api<SegmentBody>('/v1/segments', {
    method: 'POST',
    headers,
    body: JSON.stringify({ slug: `seg-${uniq()}`, name: 'Segment', ...input }),
  });
}

async function preview(headers: Headers, expression: Expression) {
  const { status, body } = await api<{ count: number; sample: Array<{ externalId: string }> }>(
    '/v1/segments/preview',
    { method: 'POST', headers, body: JSON.stringify({ expression }) }
  );
  if (status !== 200) throw new Error(`preview failed: ${status} ${JSON.stringify(body)}`);
  return body.data!;
}

async function countUntil(headers: Headers, expression: Expression, expected: number, label: string) {
  await eventually(async () => (await preview(headers, expression)).count === expected, {
    label,
    timeoutMs: 90_000,
    intervalMs: 1000,
  });
}

async function putSubscriber(headers: Headers, externalId: string, attributes: Record<string, unknown>) {
  const { status } = await api(`/v1/subscribers/${encodeURIComponent(externalId)}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ attributes }),
  });
  if (status !== 200 && status !== 201) throw new Error(`put subscriber failed: ${status}`);
}

async function subscribe(headers: Headers, externalId: string) {
  const { status, body } = await api<{ id: string }>('/v1/subscriptions', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      externalId,
      channel: 'push',
      platform: 'ios',
      environment: 'sandbox',
      token: fakeToken('l'),
    }),
  });
  if (status !== 201 && status !== 200)
    throw new Error(`subscribe failed: ${status} ${JSON.stringify(body)}`);
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

async function send(headers: Headers, input: Record<string, unknown>) {
  const { status, body } = await api<{ id: string; status: string; counts: { total: number } }>(
    '/v1/messages',
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ title: 'Hello', body: 'World', ...input }),
    }
  );
  if (status !== 202) throw new Error(`send failed: ${status} ${JSON.stringify(body)}`);
  return eventually(
    async () => {
      const message = await api<{ id: string; status: string; counts: { total: number } }>(
        `/v1/messages/${body.data!.id}`,
        {
          headers,
        }
      );
      return message.body.data?.status === 'completed' ? message.body.data : undefined;
    },
    { label: 'message completed', timeoutMs: 120_000, intervalMs: 250 }
  );
}

async function deliveredTo(headers: Headers, id: string) {
  const { body } = await api<Page<{ externalId: string }>>(`/v1/messages/${id}/deliveries?limit=100`, {
    headers,
  });
  return (body.data?.items ?? []).map((item) => item.externalId).sort();
}

async function auditEvents(ownerBearer: Headers, workspaceSlug: string, event: string) {
  const { body } = await api<Page<AuditItem>>(`/v1/workspaces/${workspaceSlug}/audit?event=${event}`, {
    headers: ownerBearer,
  });
  return body.data?.items ?? [];
}

describe('segment slugs', () => {
  it('refuses the slugs the routes and the dashboard reserve', async () => {
    const { keyBearer } = await setupWorkspace({ push: 'unusable' });
    for (const slug of ['new', 'preview']) {
      const { status, body } = await createSegment(keyBearer, { slug, expression: { channel: 'push' } });
      expect(status, slug).toBe(400);
      expect(body.error?.code).toBe('slug_reserved');
      expect(body.error?.param).toBe('slug');
    }
    expect(
      (await createSegment(keyBearer, { slug: 'previews', expression: { channel: 'push' } })).status
    ).toBe(201);
  });
});

describe('segment audit trail', () => {
  it('records creation, every update and deletion with the diff', async () => {
    const { keyBearer, ownerBearer, workspace } = await setupWorkspace({ push: 'unusable' });
    const slug = `seg-${uniq()}`;
    const created = await createSegment(keyBearer, { slug, name: 'Before', expression: { channel: 'push' } });
    expect(created.status).toBe(201);
    const id = created.body.data!.id;

    const renamed = await api(`/v1/segments/${slug}`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ name: 'After', expression: { channel: 'email' } }),
    });
    expect(renamed.status).toBe(200);
    const unchanged = await api(`/v1/segments/${slug}`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ name: 'After' }),
    });
    expect(unchanged.status).toBe(200);
    expect((await api(`/v1/segments/${slug}`, { method: 'DELETE', headers: keyBearer })).status).toBe(200);

    const createdEvents = await auditEvents(ownerBearer, workspace.slug, 'segment.created');
    expect(createdEvents.find((item) => item.targetId === id)?.data).toEqual({ slug, name: 'Before' });

    const updatedEvents = (await auditEvents(ownerBearer, workspace.slug, 'segment.updated')).filter(
      (item) => item.targetId === id
    );
    expect(updatedEvents).toHaveLength(1);
    expect(updatedEvents[0]?.data?.slug).toBe(slug);
    expect(updatedEvents[0]?.data?.changes).toEqual(expect.arrayContaining(['name', 'version']));
    expect(updatedEvents[0]?.data?.previousAttributes).toMatchObject({ name: 'Before', version: 1 });

    const deletedEvents = await auditEvents(ownerBearer, workspace.slug, 'segment.deleted');
    expect(deletedEvents.find((item) => item.targetId === id)?.data).toEqual({ slug });
  });
});

describe('segment members', () => {
  it('pages members beyond the sample size, up to the API page limit', async () => {
    const { keyBearer } = await setupWorkspace({ push: 'unusable' });
    const prefix = `page${uniq()}`;
    const externalIds = Array.from(
      { length: 25 },
      (_, index) => `${prefix}_${String(index).padStart(2, '0')}`
    );
    await trackServer(
      keyBearer,
      externalIds.map((externalId) => ({ externalId, name: 'paged.seen' }))
    );
    const expression: Expression = { ref: 'externalId', contains: prefix };
    await countUntil(keyBearer, expression, 25, 'paged subscribers on the stream');
    const slug = `seg-${uniq()}`;
    await createSegment(keyBearer, { slug, expression });

    const sample = await preview(keyBearer, expression);
    expect(sample.sample).toHaveLength(20);

    const wide = await api<Page<{ externalId: string }>>(`/v1/segments/${slug}/members?limit=100`, {
      headers: keyBearer,
    });
    expect(wide.status).toBe(200);
    expect(wide.body.data?.items).toHaveLength(25);
    expect(wide.body.data?.hasMore).toBe(false);
    expect(wide.body.data?.total).toBe(25);

    const seen: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 10; page += 1) {
      const { body } = await api<Page<{ externalId: string }>>(
        `/v1/segments/${slug}/members?limit=10${cursor ? `&cursor=${cursor}` : ''}`,
        { headers: keyBearer }
      );
      seen.push(...body.data!.items.map((item) => item.externalId));
      if (!body.data!.hasMore) break;
      cursor = body.data!.nextCursor!;
    }
    expect(new Set(seen).size).toBe(25);
    expect([...seen].sort()).toEqual([...externalIds].sort());
  });

  it('drops a deleted subscriber from the count, the sample and sends', async () => {
    const { keyBearer } = await setupWorkspace({ push: 'unusable' });
    const externalId = `gone_${uniq()}`;
    await putSubscriber(keyBearer, externalId, { plan: 'pro' });
    await subscribe(keyBearer, externalId);
    const expression = only([externalId], { ref: 'attributes.plan', eq: 'pro' });
    await countUntil(keyBearer, expression, 1, 'subscriber on the stream');
    expect((await preview(keyBearer, expression)).sample.map((item) => item.externalId)).toEqual([
      externalId,
    ]);

    const slug = `seg-${uniq()}`;
    await createSegment(keyBearer, { slug, expression });
    const before = await send(keyBearer, { segment: slug });
    expect(before.counts.total).toBe(1);
    expect(await deliveredTo(keyBearer, before.id)).toEqual([externalId]);

    expect(
      (await api(`/v1/subscribers/${externalId}`, { method: 'DELETE', headers: keyBearer })).status
    ).toBe(200);
    await countUntil(keyBearer, expression, 0, 'subscriber gone from the stream');
    expect((await preview(keyBearer, expression)).sample).toEqual([]);
    const after = await send(keyBearer, { segment: slug });
    expect(after.counts.total).toBe(0);
  });

  it('filters members by their topic preference when a topic is given', async () => {
    const { keyBearer } = await setupWorkspace({ push: 'unusable' });
    const alice = `alice_${uniq()}`;
    const bob = `bob_${uniq()}`;
    for (const externalId of [alice, bob]) {
      await putSubscriber(keyBearer, externalId, { plan: 'pro' });
      await subscribe(keyBearer, externalId);
    }
    const topicSlug = `topic-${uniq()}`;
    const topic = await api<{ channels: string[]; defaultOptedIn: boolean }>('/v1/topics', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ slug: topicSlug, name: 'Deals' }),
    });
    expect(topic.status).toBe(201);
    expect(topic.body.data?.channels).toContain('push');
    expect(topic.body.data?.defaultOptedIn).toBe(true);
    const optedOut = await api(`/v1/subscribers/${bob}/preferences`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ preferences: { [topicSlug]: false } }),
    });
    expect(optedOut.status).toBe(200);

    const expression = only([alice, bob], { ref: 'attributes.plan', eq: 'pro' });
    await countUntil(keyBearer, expression, 2, 'both on the stream');
    const slug = `seg-${uniq()}`;
    await createSegment(keyBearer, { slug, expression });

    const everyone = await send(keyBearer, { segment: slug });
    expect(await deliveredTo(keyBearer, everyone.id)).toEqual([alice, bob].sort());
    const optedIn = await send(keyBearer, { segment: slug, topic: topicSlug });
    expect(optedIn.counts.total).toBe(1);
    expect(await deliveredTo(keyBearer, optedIn.id)).toEqual([alice]);
  });

  it('honors minute and hour windows against event timestamps', async () => {
    const { keyBearer } = await setupWorkspace({ push: 'unusable' });
    const externalId = `stale_${uniq()}`;
    await putSubscriber(keyBearer, externalId, { plan: 'pro' });
    await trackServer(keyBearer, [{ externalId, name: 'workout.completed', timestamp: daysAgo(5) }]);
    await countUntil(
      keyBearer,
      only([externalId], { count: 'workout.completed', gte: 1 }),
      1,
      'event on the stream'
    );

    expect(
      (await preview(keyBearer, only([externalId], { count: 'workout.completed', within: '30d', gte: 1 })))
        .count
    ).toBe(1);
    expect(
      (await preview(keyBearer, only([externalId], { count: 'workout.completed', within: '1h', gte: 1 })))
        .count
    ).toBe(0);
    expect(
      (await preview(keyBearer, only([externalId], { count: 'workout.completed', within: '90m', gte: 1 })))
        .count
    ).toBe(0);
    expect(
      (await preview(keyBearer, only([externalId], { never: 'workout.completed', within: '1h' }))).count
    ).toBe(1);
    expect((await preview(keyBearer, only([externalId], { never: 'workout.completed' }))).count).toBe(0);
  });
});

describe('segment previews', () => {
  it('rejects an expression it cannot compile, naming the field', async () => {
    const { keyBearer } = await setupWorkspace({ push: 'unusable' });
    const invalid = await api('/v1/segments/preview', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ expression: { any: [{ channel: 'push' }, { ref: 'email', eq: 'a@b.c' }] } }),
    });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error?.code).toBe('invalid_expression');
    expect(invalid.body.error?.param).toBe('expression.any[1]');

    const malformed = await api('/v1/segments/preview', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ expression: { count: 'a', within: '1w', gte: 1 } }),
    });
    expect(malformed.status).toBe(400);
    expect(
      (await api('/v1/segments/preview', { method: 'POST', headers: keyBearer, body: '{}' })).status
    ).toBe(400);
  });

  it('answers previews per tenant', async () => {
    const { keyBearer, owner, workspace } = await setupWorkspace({ push: 'unusable' });
    const externalId = `tenant_${uniq()}`;
    await putSubscriber(keyBearer, externalId, { plan: 'pro' });
    const expression: Expression = { ref: 'externalId', eq: externalId };
    await countUntil(keyBearer, expression, 1, 'subscriber on the stream');
    const slug = `seg-${uniq()}`;
    await createSegment(keyBearer, { slug, expression });

    const other = await createTenant(keyBearer, 'Other', { bare: true });
    const otherKey = await createKey(owner.token, workspace.slug, { kind: 'tenant', tenant: other.slug });
    const otherBearer = { Authorization: `Bearer ${otherKey.secret}` };
    expect((await preview(otherBearer, expression)).count).toBe(0);
    expect((await api(`/v1/segments/${slug}/members`, { headers: otherBearer })).status).toBe(404);
    expect((await api(`/v1/segments/${slug}/members`, { headers: keyBearer })).body.data).toMatchObject({
      total: 1,
    });
  });
});
