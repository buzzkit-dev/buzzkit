import { describe, expect, it } from 'vitest';
import { api } from '../../../utils/api';
import { fakeToken } from '../../../utils/fixtures';
import { setupWorkspace, uniq } from '../../../utils/setup';

type SubscriptionBody = { id: string; channel: string; enabled: boolean };

async function register(keyBearer: Record<string, string>) {
  const externalId = `user_${uniq()}`;
  const { body } = await api<SubscriptionBody>('/v1/subscriptions', {
    method: 'POST',
    headers: keyBearer,
    body: JSON.stringify({ externalId, channel: 'push', platform: 'ios', token: fakeToken(externalId) }),
  });
  return body.data!;
}

describe('/v1/subscriptions/:id', () => {
  it('reads, disables, re-enables and unregisters one subscription', async () => {
    const { keyBearer } = await setupWorkspace();
    const subscription = await register(keyBearer);

    const fetched = await api<SubscriptionBody>(`/v1/subscriptions/${subscription.id}`, {
      headers: keyBearer,
    });
    expect(fetched.status).toBe(200);
    expect(fetched.body.data?.enabled).toBe(true);

    const disabled = await api<SubscriptionBody>(`/v1/subscriptions/${subscription.id}`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ enabled: false }),
    });
    expect(disabled.status).toBe(200);
    expect(disabled.body.data?.enabled).toBe(false);

    const enabled = await api<SubscriptionBody>(`/v1/subscriptions/${subscription.id}`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ enabled: true }),
    });
    expect(enabled.body.data?.enabled).toBe(true);

    const deleted = await api<{ deleted: boolean }>(`/v1/subscriptions/${subscription.id}`, {
      method: 'DELETE',
      headers: keyBearer,
    });
    expect(deleted.status).toBe(200);

    const gone = await api(`/v1/subscriptions/${subscription.id}`, { headers: keyBearer });
    expect(gone.status).toBe(404);
  });

  it('requires auth, isolates tenants and answers 404 for malformed ids', async () => {
    const { keyBearer } = await setupWorkspace();
    const foreign = await setupWorkspace();
    const subscription = await register(keyBearer);

    const unauthenticated = await api(`/v1/subscriptions/${subscription.id}`);
    expect(unauthenticated.status).toBe(401);

    const malformed = await api('/v1/subscriptions/not-a-sqid', { headers: keyBearer });
    expect(malformed.status).toBe(404);

    const crossTenant = await api(`/v1/subscriptions/${subscription.id}`, { headers: foreign.keyBearer });
    expect(crossTenant.status).toBe(404);
  });
});
