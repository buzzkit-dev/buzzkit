import { describe, expect, it } from 'vitest';
import { api } from '../../../../utils/api';
import { createTenant, setupWorkspace, uniq } from '../../../../utils/setup';

describe('POST /v1/workspaces/:slug/keys', () => {
  it('returns the secret exactly once, with the kind-specific prefix', async () => {
    const { workspace, ownerBearer, keyBearer } = await setupWorkspace();

    const created = await api<{ id: string; secret: string; prefix: string; last4: string }>(
      `/v1/workspaces/${workspace.slug}/keys`,
      {
        method: 'POST',
        headers: ownerBearer,
        body: JSON.stringify({ name: 'Server', scopes: ['tenants:read'] }),
      }
    );
    expect(created.status).toBe(201);
    expect(created.body.data?.id).toMatch(/^key_/);
    expect(created.body.data?.secret).toMatch(/^bk_ws_/);
    expect(created.body.data?.secret.endsWith(created.body.data.last4)).toBe(true);

    const tenant = await createTenant(keyBearer);
    const tenantKey = await api<{ secret: string; tenantId: string; kind: string }>(
      `/v1/workspaces/${workspace.slug}/keys`,
      {
        method: 'POST',
        headers: ownerBearer,
        body: JSON.stringify({
          name: 'Tenant key',
          kind: 'tenant',
          tenant: tenant.slug,
          scopes: ['credentials:read'],
        }),
      }
    );
    expect(tenantKey.status).toBe(201);
    expect(tenantKey.body.data?.secret).toMatch(/^bk_tn_/);
    expect(tenantKey.body.data?.tenantId).toMatch(/^tnt_/);
  });

  it('requires an existing tenant for tenant keys', async () => {
    const { workspace, ownerBearer } = await setupWorkspace();

    const missing = await api(`/v1/workspaces/${workspace.slug}/keys`, {
      method: 'POST',
      headers: ownerBearer,
      body: JSON.stringify({ name: 'k', kind: 'tenant', scopes: ['credentials:read'] }),
    });
    expect(missing.status).toBe(400);
    expect(missing.body.error?.code).toBe('tenant_required');

    const unknown = await api(`/v1/workspaces/${workspace.slug}/keys`, {
      method: 'POST',
      headers: ownerBearer,
      body: JSON.stringify({
        name: 'k',
        kind: 'tenant',
        tenant: `ghost-${uniq()}`,
        scopes: ['credentials:read'],
      }),
    });
    expect(unknown.status).toBe(404);
  });

  it('tenant keys can only hold tenant-context (data-plane) scopes', async () => {
    const { workspace, ownerBearer, keyBearer } = await setupWorkspace();
    const tenant = await createTenant(keyBearer);

    for (const scopes of [['tenants:read'], ['workspace:read'], ['events:read'], ['members:read']]) {
      const { status } = await api(`/v1/workspaces/${workspace.slug}/keys`, {
        method: 'POST',
        headers: ownerBearer,
        body: JSON.stringify({ name: 'bad', kind: 'tenant', tenant: tenant.slug, scopes }),
      });
      expect(status, `tenant key with ${JSON.stringify(scopes)} must be refused`).toBe(400);
    }

    const wildcard = await api(`/v1/workspaces/${workspace.slug}/keys`, {
      method: 'POST',
      headers: ownerBearer,
      body: JSON.stringify({ name: 'ok', kind: 'tenant', tenant: tenant.slug, scopes: ['credentials:*'] }),
    });
    expect(wildcard.status).toBe(201);
  });

  it('a full-wildcard tenant key works on the data plane but never on workspace routes', async () => {
    const { workspace, ownerBearer, keyBearer } = await setupWorkspace();
    const tenant = await createTenant(keyBearer);
    const tenantKey = await api<{ secret: string }>(`/v1/workspaces/${workspace.slug}/keys`, {
      method: 'POST',
      headers: ownerBearer,
      body: JSON.stringify({ name: 'root-ish', kind: 'tenant', tenant: tenant.slug, scopes: ['*'] }),
    });
    const bearer = { Authorization: `Bearer ${tenantKey.body.data?.secret}` };

    const dataPlane = await api('/v1/credentials', { headers: bearer });
    expect(dataPlane.status).toBe(200);

    for (const path of [
      '/v1/tenants',
      `/v1/workspaces/${workspace.slug}`,
      `/v1/workspaces/${workspace.slug}/events`,
    ]) {
      const { status } = await api(path, { headers: bearer });
      expect(status, `wildcard tenant key at ${path}`).toBe(403);
    }
  });

  it('accepts a future expiry and reports it in the listing', async () => {
    const { workspace, ownerBearer } = await setupWorkspace();
    const expiresAt = new Date(Date.now() + 86_400_000).toISOString();
    const name = `expiring-${uniq()}`;

    const created = await api<{ expiresAt: string }>(`/v1/workspaces/${workspace.slug}/keys`, {
      method: 'POST',
      headers: ownerBearer,
      body: JSON.stringify({ name, scopes: ['tenants:read'], expiresAt }),
    });
    expect(created.status).toBe(201);
    expect(new Date(created.body.data?.expiresAt ?? 0).toISOString()).toBe(expiresAt);

    const list = await api<{ items: Array<{ name: string; expiresAt: string | null }> }>(
      `/v1/workspaces/${workspace.slug}/keys`,
      { headers: ownerBearer }
    );
    expect(list.body.data?.items?.find((k) => k.name === name)?.expiresAt).toBeTruthy();
  });

  it('rejects malformed expiry, empty names, and too many scopes', async () => {
    const { workspace, ownerBearer } = await setupWorkspace();

    for (const body of [
      { name: 'k', scopes: ['tenants:read'], expiresAt: 'tomorrow' },
      { name: '', scopes: ['tenants:read'] },
      { name: 'x'.repeat(101), scopes: ['tenants:read'] },
      { name: 'k', scopes: Array.from({ length: 33 }, () => 'tenants:read') },
      { name: 'k', scopes: [] },
      { name: 'k' },
    ]) {
      const { status } = await api(`/v1/workspaces/${workspace.slug}/keys`, {
        method: 'POST',
        headers: ownerBearer,
        body: JSON.stringify(body),
      });
      expect(status, JSON.stringify(body)).toBe(400);
    }
  });

  it('rejects a past expiry', async () => {
    const { workspace, ownerBearer } = await setupWorkspace();

    const { status } = await api(`/v1/workspaces/${workspace.slug}/keys`, {
      method: 'POST',
      headers: ownerBearer,
      body: JSON.stringify({
        name: 'stale',
        scopes: ['tenants:read'],
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      }),
    });

    expect(status).toBe(400);
  });
});

describe('GET /v1/workspaces/:slug/keys', () => {
  it('masks secrets: only prefix and last4 ever come back', async () => {
    const { workspace, ownerBearer } = await setupWorkspace();

    const { status, body } = await api<{ items: Array<Record<string, unknown>> }>(
      `/v1/workspaces/${workspace.slug}/keys`,
      { headers: ownerBearer }
    );

    expect(status).toBe(200);
    expect(body.data?.items.length).toBeGreaterThan(0);
    for (const key of body.data?.items ?? []) {
      expect(key.secret).toBeUndefined();
      expect(key.keyHash).toBeUndefined();
      expect(String(key.prefix)).toMatch(/^bk_(ws|tn|pk)_/);
      expect(String(key.last4)).toHaveLength(4);
      if (key.kind === 'client') expect(String(key.token)).toMatch(/^bk_pk_/);
      else expect(key.token).toBeNull();
    }
  });
});

describe('DELETE /v1/workspaces/:slug/keys/:id', () => {
  it('revokes and reports revokedAt in the listing', async () => {
    const { workspace, ownerBearer, key } = await setupWorkspace();

    const revoke = await api<{ revokedAt: string | null }>(
      `/v1/workspaces/${workspace.slug}/keys/${key.id}`,
      { method: 'DELETE', headers: ownerBearer }
    );
    expect(revoke.status).toBe(200);
    expect(revoke.body.data?.revokedAt).not.toBeNull();
  });

  it('revoking is idempotent and revoked keys stay visible with revokedAt', async () => {
    const { workspace, ownerBearer, key } = await setupWorkspace();

    await api(`/v1/workspaces/${workspace.slug}/keys/${key.id}`, { method: 'DELETE', headers: ownerBearer });
    const again = await api<{ revokedAt: string | null }>(`/v1/workspaces/${workspace.slug}/keys/${key.id}`, {
      method: 'DELETE',
      headers: ownerBearer,
    });
    expect(again.status).toBe(200);

    const list = await api<{ items: Array<{ id: string; revokedAt: string | null }> }>(
      `/v1/workspaces/${workspace.slug}/keys`,
      { headers: ownerBearer }
    );
    expect(list.body.data?.items?.find((k) => k.id === key.id)?.revokedAt).toBeTruthy();
  });

  it('404s on malformed and unknown ids alike', async () => {
    const { workspace, ownerBearer } = await setupWorkspace();

    const malformed = await api(`/v1/workspaces/${workspace.slug}/keys/not-a-sqid!`, {
      method: 'DELETE',
      headers: ownerBearer,
    });
    expect(malformed.status).toBe(404);

    const foreign = await setupWorkspace();
    const notMine = await api(`/v1/workspaces/${workspace.slug}/keys/${foreign.key.id}`, {
      method: 'DELETE',
      headers: ownerBearer,
    });
    expect(notMine.status).toBe(404);
  });
});
