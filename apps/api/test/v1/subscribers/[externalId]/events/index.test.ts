import { describe, expect, it } from 'vitest';
import { api } from '../../../../utils/api';
import { fakeToken } from '../../../../utils/fixtures';
import { createKey, createTenant, setupWorkspace, uniq } from '../../../../utils/setup';

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

  it('includes subscriber and preference events, and names the subscription in event data', async () => {
    const { keyBearer } = await setupWorkspace();
    const externalId = `full-${uniq()}`;
    const identify = (attributes: Record<string, unknown>) =>
      api(`/v1/subscribers/${encodeURIComponent(externalId)}`, {
        method: 'PUT',
        headers: keyBearer,
        body: JSON.stringify({ attributes }),
      });
    expect((await identify({ plan: 'free' })).status).toBe(201);
    expect((await identify({ plan: 'pro' })).status).toBe(200);

    const token = fakeToken(externalId);
    const registered = await api<{ id: string }>('/v1/subscriptions', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ externalId, channel: 'push', platform: 'android', token }),
    });
    const topic = `deals-${uniq()}`;
    await api('/v1/topics', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ slug: topic, name: 'Deals' }),
    });
    await api(`/v1/subscribers/${encodeURIComponent(externalId)}/preferences`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ preferences: { [topic]: false } }),
    });
    await api(`/v1/subscriptions/${registered.body.data?.id}`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ enabled: false }),
    });

    const { body } = await api<{
      items: Array<{ event: string; targetType: string | null; data: Record<string, unknown> | null }>;
      total: number;
    }>(`/v1/subscribers/${encodeURIComponent(externalId)}/events?limit=100`, { headers: keyBearer });
    const items = body.data?.items ?? [];
    const events = items.map((item) => item.event);
    for (const expected of [
      'subscriber.created',
      'subscriber.updated',
      'subscription.created',
      'preferences.updated',
      'subscription.updated',
    ]) {
      expect(events, expected).toContain(expected);
    }
    expect(body.data?.total).toBe(items.length);

    const aboutSubscription = items.filter((item) => item.targetType === 'subscription');
    expect(aboutSubscription.length).toBeGreaterThanOrEqual(2);
    for (const item of aboutSubscription) {
      expect(item.data).toMatchObject({ externalId, channel: 'push', platform: 'android' });
      expect(item.data?.endpoint).toBe(token);
    }
  });

  it('is scoped to the tenant and needs subscribers:read', async () => {
    const { owner, workspace, keyBearer } = await setupWorkspace();
    const externalId = `scoped-${uniq()}`;
    await api(`/v1/subscribers/${encodeURIComponent(externalId)}`, {
      method: 'PUT',
      headers: keyBearer,
      body: '{}',
    });
    const path = `/v1/subscribers/${encodeURIComponent(externalId)}/events`;

    const other = await createTenant(keyBearer);
    const foreign = await api(path, { headers: { ...keyBearer, 'buzzkit-tenant': other.slug } });
    expect(foreign.status).toBe(404);

    const wrongScope = await createKey(owner.token, workspace.slug, { scopes: ['messages:read'] });
    const denied = await api(path, { headers: { Authorization: `Bearer ${wrongScope.secret}` } });
    expect(denied.status).toBe(403);

    const readOnly = await createKey(owner.token, workspace.slug, { scopes: ['subscribers:read'] });
    const ok = await api(path, { headers: { Authorization: `Bearer ${readOnly.secret}` } });
    expect(ok.status).toBe(200);
  });
});
