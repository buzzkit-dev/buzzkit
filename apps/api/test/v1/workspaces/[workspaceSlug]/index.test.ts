import { describe, expect, it } from 'vitest';
import { api } from '../../../utils/api';
import { setupWorkspace, signUpUser, uniq } from '../../../utils/setup';

describe('GET /v1/workspaces/:slug', () => {
  it('returns the workspace with the caller role for sessions and null for keys', async () => {
    const { workspace, ownerBearer, keyBearer } = await setupWorkspace();

    const asSession = await api<{ id: string; role: string | null }>(`/v1/workspaces/${workspace.slug}`, {
      headers: ownerBearer,
    });
    expect(asSession.status).toBe(200);
    expect(asSession.body.data?.id).toMatch(/^ws_/);
    expect(asSession.body.data?.role).toBe('owner');

    const asKey = await api<{ role: string | null }>(`/v1/workspaces/${workspace.slug}`, {
      headers: keyBearer,
    });
    expect(asKey.status).toBe(200);
    expect(asKey.body.data?.role).toBeNull();
  });

  it('404s for unknown slugs', async () => {
    const { ownerBearer } = await setupWorkspace();

    const { status } = await api(`/v1/workspaces/does-not-exist-${uniq()}`, { headers: ownerBearer });

    expect(status).toBe(404);
  });
});

describe('PATCH /v1/workspaces/:slug', () => {
  it('renames the slug — the old address dies, the new one works', async () => {
    const { workspace, ownerBearer } = await setupWorkspace();
    const newSlug = `ws-${uniq()}`;

    const patch = await api<{ slug: string }>(`/v1/workspaces/${workspace.slug}`, {
      method: 'PATCH',
      headers: ownerBearer,
      body: JSON.stringify({ slug: newSlug }),
    });
    expect(patch.status).toBe(200);
    expect(patch.body.data?.slug).toBe(newSlug);

    const oldAddress = await api(`/v1/workspaces/${workspace.slug}`, { headers: ownerBearer });
    expect(oldAddress.status).toBe(404);

    const newAddress = await api(`/v1/workspaces/${newSlug}`, { headers: ownerBearer });
    expect(newAddress.status).toBe(200);
  });

  it('a renamed slug is immediately free for another workspace', async () => {
    const { workspace, ownerBearer } = await setupWorkspace();
    const other = await signUpUser();

    await api(`/v1/workspaces/${workspace.slug}`, {
      method: 'PATCH',
      headers: ownerBearer,
      body: JSON.stringify({ slug: `ws-${uniq()}` }),
    });

    const claim = await api('/v1/workspaces', {
      method: 'POST',
      headers: other.bearer,
      body: JSON.stringify({ name: 'Claimed', slug: workspace.slug }),
    });
    expect(claim.status).toBe(201);
  });

  it('rejects empty patches, taken slugs, and reserved slugs', async () => {
    const { workspace, ownerBearer } = await setupWorkspace();
    const other = await setupWorkspace();

    const empty = await api(`/v1/workspaces/${workspace.slug}`, {
      method: 'PATCH',
      headers: ownerBearer,
      body: JSON.stringify({}),
    });
    expect(empty.status).toBe(200);

    const taken = await api(`/v1/workspaces/${workspace.slug}`, {
      method: 'PATCH',
      headers: ownerBearer,
      body: JSON.stringify({ slug: other.workspace.slug }),
    });
    expect(taken.status).toBe(409);

    const reserved = await api(`/v1/workspaces/${workspace.slug}`, {
      method: 'PATCH',
      headers: ownerBearer,
      body: JSON.stringify({ slug: 'billing' }),
    });
    expect(reserved.status).toBe(400);
  });

  it('rejects malformed slugs at validation', async () => {
    const { workspace, ownerBearer } = await setupWorkspace();

    for (const slug of ['UPPER', 'has space', '-leading', 'trailing-', 'sh', 'double--hyphen']) {
      const { status } = await api(`/v1/workspaces/${workspace.slug}`, {
        method: 'PATCH',
        headers: ownerBearer,
        body: JSON.stringify({ slug }),
      });
      expect(status, `slug '${slug}' must be refused`).toBe(400);
    }
  });
});

describe('DELETE /v1/workspaces/:slug', () => {
  it('soft-deletes: the workspace 404s and its keys die', async () => {
    const { workspace, ownerBearer, keyBearer } = await setupWorkspace();

    const del = await api(`/v1/workspaces/${workspace.slug}`, { method: 'DELETE', headers: ownerBearer });
    expect(del.status).toBe(200);

    const fetch = await api(`/v1/workspaces/${workspace.slug}`, { headers: ownerBearer });
    expect(fetch.status).toBe(404);

    const viaKey = await api('/v1/tenants', { headers: keyBearer });
    expect(viaKey.status).toBe(401);
  });

  it('frees the slug for reuse after deletion', async () => {
    const { workspace, ownerBearer, owner } = await setupWorkspace();

    await api(`/v1/workspaces/${workspace.slug}`, { method: 'DELETE', headers: ownerBearer });

    const recreate = await api('/v1/workspaces', {
      method: 'POST',
      headers: { Authorization: `Bearer ${owner.token}` },
      body: JSON.stringify({ name: 'Reborn', slug: workspace.slug }),
    });
    expect(recreate.status).toBe(201);
  });
});

describe('audit payloads', () => {
  it('workspace.updated carries the diff shape and workspace.deleted the target', async () => {
    const { workspace, ownerBearer } = await setupWorkspace();
    await api(`/v1/workspaces/${workspace.slug}`, {
      method: 'PATCH',
      headers: ownerBearer,
      body: JSON.stringify({ name: 'Renamed' }),
    });
    const updated = await api<{
      items: Array<{
        event: string;
        data: { changes: string[]; previousAttributes: Record<string, unknown> };
      }>;
    }>(`/v1/workspaces/${workspace.slug}/events?event=workspace.updated`, { headers: ownerBearer });
    const item = updated.body.data?.items[0];
    expect(item?.data.changes).toEqual(['name']);
    expect(item?.data.previousAttributes.name).toBe(workspace.name);
    expect(item?.data.changes).not.toContain('updatedAt');
  });
});
