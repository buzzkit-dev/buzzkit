import { describe, expect, it } from 'vitest';
import { api } from '../../../utils/api';
import { createClientKey, setupWorkspace, uniq } from '../../../utils/setup';

type SubscriberBody = { id: string; externalId: string; attributes: Record<string, unknown> };

async function setupClient() {
  const base = await setupWorkspace();
  const clientKey = await createClientKey(base.owner.token, base.workspace.slug, 'default');
  return { ...base, clientBearer: { Authorization: `Bearer ${clientKey.secret}` } };
}

describe('POST /v1/client/identify', () => {
  it('upserts the subscriber with custom attributes from the app', async () => {
    const { clientBearer } = await setupClient();
    const externalId = `user_${uniq()}`;

    const created = await api<SubscriberBody>('/v1/client/identify', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({ externalId, attributes: { plan: 'starter' } }),
    });
    expect(created.status).toBe(201);
    expect(created.body.data?.externalId).toBe(externalId);
    expect(created.body.data?.attributes.plan).toBe('starter');

    const again = await api<SubscriberBody>('/v1/client/identify', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({ externalId, attributes: { plan: 'pro' } }),
    });
    expect(again.status).toBe(200);
    expect(again.body.data?.attributes.plan).toBe('pro');
  });

  it('rejects $-prefixed attributes and requires a client key', async () => {
    const { clientBearer, keyBearer } = await setupClient();
    const externalId = `user_${uniq()}`;

    const reserved = await api('/v1/client/identify', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({ externalId, attributes: { $timezone: 'UTC' } }),
    });
    expect(reserved.status).toBe(400);

    const unauthenticated = await api('/v1/client/identify', {
      method: 'POST',
      body: JSON.stringify({ externalId }),
    });
    expect(unauthenticated.status).toBe(401);

    const serverKey = await api('/v1/client/identify', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ externalId }),
    });
    expect([401, 403]).toContain(serverKey.status);
  });

  it('subscribes an email from the app by default, and keeps it as profile data with subscribe.email false', async () => {
    const { clientBearer, keyBearer } = await setupClient();
    type Detail = {
      attributes: Record<string, unknown>;
      subscriptions: Array<{ channel: string; endpoint: string }>;
    };
    const detailOf = async (externalId: string) => {
      const { body } = await api<Detail>(`/v1/subscribers/${externalId}`, { headers: keyBearer });
      return body.data!;
    };

    const subscribed = `user_${uniq()}`;
    const identified = await api<SubscriberBody>('/v1/client/identify', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({ externalId: subscribed, email: `${subscribed}@acme.com` }),
    });
    expect(identified.status).toBe(201);
    expect(identified.body.data?.attributes.email).toBe(`${subscribed}@acme.com`);
    expect((await detailOf(subscribed)).subscriptions).toEqual([
      expect.objectContaining({ channel: 'email', endpoint: `${subscribed}@acme.com` }),
    ]);

    const dataOnly = `user_${uniq()}`;
    const kept = await api<SubscriberBody>('/v1/client/identify', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({
        externalId: dataOnly,
        attributes: { email: `${dataOnly}@acme.com` },
        subscribe: { email: false },
      }),
    });
    expect(kept.status).toBe(201);
    const detail = await detailOf(dataOnly);
    expect(detail.attributes.email).toBe(`${dataOnly}@acme.com`);
    expect(detail.subscriptions).toEqual([]);
  });
});
