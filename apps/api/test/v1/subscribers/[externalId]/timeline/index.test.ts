import { describe, expect, it } from 'vitest';
import { api } from '../../../../utils/api';
import { eventually } from '../../../../utils/eventually';
import { fakeToken } from '../../../../utils/fixtures';
import { createClientKey, createKey, createTenant, setupWorkspace, uniq } from '../../../../utils/setup';

type TimelineItem = {
  id: string;
  sequence: number;
  name: string;
  source: string;
  externalId: string | null;
  timestamp: string;
  receivedAt: string;
  data: Record<string, unknown>;
  runId: string | null;
  messageId: string | null;
  step: string | null;
};

type TimelinePage = { items: TimelineItem[]; hasMore: boolean; nextCursor: string | null };

type Headers = Record<string, string>;

function timelinePath(externalId: string, query = ''): string {
  return `/v1/subscribers/${encodeURIComponent(externalId)}/timeline${query}`;
}

async function timelinePage(headers: Headers, externalId: string, query = '') {
  return await api<TimelinePage>(timelinePath(externalId, query), { headers });
}

async function collectPages(headers: Headers, externalId: string, limit: number): Promise<TimelinePage[]> {
  const pages: TimelinePage[] = [];
  let cursor: string | null = null;
  do {
    const { status, body } = await timelinePage(
      headers,
      externalId,
      `?limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`
    );
    if (status !== 200 || !body.data)
      throw new Error(`timeline page failed: ${status} ${JSON.stringify(body)}`);
    pages.push(body.data);
    cursor = body.data.nextCursor;
  } while (pages[pages.length - 1]?.hasMore);
  return pages;
}

async function trackBatch(headers: Headers, externalId: string, names: string[]) {
  const { status, body } = await api<{ items: Array<{ id: string; sequence: number; name: string }> }>(
    '/v1/events',
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        events: names.map((name, index) => ({ externalId, name, data: { index, name } })),
      }),
    }
  );
  if (status !== 202 || !body.data) throw new Error(`track failed: ${status} ${JSON.stringify(body)}`);
  return body.data.items;
}

async function seedLongTimeline(headers: Headers) {
  const externalId = `user_${uniq()}`;
  const topic = `topic-${uniq()}`;
  await api('/v1/topics', { method: 'POST', headers, body: JSON.stringify({ slug: topic, name: 'Topic' }) });

  const tracked: Array<{ id: string; sequence: number; name: string }> = [];
  const lifecycle: string[] = [];

  await api(`/v1/subscribers/${externalId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ attributes: { plan: 'pro' } }),
  });
  lifecycle.push('$subscriber.created');

  tracked.push(
    ...(await trackBatch(
      headers,
      externalId,
      Array.from({ length: 100 }, (_, index) => `bulk.a${index}`)
    ))
  );

  const registered = await api<{ id: string }>('/v1/subscriptions', {
    method: 'POST',
    headers,
    body: JSON.stringify({ externalId, platform: 'ios', token: fakeToken() }),
  });
  lifecycle.push('$subscription.registered');
  await api(`/v1/subscriptions/${registered.body.data?.id}`, {
    method: 'PATCH',
    headers,
    body: '{"enabled":false}',
  });
  lifecycle.push('$subscription.muted');
  await api(`/v1/subscriptions/${registered.body.data?.id}`, {
    method: 'PATCH',
    headers,
    body: '{"enabled":true}',
  });
  lifecycle.push('$subscription.unmuted');
  await api(`/v1/subscribers/${externalId}/preferences`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ preferences: { [topic]: false } }),
  });
  lifecycle.push('$preferences.updated');

  tracked.push(
    ...(await trackBatch(
      headers,
      externalId,
      Array.from({ length: 30 }, (_, index) => `bulk.b${index}`)
    ))
  );

  return { externalId, tracked, lifecycle, total: tracked.length + lifecycle.length };
}

describe('GET /v1/subscribers/:externalId/timeline', () => {
  it('404s for an unknown subscriber and needs subscribers:read', async () => {
    const { owner, workspace, keyBearer } = await setupWorkspace();

    const unknown = await api(`/v1/subscribers/nobody_${uniq()}/timeline`, { headers: keyBearer });
    expect(unknown.status).toBe(404);

    const externalId = `user_${uniq()}`;
    await api(`/v1/subscribers/${externalId}`, { method: 'PUT', headers: keyBearer, body: '{}' });
    const limited = await createKey(owner.token, workspace.slug, { scopes: ['messages:read'] });
    const denied = await api(`/v1/subscribers/${externalId}/timeline`, {
      headers: { Authorization: `Bearer ${limited.secret}` },
    });
    expect(denied.status).toBe(403);
  });

  it('is scoped to the tenant', async () => {
    const { keyBearer } = await setupWorkspace();
    const other = await createTenant(keyBearer);
    const externalId = `user_${uniq()}`;
    await api(`/v1/subscribers/${externalId}`, { method: 'PUT', headers: keyBearer, body: '{}' });

    await eventually(async () => {
      const { body } = await api<{ items: Array<{ name: string }> }>(
        `/v1/subscribers/${externalId}/timeline`,
        {
          headers: keyBearer,
        }
      );
      return body.data?.items.length ? true : undefined;
    });

    const foreign = await api(`/v1/subscribers/${externalId}/timeline`, {
      headers: { ...keyBearer, 'buzzkit-tenant': other.slug },
    });
    expect(foreign.status).toBe(404);
  });
});

describe('GET /v1/subscribers/:externalId/timeline — paging across the actor and Tinybird', () => {
  it('pages a 135-event timeline in 25s with strictly descending, gap-free, duplicate-free sequences', async () => {
    const { keyBearer } = await setupWorkspace();
    const { externalId, tracked, lifecycle, total } = await seedLongTimeline(keyBearer);
    expect(total).toBe(135);
    expect(tracked.map((item) => item.sequence)).toEqual([
      ...Array.from({ length: 100 }, (_, index) => index + 2),
      ...Array.from({ length: 30 }, (_, index) => index + 106),
    ]);

    const pages = await eventually(
      async () => {
        const collected = await collectPages(keyBearer, externalId, 25);
        const count = collected.reduce((sum, page) => sum + page.items.length, 0);
        return count === total ? collected : undefined;
      },
      { timeoutMs: 60_000, label: 'every page of the timeline' }
    );

    expect(pages).toHaveLength(6);
    expect(pages.map((page) => page.items.length)).toEqual([25, 25, 25, 25, 25, 10]);
    expect(pages.map((page) => page.hasMore)).toEqual([true, true, true, true, true, false]);
    for (const page of pages.slice(0, -1)) {
      expect(page.nextCursor).toBe(String(page.items[page.items.length - 1]?.sequence));
    }
    expect(pages[pages.length - 1]?.nextCursor).toBeNull();

    const items = pages.flatMap((page) => page.items);
    expect(items.map((item) => item.sequence)).toEqual(
      Array.from({ length: total }, (_, index) => total - index)
    );
    expect(new Set(items.map((item) => item.id)).size).toBe(total);

    const bySequence = new Map(items.map((item) => [item.sequence, item]));
    for (const event of tracked) {
      expect(bySequence.get(event.sequence)).toMatchObject({
        id: event.id,
        name: event.name,
        source: 'server',
        externalId,
        data: { name: event.name },
      });
    }
    expect(items.filter((item) => item.source === 'system').map((item) => item.name)).toEqual(
      [...lifecycle].reverse()
    );
    expect(items.filter((item) => item.name.startsWith('bulk.'))).toHaveLength(130);
    for (const item of items) expect(item.externalId).toBe(externalId);
  }, 90_000);

  it('serves page one from the actor and later pages from Tinybird with identical records at the seam', async () => {
    const { keyBearer } = await setupWorkspace();
    const { externalId, total } = await seedLongTimeline(keyBearer);

    const head = await timelinePage(keyBearer, externalId, '?limit=25');
    expect(head.status).toBe(200);
    expect(head.body.data?.items.map((item) => item.sequence)).toEqual(
      Array.from({ length: 25 }, (_, index) => total - index)
    );
    expect(head.body.data?.hasMore).toBe(true);
    expect(head.body.data?.nextCursor).toBe(String(total - 24));

    const mirrored = await eventually(
      async () => {
        const { body } = await timelinePage(keyBearer, externalId, `?limit=25&cursor=${total + 1}`);
        return body.data?.items.length === 25 ? body.data : undefined;
      },
      { timeoutMs: 60_000, label: 'the head of the timeline in Tinybird' }
    );
    expect(mirrored.items).toEqual(head.body.data?.items);
    expect(mirrored.hasMore).toBe(true);
    expect(mirrored.nextCursor).toBe(head.body.data?.nextCursor);

    const next = await timelinePage(keyBearer, externalId, `?limit=25&cursor=${head.body.data?.nextCursor}`);
    expect(next.body.data?.items[0]?.sequence).toBe(total - 25);
    expect(next.body.data?.items.map((item) => item.sequence)).toEqual(
      Array.from({ length: 25 }, (_, index) => total - 25 - index)
    );

    const full = await timelinePage(keyBearer, externalId, '?limit=100');
    expect(full.body.data?.items).toHaveLength(100);
    expect(full.body.data?.hasMore).toBe(true);
    expect(full.body.data?.nextCursor).toBe(String(total - 99));
    const rest = await timelinePage(keyBearer, externalId, `?limit=100&cursor=${full.body.data?.nextCursor}`);
    expect(rest.body.data?.items.map((item) => item.sequence)).toEqual(
      Array.from({ length: total - 100 }, (_, index) => total - 100 - index)
    );
    expect(rest.body.data?.hasMore).toBe(false);
    expect(rest.body.data?.nextCursor).toBeNull();
  }, 90_000);

  it('a cursor at or below the oldest sequence is an empty last page; the default limit is 50', async () => {
    const { keyBearer } = await setupWorkspace();
    const externalId = `user_${uniq()}`;
    await api(`/v1/subscribers/${externalId}`, {
      method: 'PUT',
      headers: keyBearer,
      body: JSON.stringify({ attributes: { plan: 'pro' } }),
    });
    await trackBatch(
      keyBearer,
      externalId,
      Array.from({ length: 60 }, (_, index) => `small.${index}`)
    );

    const defaulted = await timelinePage(keyBearer, externalId);
    expect(defaulted.body.data?.items).toHaveLength(50);
    expect(defaulted.body.data?.hasMore).toBe(true);
    expect(defaulted.body.data?.nextCursor).toBe('12');

    const oldest = await eventually(
      async () => {
        const { body } = await timelinePage(keyBearer, externalId, '?cursor=2');
        return body.data?.items.length === 1 ? body.data : undefined;
      },
      { label: 'the oldest event in Tinybird' }
    );
    expect(oldest.items[0]).toMatchObject({ sequence: 1, name: '$subscriber.created', source: 'system' });
    expect(oldest.hasMore).toBe(false);
    expect(oldest.nextCursor).toBeNull();

    const beyond = await timelinePage(keyBearer, externalId, '?cursor=1');
    expect(beyond.status).toBe(200);
    expect(beyond.body.data).toEqual({ items: [], hasMore: false, nextCursor: null });
  });

  it('validates limit and cursor', async () => {
    const { keyBearer } = await setupWorkspace();
    const externalId = `user_${uniq()}`;
    await api(`/v1/subscribers/${externalId}`, { method: 'PUT', headers: keyBearer, body: '{}' });

    for (const query of ['?limit=0', '?limit=101', '?limit=-1', '?limit=abc', '?limit=2.5']) {
      const { status, body } = await timelinePage(keyBearer, externalId, query);
      expect(status, query).toBe(400);
      expect(body.error?.code, query).toBe('validation');
    }

    for (const query of [
      '?cursor=abc',
      '?cursor=0',
      '?cursor=-5',
      '?cursor=1.5',
      '?cursor=evt_1',
      '?cursor=',
    ]) {
      const { status, body } = await timelinePage(keyBearer, externalId, query);
      expect(status, query).toBe(400);
      expect(body.error?.code, query).toBe('invalid_cursor');
    }

    const one = await timelinePage(keyBearer, externalId, '?limit=1');
    expect(one.status).toBe(200);
    expect(one.body.data?.items).toHaveLength(1);
    expect(one.body.data?.hasMore).toBe(false);

    const hundred = await timelinePage(keyBearer, externalId, '?limit=100');
    expect(hundred.status).toBe(200);
  });

  it('rejects a fractional limit as a validation error naming the param', async () => {
    const { keyBearer } = await setupWorkspace();
    const externalId = `user_${uniq()}`;
    await api(`/v1/subscribers/${externalId}`, { method: 'PUT', headers: keyBearer, body: '{}' });

    const { status, body } = await timelinePage(keyBearer, externalId, '?limit=2.5');
    expect(status).toBe(400);
    expect(body.error?.code).toBe('validation');
    expect(body.error?.param).toBe('limit');
  });
});

describe('GET /v1/subscribers/:externalId/timeline — access and isolation', () => {
  it('requires subscribers:read; a client key, a foreign scope and a session without a workspace are refused', async () => {
    const { owner, workspace, keyBearer, ownerBearer } = await setupWorkspace();
    const externalId = `user_${uniq()}`;
    await api(`/v1/subscribers/${externalId}`, { method: 'PUT', headers: keyBearer, body: '{}' });

    const reader = await createKey(owner.token, workspace.slug, { scopes: ['subscribers:read'] });
    const allowed = await timelinePage({ Authorization: `Bearer ${reader.secret}` }, externalId);
    expect(allowed.status).toBe(200);
    expect(allowed.body.data?.items.map((item) => item.name)).toEqual(['$subscriber.created']);

    const tenantReader = await createKey(owner.token, workspace.slug, {
      kind: 'tenant',
      tenant: 'default',
      scopes: ['subscribers:read'],
    });
    const viaTenantKey = await timelinePage({ Authorization: `Bearer ${tenantReader.secret}` }, externalId);
    expect(viaTenantKey.status).toBe(200);

    const neighbour = await createKey(owner.token, workspace.slug, {
      scopes: ['subscriptions:read', 'events:read', 'subscribers:write'],
    });
    const denied = await timelinePage({ Authorization: `Bearer ${neighbour.secret}` }, externalId);
    expect(denied.status).toBe(403);

    const clientKey = await createClientKey(owner.token, workspace.slug, 'default');
    const viaClient = await timelinePage({ Authorization: `Bearer ${clientKey.secret}` }, externalId);
    expect(viaClient.status).toBe(401);

    const viaSession = await timelinePage(
      { ...ownerBearer, 'buzzkit-workspace': workspace.slug },
      externalId
    );
    expect(viaSession.status).toBe(200);

    const anonymous = await api(timelinePath(externalId));
    expect(anonymous.status).toBe(401);
  });

  it('the same externalId in two tenants has two independent timelines', async () => {
    const { keyBearer } = await setupWorkspace();
    const other = await createTenant(keyBearer);
    const otherBearer = { ...keyBearer, 'buzzkit-tenant': other.slug };
    const externalId = `shared_${uniq()}`;

    await api(`/v1/subscribers/${externalId}`, {
      method: 'PUT',
      headers: keyBearer,
      body: JSON.stringify({ attributes: { tenant: 'default' } }),
    });
    await api(`/v1/subscribers/${externalId}`, {
      method: 'PUT',
      headers: otherBearer,
      body: JSON.stringify({ attributes: { tenant: 'other' } }),
    });
    await api('/v1/events', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ externalId, name: 'only.default' }),
    });
    await api('/v1/subscriptions', {
      method: 'POST',
      headers: otherBearer,
      body: JSON.stringify({ externalId, platform: 'android', token: fakeToken() }),
    });

    const ours = await timelinePage(keyBearer, externalId);
    expect(ours.body.data?.items.map((item) => [item.sequence, item.name])).toEqual([
      [2, 'only.default'],
      [1, '$subscriber.created'],
    ]);
    expect(ours.body.data?.items[1]?.data).toEqual({ externalId, attributes: { tenant: 'default' } });

    const theirs = await timelinePage(otherBearer, externalId);
    expect(theirs.body.data?.items.map((item) => [item.sequence, item.name])).toEqual([
      [2, '$subscription.registered'],
      [1, '$subscriber.created'],
    ]);
    expect(theirs.body.data?.items[1]?.data).toEqual({ externalId, attributes: { tenant: 'other' } });

    const ids = [...(ours.body.data?.items ?? []), ...(theirs.body.data?.items ?? [])].map((item) => item.id);
    expect(new Set(ids).size).toBe(4);
  });

  it('accepts URL-encoded external ids', async () => {
    const { keyBearer } = await setupWorkspace();
    const externalId = `jane doe+${uniq()}@acme.test/ü`;
    const created = await api(`/v1/subscribers/${encodeURIComponent(externalId)}`, {
      method: 'PUT',
      headers: keyBearer,
      body: '{}',
    });
    expect(created.status).toBe(201);

    const { status, body } = await timelinePage(keyBearer, externalId);
    expect(status).toBe(200);
    expect(body.data?.items[0]).toMatchObject({
      name: '$subscriber.created',
      externalId,
      data: { externalId, attributes: {} },
    });
  });
});
