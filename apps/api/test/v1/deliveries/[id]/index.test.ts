import { describe, expect, it } from 'vitest';
import { api } from '../../../utils/api';
import { eventually } from '../../../utils/eventually';
import { fakeToken } from '../../../utils/fixtures';
import { setupWorkspace, uniq } from '../../../utils/setup';

type DeliveryBody = { id: string; status: string; messageId: string };

async function seedDelivery(keyBearer: Record<string, string>) {
  const externalId = `user_${uniq()}`;
  await api('/v1/subscriptions', {
    method: 'POST',
    headers: keyBearer,
    body: JSON.stringify({ externalId, channel: 'push', platform: 'ios', token: fakeToken(externalId) }),
  });
  const sent = await api<{ id: string }>('/v1/messages', {
    method: 'POST',
    headers: keyBearer,
    body: JSON.stringify({ to: externalId, title: 'Hello', body: 'World' }),
  });
  const messageId = sent.body.data?.id ?? '';
  return eventually(
    async () => {
      const { body } = await api<{ items: DeliveryBody[] }>(`/v1/messages/${messageId}/deliveries`, {
        headers: keyBearer,
      });
      return body.data?.items[0];
    },
    { label: 'delivery seeded' }
  );
}

describe('GET /v1/deliveries/:id', () => {
  it('reads one delivery with its status and message', async () => {
    const { keyBearer } = await setupWorkspace({ push: 'unusable' });
    const delivery = await seedDelivery(keyBearer);

    const fetched = await api<DeliveryBody>(`/v1/deliveries/${delivery.id}`, { headers: keyBearer });
    expect(fetched.status).toBe(200);
    expect(fetched.body.data?.id).toBe(delivery.id);
    expect(fetched.body.data?.messageId).toMatch(/^msg_/);
  });

  it('requires auth, hides foreign deliveries and answers 404 for malformed ids', async () => {
    const { keyBearer } = await setupWorkspace({ push: 'unusable' });
    const foreign = await setupWorkspace({ push: 'unusable' });
    const delivery = await seedDelivery(keyBearer);

    const unauthenticated = await api(`/v1/deliveries/${delivery.id}`);
    expect(unauthenticated.status).toBe(401);

    const malformed = await api('/v1/deliveries/not-a-sqid', { headers: keyBearer });
    expect(malformed.status).toBe(404);

    const crossTenant = await api(`/v1/deliveries/${delivery.id}`, { headers: foreign.keyBearer });
    expect(crossTenant.status).toBe(404);
  });
});
