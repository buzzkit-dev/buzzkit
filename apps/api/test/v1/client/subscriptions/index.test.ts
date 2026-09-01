import { describe, expect, it } from 'vitest';
import { api } from '../../../utils/api';
import { fakeToken } from '../../../utils/fixtures';
import { createClientKey, setupWorkspace, uniq } from '../../../utils/setup';

type SubscriptionBody = { id: string; channel: string; enabled: boolean };

async function setupClient() {
  const base = await setupWorkspace();
  const clientKey = await createClientKey(base.owner.token, base.workspace.slug, 'default');
  return { ...base, clientBearer: { Authorization: `Bearer ${clientKey.secret}` } };
}

describe('/v1/client/subscriptions', () => {
  it('registers a device, toggles it and unregisters it from the app', async () => {
    const { clientBearer } = await setupClient();
    const externalId = `user_${uniq()}`;

    const registered = await api<SubscriptionBody>('/v1/client/subscriptions', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({
        externalId,
        channel: 'push',
        platform: 'ios',
        environment: 'sandbox',
        token: fakeToken(externalId),
      }),
    });
    expect(registered.status).toBe(201);
    const id = registered.body.data?.id ?? '';
    expect(id).toMatch(/^sbn_/);

    const subscriberHeaders = { ...clientBearer, 'buzzkit-subscriber': externalId };
    const disabled = await api<SubscriptionBody>(`/v1/client/subscriptions/${id}`, {
      method: 'PATCH',
      headers: subscriberHeaders,
      body: JSON.stringify({ enabled: false }),
    });
    expect(disabled.status).toBe(200);
    expect(disabled.body.data?.enabled).toBe(false);

    const removed = await api<{ deleted: boolean }>(`/v1/client/subscriptions/${id}`, {
      method: 'DELETE',
      headers: subscriberHeaders,
    });
    expect(removed.status).toBe(200);

    const again = await api(`/v1/client/subscriptions/${id}`, {
      method: 'PATCH',
      headers: subscriberHeaders,
      body: JSON.stringify({ enabled: true }),
    });
    expect(again.status).toBe(404);
  });

  it('requires a client key and never touches another subscriber device', async () => {
    const { clientBearer } = await setupClient();
    const owner = `user_${uniq()}`;
    const intruder = `user_${uniq()}`;
    const registered = await api<SubscriptionBody>('/v1/client/subscriptions', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({
        externalId: owner,
        channel: 'push',
        platform: 'ios',
        environment: 'sandbox',
        token: fakeToken(owner),
      }),
    });
    const id = registered.body.data?.id ?? '';

    const unauthenticated = await api('/v1/client/subscriptions', {
      method: 'POST',
      body: JSON.stringify({
        externalId: owner,
        channel: 'push',
        platform: 'ios',
        environment: 'sandbox',
        token: fakeToken(owner),
      }),
    });
    expect(unauthenticated.status).toBe(401);

    const foreign = await api(`/v1/client/subscriptions/${id}`, {
      method: 'PATCH',
      headers: { ...clientBearer, 'buzzkit-subscriber': intruder },
      body: JSON.stringify({ enabled: false }),
    });
    expect(foreign.status).toBe(404);
  });
});
