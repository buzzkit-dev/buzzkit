import { describe, expect, it } from 'vitest';
import { api } from '../../../utils/api';
import { setupWorkspace, uniq } from '../../../utils/setup';

type TenantBody = { id: string; slug: string; name: string; metadata: Record<string, unknown> };

describe('/v1/tenants/:tenantSlug', () => {
  it('reads, patches and soft-deletes a tenant', async () => {
    const { keyBearer } = await setupWorkspace();
    const slug = `cust-${uniq()}`;
    await api('/v1/tenants', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ name: 'Customer', slug }),
    });

    const fetched = await api<TenantBody>(`/v1/tenants/${slug}`, { headers: keyBearer });
    expect(fetched.status).toBe(200);
    expect(fetched.body.data?.id).toMatch(/^tnt_/);

    const patched = await api<TenantBody>(`/v1/tenants/${slug}`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ metadata: { externalId: 'cus_9' } }),
    });
    expect(patched.status).toBe(200);
    expect(patched.body.data?.metadata).toEqual({ externalId: 'cus_9' });

    const unchanged = await api<TenantBody>(`/v1/tenants/${slug}`, {
      method: 'PATCH',
      headers: keyBearer,
      body: '{}',
    });
    expect(unchanged.status).toBe(200);
    expect(unchanged.body.data?.metadata).toEqual({ externalId: 'cus_9' });

    const deleted = await api(`/v1/tenants/${slug}`, { method: 'DELETE', headers: keyBearer });
    expect(deleted.status).toBe(200);

    const gone = await api(`/v1/tenants/${slug}`, { headers: keyBearer });
    expect(gone.status).toBe(404);
  });

  it('requires auth, refuses deleting the default tenant, and hides foreign tenants', async () => {
    const { keyBearer } = await setupWorkspace();
    const foreign = await setupWorkspace();
    const slug = `cust-${uniq()}`;
    await api('/v1/tenants', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ name: 'Customer', slug }),
    });

    const unauthenticated = await api(`/v1/tenants/${slug}`);
    expect(unauthenticated.status).toBe(401);

    const defaultDelete = await api('/v1/tenants/default', { method: 'DELETE', headers: keyBearer });
    expect(defaultDelete.status).toBe(409);

    const crossWorkspace = await api(`/v1/tenants/${slug}`, { headers: foreign.keyBearer });
    expect(crossWorkspace.status).toBe(404);
  });
});
