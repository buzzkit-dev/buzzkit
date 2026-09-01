import { describe, expect, it } from 'vitest';
import { api, type PageData } from '../../../../utils/api';
import { fakeToken } from '../../../../utils/fixtures';
import { setupWorkspace, uniq } from '../../../../utils/setup';

type SubscriptionRow = { id: string; channel: string; platform: string | null };

describe('GET /v1/subscribers/:externalId/subscriptions', () => {
  it('lists the subscriptions of one subscriber', async () => {
    const { keyBearer } = await setupWorkspace();
    const externalId = `user_${uniq()}`;
    await api('/v1/subscriptions', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ externalId, channel: 'push', platform: 'ios', token: fakeToken(externalId) }),
    });

    const listed = await api<PageData<SubscriptionRow>>(`/v1/subscribers/${externalId}/subscriptions`, {
      headers: keyBearer,
    });
    expect(listed.status).toBe(200);
    expect(listed.body.data?.items).toHaveLength(1);
    expect(listed.body.data?.items[0]).toMatchObject({ channel: 'push', platform: 'ios' });
    expect(listed.body.data?.items[0]?.id).toMatch(/^sbn_/);
  });

  it('requires auth and answers 404 for an unknown subscriber', async () => {
    const { keyBearer } = await setupWorkspace();

    const unauthenticated = await api('/v1/subscribers/user_x/subscriptions');
    expect(unauthenticated.status).toBe(401);

    const unknown = await api(`/v1/subscribers/ghost_${uniq()}/subscriptions`, { headers: keyBearer });
    expect(unknown.status).toBe(404);
  });
});
