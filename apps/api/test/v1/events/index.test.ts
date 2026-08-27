import { describe, expect, it } from 'vitest';
import { api } from '../../utils/api';
import { eventually } from '../../utils/eventually';
import { setupWorkspace, uniq } from '../../utils/setup';

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

describe('POST /v1/events', () => {
  it('accepts one event, creates the subscriber, and assigns an id and a sequence', async () => {
    const { keyBearer } = await setupWorkspace();
    const externalId = `user_${uniq()}`;

    const { status, body } = await api<Tracked>('/v1/events', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ externalId, name: 'workout.completed', data: { duration: 42 } }),
    });

    expect(status).toBe(202);
    expect(body.data?.id).toMatch(/^evt_[0-9a-f-]{36}$/);
    expect(body.data?.sequence).toBe(2);
    expect(body.data?.source).toBe('server');
    expect(body.data?.status).toBe('accepted');
    expect(body.data?.data).toEqual({ duration: 42 });

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

    const { status, body } = await api<Listed>('/v1/events', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({
        events: [
          { externalId: a, name: 'workout.completed', id: dedupe },
          { externalId: b, name: 'workout.completed' },
          { externalId: a, name: 'workout.completed', id: dedupe },
          { externalId: a, name: 'app.reviewed' },
        ],
      }),
    });

    expect(status).toBe(202);
    const items = body.data?.items ?? [];
    expect(items.map((item) => item.status)).toEqual(['accepted', 'accepted', 'duplicate', 'accepted']);
    expect(items[2]?.id).toBe(items[0]?.id);
    expect(items[0]!.sequence).toBeLessThan(items[3]!.sequence);

    const replay = await api<Listed>('/v1/events', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ events: [{ externalId: a, name: 'workout.completed', id: dedupe }] }),
    });
    expect(replay.body.data?.items[0]?.status).toBe('duplicate');
    expect(replay.body.data?.items[0]?.id).toBe(items[0]?.id);
  });

  it('refuses reserved names from the server, bad timestamps, and oversized data', async () => {
    const { keyBearer } = await setupWorkspace();
    const externalId = `user_${uniq()}`;

    const reserved = await api('/v1/events', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ externalId, name: '$app.opened' }),
    });
    expect(reserved.status).toBe(400);
    expect(reserved.body.error?.code).toBe('reserved_event');

    const stale = await api('/v1/events', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ externalId, name: 'x', timestamp: '2020-01-01T00:00:00.000Z' }),
    });
    expect(stale.status).toBe(400);
    expect(stale.body.error?.code).toBe('invalid_timestamp');

    const large = await api('/v1/events', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ externalId, name: 'x', data: { blob: 'x'.repeat(9000) } }),
    });
    expect(large.status).toBe(400);
    expect(large.body.error?.code).toBe('event_data_too_large');

    const uppercase = await api('/v1/events', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ externalId, name: 'Workout.Completed' }),
    });
    expect(uppercase.status).toBe(400);
    expect(uppercase.body.error?.code).toBe('validation');
  });

  it('keeps the original timestamp and stamps receivedAt', async () => {
    const { keyBearer } = await setupWorkspace();
    const timestamp = new Date(Date.now() - 3_600_000).toISOString();

    const { body } = await api<Tracked>('/v1/events', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ externalId: `user_${uniq()}`, name: 'workout.completed', timestamp }),
    });

    expect(body.data?.timestamp).toBe(timestamp);
    expect(new Date(body.data!.receivedAt).getTime()).toBeGreaterThan(new Date(timestamp).getTime());
  });
});

describe('the event log', () => {
  it('lands in Tinybird once per event, in order, and shows in the catalog, the list and the timeline', async () => {
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
      { label: 'events listed' }
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
      { label: 'catalog' }
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

  it('scopes reads and writes to the tenant', async () => {
    const { keyBearer } = await setupWorkspace();
    const other = await setupWorkspace();
    const name = `test.${uniq()}`;

    await api('/v1/events', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ externalId: `user_${uniq()}`, name }),
    });
    await eventually(async () => {
      const { body } = await api<Listed>(`/v1/events?name=${name}`, { headers: keyBearer });
      return body.data?.items.length ? true : undefined;
    });

    const foreign = await api<Listed>(`/v1/events?name=${name}`, { headers: other.keyBearer });
    expect(foreign.body.data?.items).toEqual([]);
  });
});
