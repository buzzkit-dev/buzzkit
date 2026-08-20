import { describe, expect, it } from 'vitest';
import { api } from '../../utils/api';
import { createWorkspace, setupWorkspace, signUpUser, uniq } from '../../utils/setup';

describe('POST /v1/workspaces', () => {
  it('creates a workspace with prefixed sqid id and owner role', async () => {
    const user = await signUpUser();
    const slug = `ws-${uniq()}`;

    const { status, body } = await api<{ id: string; slug: string; role: string }>('/v1/workspaces', {
      method: 'POST',
      headers: user.bearer,
      body: JSON.stringify({ name: 'Acme', slug }),
    });

    expect(status).toBe(201);
    expect(body.data?.id).toMatch(/^ws_/);
    expect(body.data?.slug).toBe(slug);
    expect(body.data?.role).toBe('owner');
  });

  it('creates the default tenant automatically', async () => {
    const user = await signUpUser();
    const workspace = await createWorkspace(user.token);

    const { status, body } = await api<{
      items: Array<{ id: string; slug: string; isDefault: boolean }>;
    }>('/v1/tenants', {
      headers: { ...user.bearer, 'buzzkit-workspace': workspace.slug },
    });

    expect(status).toBe(200);
    expect(body.data?.items).toHaveLength(1);
    expect(body.data?.items[0]?.slug).toBe('default');
    expect(body.data?.items[0]?.isDefault).toBe(true);
    expect(body.data?.items[0]?.id).toMatch(/^tnt_/);
  });

  it('rejects duplicate and reserved slugs', async () => {
    const user = await signUpUser();
    const workspace = await createWorkspace(user.token);

    const duplicate = await api('/v1/workspaces', {
      method: 'POST',
      headers: user.bearer,
      body: JSON.stringify({ name: 'Copy', slug: workspace.slug }),
    });
    expect(duplicate.status).toBe(409);

    const reserved = await api('/v1/workspaces', {
      method: 'POST',
      headers: user.bearer,
      body: JSON.stringify({ name: 'Nope', slug: 'workspaces' }),
    });
    expect(reserved.status).toBe(400);
  });

  it('lists only the workspaces the caller belongs to, with their role', async () => {
    const user = await signUpUser();
    const mine = await createWorkspace(user.token);
    await setupWorkspace();

    const { status, body } = await api<Array<{ id: string; slug: string; role: string }>>('/v1/workspaces', {
      headers: user.bearer,
    });

    expect(status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data?.[0]?.slug).toBe(mine.slug);
    expect(body.data?.[0]?.role).toBe('owner');
    expect(body.data?.[0]?.id).toMatch(/^ws_/);
  });

  it('validates name and slug shape at creation', async () => {
    const user = await signUpUser();

    for (const body of [
      { name: '', slug: `ws-${uniq()}` },
      { name: 'x'.repeat(101), slug: `ws-${uniq()}` },
      { name: 'Ok', slug: 'ab' },
      { name: 'Ok', slug: 'Has Caps' },
      { name: 'Ok' },
    ]) {
      const { status } = await api('/v1/workspaces', {
        method: 'POST',
        headers: user.bearer,
        body: JSON.stringify(body),
      });
      expect(status, JSON.stringify(body)).toBe(400);
    }
  });

  it('requires a session', async () => {
    const { status } = await api('/v1/workspaces', {
      method: 'POST',
      body: JSON.stringify({ name: 'Anon', slug: `ws-${uniq()}` }),
    });

    expect(status).toBe(401);
  });
});
