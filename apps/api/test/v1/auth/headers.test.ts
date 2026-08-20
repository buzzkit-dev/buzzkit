import { describe, expect, it } from 'vitest';
import { api } from '../../utils/api';
import { createKey, createTenant, setupWorkspace, uniq } from '../../utils/setup';

describe('header case-insensitivity', () => {
  it('accepts BuzzKit-Tenant, buzzkit-tenant, and BUZZKIT-TENANT identically', async () => {
    const { keyBearer } = await setupWorkspace();
    const tenant = await createTenant(keyBearer);

    for (const headerName of ['buzzkit-tenant', 'BuzzKit-Tenant', 'BUZZKIT-TENANT', 'Buzzkit-tenant']) {
      const { status } = await api('/v1/credentials', {
        headers: { ...keyBearer, [headerName]: tenant.slug },
      });
      expect(status, `header spelled '${headerName}'`).toBe(200);
    }
  });

  it('accepts BuzzKit-Workspace in any casing for sessions', async () => {
    const { owner, workspace } = await setupWorkspace();

    for (const headerName of ['buzzkit-workspace', 'BuzzKit-Workspace', 'BUZZKIT-WORKSPACE']) {
      const { status } = await api('/v1/tenants', {
        headers: { Authorization: `Bearer ${owner.token}`, [headerName]: workspace.slug },
      });
      expect(status, `header spelled '${headerName}'`).toBe(200);
    }
  });

  it('accepts Authorization in any casing', async () => {
    const { key } = await setupWorkspace();

    for (const headerName of ['authorization', 'Authorization', 'AUTHORIZATION']) {
      const { status } = await api('/v1/tenants', {
        headers: { [headerName]: `Bearer ${key.secret}` },
      });
      expect(status, `header spelled '${headerName}'`).toBe(200);
    }
  });
});

describe('header addressing matrix', () => {
  it('a workspace key may name its own workspace explicitly', async () => {
    const { workspace, keyBearer } = await setupWorkspace();

    const { status } = await api('/v1/tenants', {
      headers: { ...keyBearer, 'buzzkit-workspace': workspace.slug },
    });

    expect(status).toBe(200);
  });

  it('a tenant key may name its own tenant explicitly, and only its own', async () => {
    const { owner, workspace, keyBearer } = await setupWorkspace();
    const tenant = await createTenant(keyBearer);
    const other = await createTenant(keyBearer);

    const tenantKey = await createKey(owner.token, workspace.slug, {
      kind: 'tenant',
      tenant: tenant.slug,
      scopes: ['credentials:read'],
    });
    const bearer = { Authorization: `Bearer ${tenantKey.secret}` };

    const own = await api('/v1/credentials', { headers: { ...bearer, 'buzzkit-tenant': tenant.slug } });
    expect(own.status).toBe(200);

    const foreign = await api('/v1/credentials', { headers: { ...bearer, 'buzzkit-tenant': other.slug } });
    expect(foreign.status).toBe(403);
    expect(foreign.body.error?.message).toContain('different tenant');
  });

  it('a session on the data plane needs the workspace header — the tenant header alone is a 400', async () => {
    const { owner, workspace, keyBearer } = await setupWorkspace();
    const tenant = await createTenant(keyBearer);

    const missingWorkspace = await api('/v1/credentials', {
      headers: { Authorization: `Bearer ${owner.token}`, 'buzzkit-tenant': tenant.slug },
    });
    expect(missingWorkspace.status).toBe(400);

    const both = await api('/v1/credentials', {
      headers: {
        Authorization: `Bearer ${owner.token}`,
        'buzzkit-workspace': workspace.slug,
        'buzzkit-tenant': tenant.slug,
      },
    });
    expect(both.status).toBe(200);
  });

  it('a tenant slug from another workspace never resolves — even if it exists there', async () => {
    const a = await setupWorkspace();
    const b = await setupWorkspace();
    const foreignTenant = await createTenant(b.keyBearer);

    const { status } = await api('/v1/credentials', {
      headers: { ...a.keyBearer, 'buzzkit-tenant': foreignTenant.slug },
    });

    expect(status).toBe(404);
  });

  it('a deleted tenant stops resolving on the data plane', async () => {
    const { keyBearer } = await setupWorkspace();
    const tenant = await createTenant(keyBearer);

    const before = await api('/v1/credentials', {
      headers: { ...keyBearer, 'buzzkit-tenant': tenant.slug },
    });
    expect(before.status).toBe(200);

    await api(`/v1/tenants/${tenant.slug}`, { method: 'DELETE', headers: keyBearer });

    const after = await api('/v1/credentials', {
      headers: { ...keyBearer, 'buzzkit-tenant': tenant.slug },
    });
    expect(after.status).toBe(404);
  });

  it('an empty or garbage tenant header fails closed', async () => {
    const { keyBearer } = await setupWorkspace();

    const garbage = await api('/v1/credentials', {
      headers: { ...keyBearer, 'buzzkit-tenant': `ghost-${uniq()}` },
    });
    expect(garbage.status).toBe(404);

    const weird = await api('/v1/credentials', {
      headers: { ...keyBearer, 'buzzkit-tenant': '../default' },
    });
    expect(weird.status).toBe(404);
  });
});
