import { describe, expect, it } from 'vitest';
import { api } from '../../../../../utils/api';
import { setupWorkspace, uniq } from '../../../../../utils/setup';

type IdentitySecret = { id: string; identitySecret: string; updatedAt: string };

describe('POST /v1/tenants/:tenantSlug/identity-secret/rotate', () => {
  it('rotates the secret, keeps the tenant, and records an audit entry', async () => {
    const { workspace, ownerBearer } = await setupWorkspace();
    const headers = { ...ownerBearer, 'buzzkit-workspace': workspace.slug };

    const before = await api<IdentitySecret>('/v1/tenants/default/identity-secret', { headers });
    const rotated = await api<IdentitySecret>('/v1/tenants/default/identity-secret/rotate', {
      method: 'POST',
      headers,
    });

    expect(rotated.status).toBe(200);
    expect(rotated.body.data?.id).toBe(before.body.data?.id);
    expect(rotated.body.data?.identitySecret).toMatch(/\w{16,}/);
    expect(rotated.body.data?.identitySecret).not.toBe(before.body.data?.identitySecret);

    const after = await api<IdentitySecret>('/v1/tenants/default/identity-secret', { headers });
    expect(after.body.data?.identitySecret).toBe(rotated.body.data?.identitySecret);

    const audit = await api<{ items: Array<{ event: string }> }>(
      `/v1/workspaces/${workspace.slug}/audit?event=tenant.identity_secret_rotated`,
      { headers: ownerBearer }
    );
    expect(audit.body.data?.items.some((row) => row.event === 'tenant.identity_secret_rotated')).toBe(true);
  });

  it('refuses API keys because the scope is session-only', async () => {
    const { keyBearer } = await setupWorkspace();

    const { status, body } = await api('/v1/tenants/default/identity-secret/rotate', {
      method: 'POST',
      headers: keyBearer,
    });

    expect(status).toBe(403);
    expect(body.error?.code).toBe('missing_permission');
  });

  it('answers 404 for an unknown tenant slug', async () => {
    const { workspace, ownerBearer } = await setupWorkspace();
    const headers = { ...ownerBearer, 'buzzkit-workspace': workspace.slug };

    const { status } = await api(`/v1/tenants/ghost-${uniq()}/identity-secret/rotate`, {
      method: 'POST',
      headers,
    });

    expect(status).toBe(404);
  });
});
