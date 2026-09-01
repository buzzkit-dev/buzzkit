import { describe, expect, it } from 'vitest';
import { api, type PageData } from '../../../../utils/api';
import { setupWorkspace, uniq } from '../../../../utils/setup';

type PreferenceRow = {
  slug: string;
  channels: Record<string, { optedIn: boolean; isDefault: boolean } | undefined>;
};

describe('/v1/subscribers/:externalId/preferences', () => {
  it('lists topic preferences and persists an explicit choice', async () => {
    const { keyBearer } = await setupWorkspace();
    const topic = `deals-${uniq()}`;
    await api('/v1/topics', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ slug: topic, name: 'Deals' }),
    });
    const externalId = `user_${uniq()}`;
    await api(`/v1/subscribers/${externalId}`, { method: 'PUT', headers: keyBearer, body: '{}' });

    const listed = await api<PageData<PreferenceRow>>(`/v1/subscribers/${externalId}/preferences`, {
      headers: keyBearer,
    });
    expect(listed.status).toBe(200);
    const row = listed.body.data?.items.find((item) => item.slug === topic);
    expect(row?.channels.push).toMatchObject({ optedIn: true, isDefault: true });

    const patched = await api<PageData<PreferenceRow>>(`/v1/subscribers/${externalId}/preferences`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ preferences: { [topic]: false } }),
    });
    expect(patched.status).toBe(200);
    const updated = patched.body.data?.items.find((item) => item.slug === topic);
    expect(updated?.channels.push).toMatchObject({ optedIn: false, isDefault: false });
  });

  it('requires auth and answers 404 for an unknown subscriber', async () => {
    const { keyBearer } = await setupWorkspace();

    const unauthenticated = await api(`/v1/subscribers/user_x/preferences`);
    expect(unauthenticated.status).toBe(401);

    const unknown = await api(`/v1/subscribers/ghost_${uniq()}/preferences`, { headers: keyBearer });
    expect(unknown.status).toBe(404);
  });
});
