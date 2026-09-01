import { describe, expect, it } from 'vitest';
import { api, type PageData } from '../../../utils/api';
import { createClientKey, setupWorkspace, uniq } from '../../../utils/setup';

type PreferenceRow = {
  slug: string;
  channels: Record<string, { optedIn: boolean; isDefault: boolean } | undefined>;
};

async function setupClient() {
  const base = await setupWorkspace();
  const clientKey = await createClientKey(base.owner.token, base.workspace.slug, 'default');
  return { ...base, clientBearer: { Authorization: `Bearer ${clientKey.secret}` } };
}

describe('/v1/client/preferences', () => {
  it('lists and updates the calling subscriber preferences', async () => {
    const { clientBearer, keyBearer } = await setupClient();
    const topic = `deals-${uniq()}`;
    await api('/v1/topics', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ slug: topic, name: 'Deals' }),
    });
    const externalId = `user_${uniq()}`;
    await api('/v1/client/identify', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({ externalId }),
    });
    const subscriberHeaders = { ...clientBearer, 'buzzkit-subscriber': externalId };

    const listed = await api<PageData<PreferenceRow>>('/v1/client/preferences', {
      headers: subscriberHeaders,
    });
    expect(listed.status).toBe(200);
    const row = listed.body.data?.items.find((item) => item.slug === topic);
    expect(row?.channels.push).toMatchObject({ optedIn: true, isDefault: true });

    const patched = await api<PageData<PreferenceRow>>('/v1/client/preferences', {
      method: 'PATCH',
      headers: subscriberHeaders,
      body: JSON.stringify({ preferences: { [topic]: false } }),
    });
    expect(patched.status).toBe(200);
    const updated = patched.body.data?.items.find((item) => item.slug === topic);
    expect(updated?.channels.push).toMatchObject({ optedIn: false });
  });

  it('requires a client key and the subscriber header', async () => {
    const { clientBearer } = await setupClient();

    const unauthenticated = await api('/v1/client/preferences');
    expect(unauthenticated.status).toBe(401);

    const missingHeader = await api('/v1/client/preferences', { headers: clientBearer });
    expect(missingHeader.status).toBe(400);
  });
});
