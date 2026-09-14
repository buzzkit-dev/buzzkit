import { describe, expect, it } from 'vitest';
import { api, type PageData } from '../../utils/api';
import { db, eq, grantAdmin, revokeAdmin, softDeleteUser, tables } from '../../utils/db';
import {
  addMember,
  createClientKey,
  createKey,
  createWorkspace,
  setupWorkspace,
  signUpUser,
  uniq,
} from '../../utils/setup';

type Listed = { id: string; slug: string; role: string | null };

describe('GET /v1/workspaces?all=true', () => {
  it('refuses every credential that is not an admin session', async () => {
    const { owner, workspace, ownerBearer, keyBearer } = await setupWorkspace({ bare: true });
    const other = await setupWorkspace({ bare: true });
    const admin = await addMember(owner.token, workspace.slug, 'admin');
    const promotedOwner = await addMember(owner.token, workspace.slug, 'owner');
    const tenantKey = await createKey(owner.token, workspace.slug, { kind: 'tenant', tenant: 'default' });
    const clientKey = await createClientKey(owner.token, workspace.slug, 'default');
    const wildcardKey = await createKey(owner.token, workspace.slug, { scopes: ['*'] });

    expect((await api('/v1/workspaces?all=true')).status).toBe(401);
    expect(
      (await api('/v1/workspaces?all=true', { headers: { Authorization: 'Bearer not-a-token' } })).status
    ).toBe(401);
    for (const headers of [ownerBearer, admin.bearer, promotedOwner.bearer, other.ownerBearer]) {
      const { status, body } = await api('/v1/workspaces?all=true', { headers });
      expect(status).toBe(403);
      expect(body.error?.code).toBe('admin_required');
    }
    for (const headers of [
      keyBearer,
      { Authorization: `Bearer ${tenantKey.secret}` },
      { Authorization: `Bearer ${clientKey.token}` },
      { Authorization: `Bearer ${wildcardKey.secret}` },
    ]) {
      expect((await api('/v1/workspaces?all=true', { headers })).status).toBe(401);
    }
  });

  it('lets an admin find any workspace by slug, name or member email, and pages with a cursor', async () => {
    const { workspace, owner } = await setupWorkspace({ bare: true });
    const support = await signUpUser('Support');
    await grantAdmin(support.email);

    const bySlug = await api<PageData<Listed>>(`/v1/workspaces?all=true&q=${workspace.slug}`, {
      headers: support.bearer,
    });
    expect(bySlug.status).toBe(200);
    expect(bySlug.body.data?.items.find((item) => item.slug === workspace.slug)).toMatchObject({
      role: null,
    });

    const byEmail = await api<PageData<Listed>>(
      `/v1/workspaces?all=true&q=${encodeURIComponent(owner.email)}`,
      {
        headers: support.bearer,
      }
    );
    expect(byEmail.body.data?.items.map((item) => item.slug)).toEqual([workspace.slug]);

    const stem = `page-${uniq()}`;
    const first = await createWorkspace(support.token, `${stem} one`);
    const second = await createWorkspace(support.token, `${stem} two`);
    const third = await createWorkspace(support.token, `${stem} three`);
    await api(`/v1/workspaces/${third.slug}`, { method: 'DELETE', headers: support.bearer });

    const page = await api<PageData<Listed>>(`/v1/workspaces?all=true&q=${stem}&limit=1`, {
      headers: support.bearer,
    });
    expect(page.body.data?.items.map((item) => item.slug)).toEqual([second.slug]);
    expect(page.body.data?.items[0]).toMatchObject({ role: 'owner' });
    expect(page.body.data?.hasMore).toBe(true);
    const next = await api<PageData<Listed>>(
      `/v1/workspaces?all=true&q=${stem}&limit=1&cursor=${page.body.data?.nextCursor}`,
      { headers: support.bearer }
    );
    expect(next.body.data?.items.map((item) => item.slug)).toEqual([first.slug]);
    expect(next.body.data?.hasMore).toBe(false);
  });

  it('without all, an admin still lists only their own memberships', async () => {
    const foreign = await setupWorkspace({ bare: true });
    const support = await signUpUser('Support');
    await grantAdmin(support.email);
    await api(`/v1/workspaces/${foreign.workspace.slug}`, { headers: support.bearer });

    const list = await api<PageData<Listed>>('/v1/workspaces', { headers: support.bearer });
    expect(list.body.data?.items).toEqual([]);
  });
});

describe('the admin flag is read fresh on every request', () => {
  it('revoking it in the database takes effect on the very next request', async () => {
    const { workspace, owner } = await setupWorkspace({ bare: true });
    const support = await signUpUser('Support');
    await grantAdmin(support.email);
    const member = await addMember(owner.token, workspace.slug, 'member');
    await grantAdmin(member.email);

    expect((await api(`/v1/workspaces/${workspace.slug}`, { headers: support.bearer })).status).toBe(200);
    expect((await api(`/v1/workspaces?all=true`, { headers: support.bearer })).status).toBe(200);
    const asOwner = await api(`/v1/workspaces/${workspace.slug}`, { headers: member.bearer });
    expect(asOwner.body.data).toMatchObject({ role: 'owner' });

    await revokeAdmin(support.email);
    await revokeAdmin(member.email);

    expect((await api(`/v1/workspaces/${workspace.slug}`, { headers: support.bearer })).status).toBe(404);
    expect((await api(`/v1/workspaces?all=true`, { headers: support.bearer })).status).toBe(403);
    const asMember = await api(`/v1/workspaces/${workspace.slug}`, { headers: member.bearer });
    expect(asMember.body.data).toMatchObject({ role: 'member' });
    const deleteAttempt = await api(`/v1/workspaces/${workspace.slug}`, {
      method: 'DELETE',
      headers: member.bearer,
    });
    expect(deleteAttempt.status).toBe(403);
  });

  it('a soft-deleted admin account is a stranger everywhere, even with a live session', async () => {
    const { workspace } = await setupWorkspace({ bare: true });
    const support = await signUpUser('Support');
    await grantAdmin(support.email);
    expect((await api(`/v1/workspaces/${workspace.slug}`, { headers: support.bearer })).status).toBe(200);

    await softDeleteUser(support.email);

    expect((await api(`/v1/workspaces/${workspace.slug}`, { headers: support.bearer })).status).toBe(404);
    expect((await api(`/v1/workspaces?all=true`, { headers: support.bearer })).status).toBe(403);
  });

  it('a workspace deleted before the admin ever saw it is a plain 404 and writes nothing', async () => {
    const { workspace, ownerBearer } = await setupWorkspace({ bare: true });
    await api(`/v1/workspaces/${workspace.slug}`, { method: 'DELETE', headers: ownerBearer });
    const support = await signUpUser('Support');
    await grantAdmin(support.email);

    expect((await api(`/v1/workspaces/${workspace.slug}`, { headers: support.bearer })).status).toBe(404);
    const rows = await db
      .select({ id: tables.event.id })
      .from(tables.event)
      .where(eq(tables.event.actorDisplay, support.email));
    expect(rows).toEqual([]);
  });
});

describe('?all=true search never matches what a workspace no longer has', () => {
  it("a removed member's email no longer finds the workspace", async () => {
    const { workspace, owner, ownerBearer } = await setupWorkspace({ bare: true });
    const member = await addMember(owner.token, workspace.slug, 'member');
    const support = await signUpUser('Support');
    await grantAdmin(support.email);

    const before = await api<PageData<Listed>>(
      `/v1/workspaces?all=true&q=${encodeURIComponent(member.email)}`,
      {
        headers: support.bearer,
      }
    );
    expect(before.body.data?.items.map((item) => item.slug)).toEqual([workspace.slug]);

    await api(`/v1/workspaces/${workspace.slug}/members/${member.memberId}`, {
      method: 'DELETE',
      headers: ownerBearer,
    });

    const after = await api<PageData<Listed>>(
      `/v1/workspaces?all=true&q=${encodeURIComponent(member.email)}`,
      {
        headers: support.bearer,
      }
    );
    expect(after.body.data?.items).toEqual([]);
  });
});
