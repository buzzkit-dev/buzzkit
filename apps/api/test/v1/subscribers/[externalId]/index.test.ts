import { describe, expect, it } from 'vitest';
import { api } from '../../../utils/api';
import { setupWorkspace, uniq } from '../../../utils/setup';

type SubscriberBody = { id: string; externalId: string; attributes: Record<string, unknown> };

describe('/v1/subscribers/:externalId', () => {
  it('upserts, reads, replaces attributes on PUT and soft-deletes', async () => {
    const { keyBearer } = await setupWorkspace();
    const externalId = `user_${uniq()}`;

    const created = await api<SubscriberBody>(`/v1/subscribers/${externalId}`, {
      method: 'PUT',
      headers: keyBearer,
      body: JSON.stringify({ attributes: { plan: 'starter' } }),
    });
    expect([200, 201]).toContain(created.status);
    expect(created.body.data?.externalId).toBe(externalId);
    expect(created.body.data?.attributes.plan).toBe('starter');

    const replaced = await api<SubscriberBody>(`/v1/subscribers/${externalId}`, {
      method: 'PUT',
      headers: keyBearer,
      body: JSON.stringify({ attributes: { seats: 3 } }),
    });
    expect(replaced.body.data?.attributes.seats).toBe(3);
    expect(replaced.body.data?.attributes.plan).toBeUndefined();

    const fetched = await api<SubscriberBody>(`/v1/subscribers/${externalId}`, { headers: keyBearer });
    expect(fetched.status).toBe(200);
    expect(fetched.body.data?.id).toMatch(/^sub_/);

    const deleted = await api<{ deleted: boolean }>(`/v1/subscribers/${externalId}`, {
      method: 'DELETE',
      headers: keyBearer,
    });
    expect(deleted.status).toBe(200);

    const gone = await api(`/v1/subscribers/${externalId}`, { headers: keyBearer });
    expect(gone.status).toBe(404);
  });

  it('requires auth, isolates tenants and answers 404 for unknown subscribers', async () => {
    const { keyBearer } = await setupWorkspace();
    const foreign = await setupWorkspace();
    const externalId = `user_${uniq()}`;
    await api(`/v1/subscribers/${externalId}`, { method: 'PUT', headers: keyBearer, body: '{}' });

    const unauthenticated = await api(`/v1/subscribers/${externalId}`);
    expect(unauthenticated.status).toBe(401);

    const crossTenant = await api(`/v1/subscribers/${externalId}`, { headers: foreign.keyBearer });
    expect(crossTenant.status).toBe(404);

    const unknown = await api(`/v1/subscribers/ghost_${uniq()}`, { headers: keyBearer });
    expect(unknown.status).toBe(404);
  });
});
