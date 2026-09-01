import { describe, expect, it } from 'vitest';
import { api } from '../../../../utils/api';
import { eventually } from '../../../../utils/eventually';
import { fakeToken } from '../../../../utils/fixtures';
import { setupWorkspace, uniq } from '../../../../utils/setup';

type DeliveryBody = { id: string; status: string; subscriberId: string };

describe('GET /v1/messages/:id/deliveries', () => {
  it('lists the fan-out of one message as a page', async () => {
    const { keyBearer } = await setupWorkspace({ push: 'unusable' });
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
    const id = sent.body.data?.id ?? '';

    const listed = await eventually(
      async () => {
        const { body } = await api<{ items: DeliveryBody[]; hasMore: boolean }>(
          `/v1/messages/${id}/deliveries`,
          { headers: keyBearer }
        );
        return (body.data?.items.length ?? 0) > 0 ? body.data : undefined;
      },
      { label: 'delivery listed' }
    );

    expect(listed.items[0]?.id).toMatch(/^dlv_/);
    expect(listed.hasMore).toBe(false);
  });

  it('requires auth and answers 404 for unknown message ids', async () => {
    const { keyBearer } = await setupWorkspace({ push: 'unusable' });

    const unauthenticated = await api('/v1/messages/msg_x/deliveries');
    expect(unauthenticated.status).toBe(401);

    const unknown = await api('/v1/messages/not-a-sqid/deliveries', { headers: keyBearer });
    expect(unknown.status).toBe(404);
  });
});
