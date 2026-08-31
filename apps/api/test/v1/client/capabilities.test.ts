import { describe, expect, it } from 'vitest';
import { api } from '../../utils/api';
import { createClientKey, setupWorkspace, uniq } from '../../utils/setup';

async function setupClient() {
  const base = await setupWorkspace();
  const clientKey = await createClientKey(base.owner.token, base.workspace.slug, 'default');
  return {
    ...base,
    clientBearer: { Authorization: `Bearer ${clientKey.secret}` },
    tenantBearer: { ...base.keyBearer, 'buzzkit-tenant': 'default' },
  };
}

describe('push permission attribute', () => {
  it('stamps $pushPermission from identify and registration, readable for segments', async () => {
    const { clientBearer } = await setupClient();
    const externalId = `user_${uniq()}`;

    const identified = await api<{ attributes: Record<string, unknown> }>('/v1/client/identify', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({ externalId, pushPermission: 'denied' }),
    });
    expect(identified.status).toBe(201);
    expect(identified.body.data?.attributes.$pushPermission).toBe('denied');

    const updated = await api<{ attributes: Record<string, unknown> }>('/v1/client/identify', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({ externalId, pushPermission: 'authorized' }),
    });
    expect(updated.status).toBe(200);
    expect(updated.body.data?.attributes.$pushPermission).toBe('authorized');

    const invalid = await api('/v1/client/identify', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({ externalId, pushPermission: 'maybe' }),
    });
    expect(invalid.status).toBe(400);
  });
});

describe('topic categories', () => {
  it('flows from topic creation through the resolved preferences', async () => {
    const { clientBearer, tenantBearer } = await setupClient();
    const externalId = `user_${uniq()}`;

    const created = await api<{ category: string | null }>('/v1/topics', {
      method: 'POST',
      headers: tenantBearer,
      body: JSON.stringify({
        slug: `invites-${uniq()}`,
        name: 'Event invites',
        category: 'Events you attend',
        channels: ['push'],
      }),
    });
    expect(created.status).toBe(201);
    expect(created.body.data?.category).toBe('Events you attend');

    await api('/v1/client/identify', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({ externalId }),
    });

    const preferences = await api<{ items: Array<{ slug: string; category: string | null }> }>(
      '/v1/client/preferences',
      { headers: { ...clientBearer, 'BuzzKit-Subscriber': externalId } }
    );
    expect(preferences.status).toBe(200);
    const row = preferences.body.data?.items.find((item) => item.slug.startsWith('invites-'));
    expect(row?.category).toBe('Events you attend');
  });
});

describe('topic category management', () => {
  it('lists, renames across topics, and deletes leaving topics uncategorized', async () => {
    const { clientBearer, tenantBearer } = await setupClient();
    const externalId = `user_${uniq()}`;
    const slug = `alerts-${uniq()}`;

    await api('/v1/topics', {
      method: 'POST',
      headers: tenantBearer,
      body: JSON.stringify({ slug, name: 'Alerts', category: 'Signals', channels: ['push'] }),
    });

    const listed = await api<{ items: Array<{ id: string; name: string }> }>('/v1/topic-categories', {
      headers: tenantBearer,
    });
    expect(listed.status).toBe(200);
    const category = listed.body.data?.items.find((item) => item.name === 'Signals');
    expect(category?.id).toMatch(/^tcg_/);

    const renamed = await api<{ name: string }>(`/v1/topic-categories/${category?.id}`, {
      method: 'PATCH',
      headers: tenantBearer,
      body: JSON.stringify({ name: 'Market signals' }),
    });
    expect(renamed.status).toBe(200);
    expect(renamed.body.data?.name).toBe('Market signals');

    await api('/v1/client/identify', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({ externalId }),
    });
    const preferences = await api<{ items: Array<{ slug: string; category: string | null }> }>(
      '/v1/client/preferences',
      { headers: { ...clientBearer, 'BuzzKit-Subscriber': externalId } }
    );
    expect(preferences.body.data?.items.find((item) => item.slug === slug)?.category).toBe('Market signals');

    const deleted = await api<{ deleted: boolean }>(`/v1/topic-categories/${category?.id}`, {
      method: 'DELETE',
      headers: tenantBearer,
    });
    expect(deleted.status).toBe(200);

    const after = await api<{ items: Array<{ slug: string; category: string | null }> }>(
      '/v1/client/preferences',
      { headers: { ...clientBearer, 'BuzzKit-Subscriber': externalId } }
    );
    expect(after.body.data?.items.find((item) => item.slug === slug)?.category).toBeNull();
  });

  it('reuses a category case-insensitively instead of duplicating it', async () => {
    const { tenantBearer } = await setupClient();

    await api('/v1/topics', {
      method: 'POST',
      headers: tenantBearer,
      body: JSON.stringify({ slug: `a-${uniq()}`, name: 'A', category: 'Training', channels: ['push'] }),
    });
    await api('/v1/topics', {
      method: 'POST',
      headers: tenantBearer,
      body: JSON.stringify({ slug: `b-${uniq()}`, name: 'B', category: 'training', channels: ['push'] }),
    });

    const listed = await api<{ items: Array<{ name: string }> }>('/v1/topic-categories', {
      headers: tenantBearer,
    });
    const matches = listed.body.data?.items.filter((item) => item.name.toLowerCase() === 'training');
    expect(matches?.length).toBe(1);
  });
});

describe('device attributes', () => {
  it('stamps app, SDK, OS, and model attributes from the device payload', async () => {
    const { clientBearer } = await setupClient();
    const externalId = `user_${uniq()}`;

    const identified = await api<{ attributes: Record<string, unknown> }>('/v1/client/identify', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({
        externalId,
        device: {
          appVersion: '2.4.0',
          appBuild: '512',
          sdkVersion: '0.1.0',
          osVersion: '27.0',
          model: 'iPhone18,2',
          locale: 'en_US',
          installedAt: '2026-08-30T12:00:00.000Z',
        },
      }),
    });
    expect(identified.status).toBe(201);
    const attributes = identified.body.data?.attributes ?? {};
    expect(attributes.$appVersion).toBe('2.4.0');
    expect(attributes.$appBuild).toBe('512');
    expect(attributes.$sdkVersion).toBe('0.1.0');
    expect(attributes.$osVersion).toBe('27.0');
    expect(attributes.$deviceModel).toBe('iPhone18,2');
    expect(attributes.$locale).toBe('en_US');
    expect(attributes.$appInstalledAt).toBe('2026-08-30T12:00:00.000Z');
  });
});
