import { describe, expect, it } from 'vitest';
import { api } from '../../utils/api';
import { createTenant, setupWorkspace, uniq } from '../../utils/setup';

describe('/v1/tenants (workspace API key)', () => {
  it('creates, reads, updates and deletes a tenant', async () => {
    const { keyBearer } = await setupWorkspace();
    const slug = `cust-${uniq()}`;

    const created = await api<{ id: string; slug: string; metadata: Record<string, unknown> }>(
      '/v1/tenants',
      {
        method: 'POST',
        headers: keyBearer,
        body: JSON.stringify({ name: 'Customer', slug, metadata: { externalId: 'cus_1' } }),
      }
    );
    expect(created.status).toBe(201);
    expect(created.body.data?.id).toMatch(/^tnt_/);
    expect(created.body.data?.metadata).toEqual({ externalId: 'cus_1' });

    const fetched = await api<{ slug: string }>(`/v1/tenants/${slug}`, { headers: keyBearer });
    expect(fetched.status).toBe(200);
    expect(fetched.body.data?.slug).toBe(slug);

    const patched = await api<{ name: string }>(`/v1/tenants/${slug}`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ name: 'Renamed' }),
    });
    expect(patched.status).toBe(200);
    expect(patched.body.data?.name).toBe('Renamed');

    const deleted = await api(`/v1/tenants/${slug}`, { method: 'DELETE', headers: keyBearer });
    expect(deleted.status).toBe(200);

    const gone = await api(`/v1/tenants/${slug}`, { headers: keyBearer });
    expect(gone.status).toBe(404);
  });

  it('creates a default client key for a new tenant', async () => {
    const { workspace, ownerBearer, keyBearer } = await setupWorkspace();
    const tenant = await createTenant(keyBearer);

    const { body } = await api<{
      items: Array<{ kind: string; name: string; tenantId: string | null; token: string | null }>;
    }>(`/v1/workspaces/${workspace.slug}/keys`, { headers: ownerBearer });

    const created = body.data?.items.find((key) => key.tenantId === tenant.id && key.kind === 'client');
    expect(created?.name).toBe('Default');
    expect(created?.token).toMatch(/^bk_pk_/);
  });

  it('rejects duplicate tenant slugs within the workspace', async () => {
    const { keyBearer } = await setupWorkspace();
    const slug = `cust-${uniq()}`;

    await api('/v1/tenants', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ name: 'One', slug }),
    });

    const duplicate = await api('/v1/tenants', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ name: 'Two', slug }),
    });

    expect(duplicate.status).toBe(409);
  });

  it('allows the same tenant slug in different workspaces', async () => {
    const a = await setupWorkspace();
    const b = await setupWorkspace();
    const slug = `cust-${uniq()}`;

    const first = await api('/v1/tenants', {
      method: 'POST',
      headers: a.keyBearer,
      body: JSON.stringify({ name: 'A', slug }),
    });
    const second = await api('/v1/tenants', {
      method: 'POST',
      headers: b.keyBearer,
      body: JSON.stringify({ name: 'B', slug }),
    });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
  });

  it('never deletes the default tenant', async () => {
    const { keyBearer } = await setupWorkspace();

    const { status, body } = await api('/v1/tenants/default', { method: 'DELETE', headers: keyBearer });

    expect(status).toBe(409);
    expect(body.error?.message).toContain('default tenant');
  });

  it('paginates with opaque cursors', async () => {
    const { keyBearer } = await setupWorkspace();

    for (let i = 0; i < 3; i++) {
      await api('/v1/tenants', {
        method: 'POST',
        headers: keyBearer,
        body: JSON.stringify({ name: `Customer ${i}`, slug: `cust-${uniq()}` }),
      });
    }

    // 4 tenants total (incl. default) — page size 2 needs two cursor hops
    const page1 = await api<{ items: unknown[]; hasMore: boolean; nextCursor: string; total: number }>(
      '/v1/tenants?limit=2',
      { headers: keyBearer }
    );
    expect(page1.body.data?.items).toHaveLength(2);
    expect(page1.body.data?.total).toBe(4);
    expect(page1.body.data?.hasMore).toBe(true);
    expect(page1.body.data?.nextCursor).toMatch(/^tnt_/);

    const page2 = await api<{ items: unknown[]; hasMore: boolean }>(
      `/v1/tenants?limit=2&cursor=${page1.body.data?.nextCursor}`,
      { headers: keyBearer }
    );
    expect(page2.body.data?.items).toHaveLength(2);
    expect(page2.body.data?.hasMore).toBe(false);
  });

  it('rejects malformed slugs, unknown limits, and garbage cursors', async () => {
    const { keyBearer } = await setupWorkspace();

    for (const slug of ['UPPER', 'has space', '-x', 'x-', 'a--b']) {
      const { status } = await api('/v1/tenants', {
        method: 'POST',
        headers: keyBearer,
        body: JSON.stringify({ name: 'Bad', slug }),
      });
      expect(status, `slug '${slug}' must be refused`).toBe(400);
    }

    const overLimit = await api('/v1/tenants?limit=101', { headers: keyBearer });
    expect(overLimit.status).toBe(400);

    const badCursor = await api('/v1/tenants?cursor=not-a-cursor!', { headers: keyBearer });
    expect(badCursor.status).toBe(400);
  });

  it('replaces metadata wholesale on patch and frees a renamed slug', async () => {
    const { keyBearer } = await setupWorkspace();
    const slug = `cust-${uniq()}`;
    await api('/v1/tenants', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ name: 'C', slug, metadata: { a: 1, b: 2 } }),
    });

    const patched = await api<{ metadata: Record<string, unknown>; slug: string }>(`/v1/tenants/${slug}`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ metadata: { c: 3 } }),
    });
    expect(patched.body.data?.metadata).toEqual({ c: 3 });

    const newSlug = `cust-${uniq()}`;
    await api(`/v1/tenants/${slug}`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ slug: newSlug }),
    });

    const reuse = await api('/v1/tenants', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ name: 'Reuse', slug }),
    });
    expect(reuse.status).toBe(201);
  });

  it('serves sessions with buzzkit-workspace identically to workspace keys', async () => {
    const { workspace, ownerBearer, keyBearer } = await setupWorkspace();
    const sessionHeaders = { ...ownerBearer, 'buzzkit-workspace': workspace.slug };

    const tenant = await createTenant(sessionHeaders);

    const viaKey = await api<{ slug: string }>(`/v1/tenants/${tenant.slug}`, { headers: keyBearer });
    expect(viaKey.status).toBe(200);
    expect(viaKey.body.data?.slug).toBe(tenant.slug);
  });

  it('the default tenant keeps its slug; empty patches are refused; metadata replaces wholesale', async () => {
    const { keyBearer } = await setupWorkspace();

    const rename = await api('/v1/tenants/default', {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ slug: `renamed-${uniq()}` }),
    });
    expect(rename.status).toBe(409);

    const empty = await api('/v1/tenants/default', { method: 'PATCH', headers: keyBearer, body: '{}' });
    expect(empty.status).toBe(200);

    const slug = `cust-${uniq()}`;
    await api('/v1/tenants', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ name: 'C', slug, metadata: { a: 1 } }),
    });
    const renamedDefaultOnly = await api<{ name: string; metadata: Record<string, unknown> }>(
      `/v1/tenants/${slug}`,
      {
        method: 'PATCH',
        headers: keyBearer,
        body: JSON.stringify({ name: 'Renamed' }),
      }
    );
    expect(renamedDefaultOnly.body.data?.name).toBe('Renamed');
    expect(renamedDefaultOnly.body.data?.metadata).toEqual({ a: 1 });
  });

  it('deleting a tenant takes its data plane with it', async () => {
    const { keyBearer } = await setupWorkspace();
    const tenant = await createTenant(keyBearer);
    const inTenant = { ...keyBearer, 'buzzkit-tenant': tenant.slug };
    const externalId = `user_${uniq()}`;

    await api(`/v1/subscribers/${externalId}`, { method: 'PUT', headers: inTenant, body: '{}' });
    await api('/v1/topics', {
      method: 'POST',
      headers: inTenant,
      body: JSON.stringify({ slug: `t-${uniq()}`, name: 'T' }),
    });

    await api(`/v1/tenants/${tenant.slug}`, { method: 'DELETE', headers: keyBearer });

    for (const path of [`/v1/subscribers/${externalId}`, '/v1/topics', '/v1/credentials']) {
      const { status } = await api(path, { headers: inTenant });
      expect(status, path).toBe(404);
    }

    const recreated = await api('/v1/tenants', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ name: 'Again', slug: tenant.slug }),
    });
    expect(recreated.status).toBe(201);

    const fresh = await api(`/v1/subscribers/${externalId}`, { headers: inTenant });
    expect(fresh.status).toBe(404);
  });

  it('returns resolved settings with defaults and deep-merges patches', async () => {
    const { keyBearer } = await setupWorkspace();

    type TenantDetail = {
      settings: {
        identity: { requireVerification: boolean };
        channels: { push: { enabled: boolean }; email: { enabled: boolean } };
      };
    };

    const fresh = await api<TenantDetail>('/v1/tenants/default', { headers: keyBearer });
    expect(fresh.body.data?.settings).toEqual({
      identity: { requireVerification: false },
      channels: { push: { enabled: true }, email: { enabled: true } },
      sendPolicy: { quietHours: null, dailyCap: null },
    });

    const disableEmail = await api<TenantDetail>('/v1/tenants/default', {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ settings: { channels: { email: { enabled: false } } } }),
    });
    expect(disableEmail.body.data?.settings.channels.email.enabled).toBe(false);
    expect(disableEmail.body.data?.settings.channels.push.enabled).toBe(true);

    const enableIdentity = await api<TenantDetail>('/v1/tenants/default', {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ settings: { identity: { requireVerification: true } } }),
    });
    expect(enableIdentity.body.data?.settings.identity.requireVerification).toBe(true);
    expect(enableIdentity.body.data?.settings.channels.email.enabled).toBe(false);

    const unknownGroup = await api('/v1/tenants/default', {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ settings: { billing: { plan: 'pro' } } }),
    });
    expect(unknownGroup.status).toBe(400);

    const unknownChannel = await api('/v1/tenants/default', {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ settings: { channels: { fax: { enabled: true } } } }),
    });
    expect(unknownChannel.status).toBe(400);
  });

  it('leaks no numeric ids anywhere in tenant responses', async () => {
    const { keyBearer } = await setupWorkspace();

    const { body } = await api('/v1/tenants', { headers: keyBearer });

    const scan = (value: unknown, path: string): void => {
      if (Array.isArray(value)) {
        for (const [i, item] of value.entries()) {
          scan(item, `${path}[${i}]`);
        }
      } else if (value && typeof value === 'object') {
        for (const [key, child] of Object.entries(value)) {
          if ((key === 'id' || key.endsWith('Id')) && typeof child === 'number') {
            throw new Error(`numeric id leaked at ${path}.${key}`);
          }
          scan(child, `${path}.${key}`);
        }
      }
    };

    expect(() => scan(body.data, 'data')).not.toThrow();
  });

  it('caps tenant metadata at 16KB', async () => {
    const { keyBearer } = await setupWorkspace();
    const tooBig = await api('/v1/tenants', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ name: 'Big', slug: `big-${uniq()}`, metadata: { blob: 'x'.repeat(17 * 1024) } }),
    });
    expect(tooBig.status).toBe(400);

    const tenant = await createTenant(keyBearer);
    const patchTooBig = await api(`/v1/tenants/${tenant.slug}`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ metadata: { blob: 'x'.repeat(17 * 1024) } }),
    });
    expect(patchTooBig.status).toBe(400);
  });
});

describe('settings validation matrix', () => {
  it('rejects every malformed settings shape and leaves settings untouched', async () => {
    const { keyBearer } = await setupWorkspace();
    const before = await api<{ settings: unknown }>('/v1/tenants/default', { headers: keyBearer });
    for (const settings of [
      { identity: true },
      { identity: { foo: true } },
      { identity: { requireVerification: 'yes' } },
      { channels: [] },
      { channels: { push: true } },
      { channels: { push: { enabled: 1 } } },
      { unknown: {} },
    ]) {
      const { status, body } = await api('/v1/tenants/default', {
        method: 'PATCH',
        headers: keyBearer,
        body: JSON.stringify({ settings }),
      });
      expect(status, JSON.stringify(settings)).toBe(400);
      expect(['bad_request', 'validation'], JSON.stringify(settings)).toContain(body.error?.code);
    }
    const after = await api<{ settings: unknown }>('/v1/tenants/default', { headers: keyBearer });
    expect(after.body.data?.settings).toEqual(before.body.data?.settings);
  });
});
