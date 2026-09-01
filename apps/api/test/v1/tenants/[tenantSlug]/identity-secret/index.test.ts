import { describe, expect, it } from 'vitest';
import { api } from '../../../../utils/api';
import { setupWorkspace, uniq } from '../../../../utils/setup';

type IdentitySecret = { id: string; identitySecret: string; updatedAt: string };

describe('GET /v1/tenants/:tenantSlug/identity-secret', () => {
  it('serves the secret to an owner session with the workspace header', async () => {
    const { workspace, ownerBearer } = await setupWorkspace();
    const headers = { ...ownerBearer, 'buzzkit-workspace': workspace.slug };

    const { status, body } = await api<IdentitySecret>('/v1/tenants/default/identity-secret', { headers });

    expect(status).toBe(200);
    expect(body.data?.id).toMatch(/^tnt_/);
    expect(body.data?.identitySecret).toMatch(/\w{16,}/);
  });

  it('refuses API keys because the scope is session-only', async () => {
    const { keyBearer } = await setupWorkspace();

    const { status, body } = await api('/v1/tenants/default/identity-secret', { headers: keyBearer });

    expect(status).toBe(403);
    expect(body.error?.code).toBe('missing_permission');
  });

  it('answers 404 for an unknown tenant slug', async () => {
    const { workspace, ownerBearer } = await setupWorkspace();
    const headers = { ...ownerBearer, 'buzzkit-workspace': workspace.slug };

    const { status } = await api(`/v1/tenants/ghost-${uniq()}/identity-secret`, { headers });

    expect(status).toBe(404);
  });

  it('never leaks another workspace tenant', async () => {
    const first = await setupWorkspace();
    const second = await setupWorkspace();
    const tenant = await api<{ slug: string }>('/v1/tenants', {
      method: 'POST',
      headers: second.keyBearer,
      body: JSON.stringify({ name: 'Foreign', slug: `foreign-${uniq()}` }),
    });

    const headers = { ...first.ownerBearer, 'buzzkit-workspace': first.workspace.slug };
    const { status } = await api(`/v1/tenants/${tenant.body.data?.slug}/identity-secret`, { headers });

    expect(status).toBe(404);
  });
});
