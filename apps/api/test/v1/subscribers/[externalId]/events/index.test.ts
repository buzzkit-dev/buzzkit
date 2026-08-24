import { describe, expect, it } from 'vitest';
import { api } from '../../../../utils/api';
import { fakeToken } from '../../../../utils/fixtures';
import { setupWorkspace, uniq } from '../../../../utils/setup';

describe('GET /v1/subscribers/:externalId/events', () => {
  it('lists the ledger about one subscriber, newest first, with a total', async () => {
    const { keyBearer } = await setupWorkspace();
    const externalId = `hist-${uniq()}`;
    const other = `other-${uniq()}`;

    const registered = await api<{ id: string }>('/v1/subscriptions', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ externalId, channel: 'push', platform: 'ios', token: fakeToken('h') }),
    });
    await api('/v1/subscriptions', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ externalId: other, channel: 'push', platform: 'ios', token: fakeToken('o') }),
    });
    await api(`/v1/subscriptions/${registered.body.data?.id}`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ enabled: false }),
    });
    await api(`/v1/subscriptions/${registered.body.data?.id}`, { method: 'DELETE', headers: keyBearer });

    const { status, body } = await api<{
      items: Array<{ event: string; targetType: string | null; data: Record<string, unknown> | null }>;
      total: number;
    }>(`/v1/subscribers/${encodeURIComponent(externalId)}/events`, { headers: keyBearer });

    expect(status).toBe(200);
    const events = body.data?.items.map((item) => item.event) ?? [];
    expect(events).toEqual(['subscription.removed', 'subscription.updated', 'subscription.created']);
    expect(body.data?.total).toBe(3);
    expect(body.data?.items.every((item) => item.data?.externalId !== other)).toBe(true);
    expect(body.data?.items.every((item) => typeof item.data?.endpoint === 'string')).toBe(true);
    expect(body.data?.items[1]?.data?.enabled).toBe(false);
  });

  it('404s for an unknown subscriber and pages with cursors', async () => {
    const { keyBearer } = await setupWorkspace();
    const missing = await api(`/v1/subscribers/nobody-${uniq()}/events`, { headers: keyBearer });
    expect(missing.status).toBe(404);

    const externalId = `page-${uniq()}`;
    for (const platform of ['ios', 'android', 'ios'] as const) {
      await api('/v1/subscriptions', {
        method: 'POST',
        headers: keyBearer,
        body: JSON.stringify({ externalId, channel: 'push', platform, token: fakeToken(uniq()) }),
      });
    }
    const page1 = await api<{ items: unknown[]; hasMore: boolean; nextCursor: string; total: number }>(
      `/v1/subscribers/${encodeURIComponent(externalId)}/events?limit=2`,
      { headers: keyBearer }
    );
    expect(page1.body.data?.items).toHaveLength(2);
    expect(page1.body.data?.hasMore).toBe(true);
    expect(page1.body.data?.total).toBe(3);
    const page2 = await api<{ items: unknown[]; hasMore: boolean }>(
      `/v1/subscribers/${encodeURIComponent(externalId)}/events?limit=2&cursor=${page1.body.data?.nextCursor}`,
      { headers: keyBearer }
    );
    expect(page2.body.data?.items).toHaveLength(1);
    expect(page2.body.data?.hasMore).toBe(false);
  });
});
