import { describe, expect, it } from 'vitest';
import { api, BASE_URL } from '../../utils/api';
import { db, sql } from '../../utils/db';
import { eventually } from '../../utils/eventually';
import { addMember, setupWorkspace, uniq } from '../../utils/setup';

type SourceBody = { id: string; url: string };
type DeliveryPage = {
  items: Array<{ id: string; outcome: string; providerType: string | null }>;
  hasMore: boolean;
  nextCursor: string | null;
  total: number;
};
type Listed = { items: Array<{ name: string; source: string; data: Record<string, unknown> }> };

async function customSource(headers: Record<string, string>, name: string, secret: string) {
  const created = await api<SourceBody>('/v1/sources', {
    method: 'POST',
    headers,
    body: JSON.stringify({ name, provider: 'custom', secret }),
  });
  expect(created.status).toBe(201);
  return created.body.data!;
}

async function ingest(url: string, body: string, secret: string) {
  return api<{ outcome: string }>(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-buzzkit-secret': secret },
    body,
  });
}

describe('sources hardening', () => {
  it('pages deliveries with a cursor and a total, and refuses oversized bodies', async () => {
    const { keyBearer } = await setupWorkspace({ bare: true });
    const source = await customSource(keyBearer, 'Paging', 'page_secret');
    for (const n of [1, 2, 3]) {
      const sent = await ingest(
        source.url,
        JSON.stringify({ id: `p${n}`, type: 'ping', userId: 'nobody' }),
        'page_secret'
      );
      expect(sent.status).toBe(200);
    }

    const first = await api<DeliveryPage>(`/v1/sources/${source.id}/deliveries?limit=2`, {
      headers: keyBearer,
    });
    expect(first.body.data?.total).toBe(3);
    expect(first.body.data?.items).toHaveLength(2);
    expect(first.body.data?.hasMore).toBe(true);
    const cursor = first.body.data?.nextCursor;
    expect(cursor).toMatch(/^sdl_/);

    const second = await api<DeliveryPage>(`/v1/sources/${source.id}/deliveries?limit=2&cursor=${cursor}`, {
      headers: keyBearer,
    });
    expect(second.body.data?.items).toHaveLength(1);
    expect(second.body.data?.hasMore).toBe(false);
    expect(second.body.data?.total).toBe(3);
    const ids = [...(first.body.data?.items ?? []), ...(second.body.data?.items ?? [])].map(
      (item) => item.id
    );
    expect(new Set(ids).size).toBe(3);

    const huge = await ingest(source.url, `{"type":"big","pad":"${'x'.repeat(300_000)}"}`, 'page_secret');
    expect(huge.status).toBe(400);
    expect(huge.body.error?.code).toBe('payload_too_large');
  });

  it('purges deliveries older than thirty days when the five-minute sweep runs', async () => {
    const { keyBearer } = await setupWorkspace({ bare: true });
    const source = await customSource(keyBearer, 'Retention', 'purge_secret');
    await ingest(source.url, JSON.stringify({ id: 'old', type: 'ping', userId: 'nobody' }), 'purge_secret');
    const sourceRow = await db.execute(
      sql`update source_delivery set received_at = now() - interval '31 days'
          where source_id = (select id from source where name = 'Retention' order by id desc limit 1)`
    );
    expect(sourceRow).toBeDefined();
    await ingest(source.url, JSON.stringify({ id: 'fresh', type: 'ping', userId: 'nobody' }), 'purge_secret');

    const sweep = await fetch(`${BASE_URL}/__scheduled?cron=*/5+*+*+*+*`);
    expect(sweep.ok).toBe(true);

    await eventually(
      async () => {
        const { body } = await api<DeliveryPage>(`/v1/sources/${source.id}/deliveries`, {
          headers: keyBearer,
        });
        return body.data?.total === 1 && body.data.items[0]?.id ? body.data : undefined;
      },
      { label: 'purged ledger', timeoutMs: 30_000 }
    );
  });

  it('answers 404 on a deleted source and keeps members read-only', async () => {
    const { owner, workspace, keyBearer } = await setupWorkspace({ bare: true });
    const source = await customSource(keyBearer, 'Gone soon', 'gone_secret');

    const member = await addMember(owner.token, workspace.slug, 'member');
    const memberHeaders = {
      ...member.bearer,
      'buzzkit-workspace': workspace.slug,
      'buzzkit-tenant': 'default',
    };
    const read = await api(`/v1/sources/${source.id}`, { headers: memberHeaders });
    expect(read.status).toBe(200);
    const write = await api(`/v1/sources/${source.id}`, {
      method: 'PATCH',
      headers: memberHeaders,
      body: JSON.stringify({ name: 'Nope' }),
    });
    expect(write.status).toBe(403);
    const create = await api('/v1/sources', {
      method: 'POST',
      headers: memberHeaders,
      body: JSON.stringify({ name: 'Nope', provider: 'custom' }),
    });
    expect(create.status).toBe(403);

    await api(`/v1/sources/${source.id}`, { method: 'DELETE', headers: keyBearer });
    const dead = await ingest(
      source.url,
      JSON.stringify({ id: 'x', type: 'ping', userId: 'nobody' }),
      'gone_secret'
    );
    expect(dead.status).toBe(404);
  });

  it('filters the timeline, the stream and the catalog by source and provider', async () => {
    const { keyBearer } = await setupWorkspace({ bare: true });
    const externalId = `user_${uniq()}`;
    await api(`/v1/subscribers/${externalId}`, {
      method: 'PUT',
      headers: keyBearer,
      body: JSON.stringify({}),
    });
    const serverEvent = `hard.server.${uniq().toLowerCase()}`;
    const webhookEvent = `hard.webhook.${uniq().toLowerCase()}`;
    await api('/v1/events', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ externalId, name: serverEvent }),
    });
    const source = await customSource(keyBearer, 'Filters', 'filter_secret');
    const sent = await ingest(
      source.url,
      JSON.stringify({ id: 'w1', type: webhookEvent, userId: externalId }),
      'filter_secret'
    );
    expect(sent.body.data?.outcome).toBe('event');

    const byName = await api<Listed>(`/v1/subscribers/${externalId}/timeline?name=${serverEvent}`, {
      headers: keyBearer,
    });
    expect(byName.body.data?.items.map((item) => item.name)).toEqual([serverEvent]);
    const bySource = await api<Listed>(`/v1/subscribers/${externalId}/timeline?source=webhook`, {
      headers: keyBearer,
    });
    expect(bySource.body.data?.items.map((item) => item.name)).toEqual([webhookEvent]);
    const byProvider = await api<Listed>(`/v1/subscribers/${externalId}/timeline?provider=custom`, {
      headers: keyBearer,
    });
    expect(byProvider.body.data?.items.map((item) => item.name)).toEqual([webhookEvent]);
    const wrongProvider = await api<Listed>(`/v1/subscribers/${externalId}/timeline?provider=stripe`, {
      headers: keyBearer,
    });
    expect(wrongProvider.body.data?.items).toEqual([]);

    await eventually(
      async () => {
        const { body } = await api<Listed>(`/v1/events?source=webhook&provider=custom&limit=50`, {
          headers: keyBearer,
        });
        const names = body.data?.items.map((item) => item.name) ?? [];
        return names.includes(webhookEvent) && !names.includes(serverEvent) ? names : undefined;
      },
      { label: 'stream provider filter', timeoutMs: 120_000 }
    );
    const wrongStream = await api<Listed>(`/v1/events?source=webhook&provider=stripe&limit=50`, {
      headers: keyBearer,
    });
    expect(wrongStream.body.data?.items.map((item) => item.name)).not.toContain(webhookEvent);

    await eventually(
      async () => {
        const { body } = await api<{ items: Array<{ name: string; providers: string[] }> }>(
          '/v1/events/names',
          {
            headers: keyBearer,
          }
        );
        const entry = body.data?.items.find((item) => item.name === webhookEvent);
        return entry?.providers.includes('custom') ? entry : undefined;
      },
      { label: 'catalog providers', timeoutMs: 120_000 }
    );
  });
});
