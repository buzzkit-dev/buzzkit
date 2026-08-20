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

    expect(status).toBe(400);
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
    const page1 = await api<{ items: unknown[]; hasMore: boolean; nextCursor: string }>(
      '/v1/tenants?limit=2',
      { headers: keyBearer }
    );
    expect(page1.body.data?.items).toHaveLength(2);
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
});
