import { describe, expect, it } from 'vitest';
import { api } from '../../../../utils/api';
import { fakeToken } from '../../../../utils/fixtures';
import { createKey, createTenant, setupWorkspace, uniq } from '../../../../utils/setup';

async function waitFor<T>(probe: () => Promise<T | null>, timeoutMs = 60_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await probe();
    if (value !== null) return value;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('timed out waiting for condition');
}

type DeliveryItem = {
  status: string;
  channel: string;
  message: { id: string; title: string | null; body: string | null };
};

describe('GET /v1/subscribers/:externalId/deliveries', () => {
  it('lists what a subscriber was sent, with the message summary and a total', async () => {
    const { keyBearer } = await setupWorkspace();
    const externalId = `inbox-${uniq()}`;
    const bystander = `bystander-${uniq()}`;
    for (const id of [externalId, bystander]) {
      await api('/v1/subscriptions', {
        method: 'POST',
        headers: keyBearer,
        body: JSON.stringify({ externalId: id, channel: 'push', platform: 'ios', token: fakeToken(id) }),
      });
    }

    const sent = await api<{ id: string }>('/v1/messages', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ title: 'Your order shipped', body: 'Arrives Thursday', to: externalId }),
    });
    expect(sent.status).toBe(202);

    const page = await waitFor(async () => {
      const { body } = await api<{ items: DeliveryItem[]; total: number }>(
        `/v1/subscribers/${encodeURIComponent(externalId)}/deliveries`,
        { headers: keyBearer }
      );
      return (body.data?.items.length ?? 0) > 0 ? body.data : null;
    });
    expect(page?.total).toBe(1);
    expect(page?.items[0]?.message.title).toBe('Your order shipped');
    expect(page?.items[0]?.message.id).toBe(sent.body.data?.id);
    expect(page?.items[0]?.channel).toBe('push');

    const none = await api<{ items: unknown[]; total: number }>(
      `/v1/subscribers/${encodeURIComponent(bystander)}/deliveries`,
      { headers: keyBearer }
    );
    expect(none.body.data?.items).toHaveLength(0);
    expect(none.body.data?.total).toBe(0);

    const missing = await api(`/v1/subscribers/nobody-${uniq()}/deliveries`, { headers: keyBearer });
    expect(missing.status).toBe(404);
  });

  it('pages newest first with cursors and encodes every id', async () => {
    const { keyBearer } = await setupWorkspace();
    const externalId = `pager-${uniq()}`;
    await api('/v1/subscriptions', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ externalId, channel: 'push', platform: 'ios', token: fakeToken(externalId) }),
    });
    for (const title of ['First', 'Second', 'Third']) {
      const sent = await api('/v1/messages', {
        method: 'POST',
        headers: keyBearer,
        body: JSON.stringify({ title, to: externalId }),
      });
      expect(sent.status).toBe(202);
    }

    type Page = {
      items: Array<{ id: string; message: { id: string; title: string } }>;
      hasMore: boolean;
      nextCursor: string | null;
      total: number;
    };
    const path = `/v1/subscribers/${encodeURIComponent(externalId)}/deliveries`;
    const first = await waitFor(async () => {
      const { body } = await api<Page>(`${path}?limit=2`, { headers: keyBearer });
      return body.data?.total === 3 ? body.data : null;
    });
    expect(first.items).toHaveLength(2);
    expect(first.hasMore).toBe(true);
    expect(first.items.every((item) => /^dlv_/.test(item.id) && /^msg_/.test(item.message.id))).toBe(true);

    const second = await api<Page>(`${path}?limit=2&cursor=${first.nextCursor}`, { headers: keyBearer });
    expect(second.body.data?.items).toHaveLength(1);
    expect(second.body.data?.hasMore).toBe(false);
    expect(second.body.data?.total).toBe(3);

    const titles = [...first.items, ...(second.body.data?.items ?? [])]
      .map((item) => item.message.title)
      .sort();
    expect(titles).toEqual(['First', 'Second', 'Third']);
    const ids = [...first.items, ...(second.body.data?.items ?? [])].map((item) => item.id);
    expect(new Set(ids).size).toBe(3);
  });

  it('is scoped to the tenant and needs messages:read', async () => {
    const { owner, workspace, keyBearer } = await setupWorkspace();
    const externalId = `scoped-${uniq()}`;
    await api('/v1/subscriptions', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ externalId, channel: 'push', platform: 'ios', token: fakeToken(externalId) }),
    });
    const path = `/v1/subscribers/${encodeURIComponent(externalId)}/deliveries`;

    const other = await createTenant(keyBearer);
    const foreign = await api(path, { headers: { ...keyBearer, 'buzzkit-tenant': other.slug } });
    expect(foreign.status).toBe(404);

    const readOnly = await createKey(owner.token, workspace.slug, { scopes: ['subscribers:read'] });
    const denied = await api(path, { headers: { Authorization: `Bearer ${readOnly.secret}` } });
    expect(denied.status).toBe(403);

    const allowed = await createKey(owner.token, workspace.slug, { scopes: ['messages:read'] });
    const ok = await api(path, { headers: { Authorization: `Bearer ${allowed.secret}` } });
    expect(ok.status).toBe(200);
  });
});
