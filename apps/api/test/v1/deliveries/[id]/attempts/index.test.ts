import { describe, expect, it } from 'vitest';
import { api } from '../../../../utils/api';
import { eventually } from '../../../../utils/eventually';
import { fakeToken } from '../../../../utils/fixtures';
import { setupWorkspace, uniq } from '../../../../utils/setup';

type AttemptBody = { attempt: number; outcome: string };

describe('GET /v1/deliveries/:id/attempts', () => {
  it('serves the ledger, empty for a delivery settled without a provider attempt', async () => {
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
    const messageId = sent.body.data?.id ?? '';

    const delivery = await eventually(
      async () => {
        const { body } = await api<{ items: Array<{ id: string; status: string }> }>(
          `/v1/messages/${messageId}/deliveries`,
          { headers: keyBearer }
        );
        const row = body.data?.items[0];
        return row && row.status !== 'pending' ? row : undefined;
      },
      { label: 'delivery settled' }
    );

    const attempts = await api<{ items: AttemptBody[] }>(`/v1/deliveries/${delivery.id}/attempts`, {
      headers: keyBearer,
    });
    expect(attempts.status).toBe(200);
    expect(attempts.body.data?.items).toEqual([]);
  });

  it('requires auth and answers 404 for unknown delivery ids', async () => {
    const { keyBearer } = await setupWorkspace({ push: 'unusable' });

    const unauthenticated = await api('/v1/deliveries/dlv_x/attempts');
    expect(unauthenticated.status).toBe(401);

    const unknown = await api('/v1/deliveries/not-a-sqid/attempts', { headers: keyBearer });
    expect(unknown.status).toBe(404);
  });
});
