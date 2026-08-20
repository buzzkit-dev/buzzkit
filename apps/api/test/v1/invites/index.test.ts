import { describe, expect, it } from 'vitest';
import { api } from '../../utils/api';
import { db, eq, tables } from '../../utils/db';
import { addMember, setupWorkspace, signUpUser } from '../../utils/setup';

describe('invite lifecycle', () => {
  it('invite → public preview → accept grants membership with the invited role', async () => {
    const { workspace, ownerBearer } = await setupWorkspace();
    const invitee = await signUpUser('Invitee');

    const invite = await api<{ id: string; token: string; emailSent: boolean }>(
      `/v1/workspaces/${workspace.slug}/invites`,
      {
        method: 'POST',
        headers: ownerBearer,
        body: JSON.stringify({ email: invitee.email, role: 'admin' }),
      }
    );
    expect(invite.status).toBe(201);
    expect(invite.body.data?.id).toMatch(/^inv_/);
    expect(typeof invite.body.data?.emailSent).toBe('boolean');

    const preview = await api<{ email: string; workspace: { slug: string } }>(
      `/v1/invites/${invite.body.data?.token}`
    );
    expect(preview.status).toBe(200);
    expect(preview.body.data?.email).toContain('***');
    expect(preview.body.data?.workspace.slug).toBe(workspace.slug);

    const accept = await api<{ role: string }>(`/v1/invites/${invite.body.data?.token}/accept`, {
      method: 'POST',
      headers: invitee.bearer,
    });
    expect(accept.status).toBe(201);
    expect(accept.body.data?.role).toBe('admin');

    const again = await api(`/v1/invites/${invite.body.data?.token}/accept`, {
      method: 'POST',
      headers: invitee.bearer,
    });
    expect(again.status).toBe(409);
  });

  it('only the invited email can accept', async () => {
    const { workspace, ownerBearer } = await setupWorkspace();
    const invitee = await signUpUser('Invitee');
    const impostor = await signUpUser('Impostor');

    const invite = await api<{ token: string }>(`/v1/workspaces/${workspace.slug}/invites`, {
      method: 'POST',
      headers: ownerBearer,
      body: JSON.stringify({ email: invitee.email, role: 'member' }),
    });

    const { status } = await api(`/v1/invites/${invite.body.data?.token}/accept`, {
      method: 'POST',
      headers: impostor.bearer,
    });

    expect(status).toBe(404);
  });

  it('an expired invite is 410 on accept, and resend revives it', async () => {
    const { workspace, ownerBearer } = await setupWorkspace();
    const invitee = await signUpUser('Invitee');

    const invite = await api<{ id: string; token: string; expiresAt: string }>(
      `/v1/workspaces/${workspace.slug}/invites`,
      {
        method: 'POST',
        headers: ownerBearer,
        body: JSON.stringify({ email: invitee.email }),
      }
    );
    const token = invite.body.data?.token ?? '';

    await db
      .update(tables.workspaceInvite)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(tables.workspaceInvite.token, token));

    const expired = await api(`/v1/invites/${token}/accept`, { method: 'POST', headers: invitee.bearer });
    expect(expired.status).toBe(410);

    const preview = await api<{ expired: boolean }>(`/v1/invites/${token}`);
    expect(preview.body.data?.expired).toBe(true);

    const resent = await api<{ expiresAt: string }>(
      `/v1/workspaces/${workspace.slug}/invites/${invite.body.data?.id}/resend`,
      { method: 'POST', headers: ownerBearer }
    );
    expect(resent.status).toBe(200);
    expect(new Date(resent.body.data?.expiresAt ?? 0).getTime()).toBeGreaterThan(Date.now());

    const accept = await api(`/v1/invites/${token}/accept`, { method: 'POST', headers: invitee.bearer });
    expect(accept.status).toBe(201);
  });

  it('conflicts on duplicate pending invites and existing members', async () => {
    const { workspace, ownerBearer } = await setupWorkspace();
    const invitee = await signUpUser('Invitee');

    const first = await api(`/v1/workspaces/${workspace.slug}/invites`, {
      method: 'POST',
      headers: ownerBearer,
      body: JSON.stringify({ email: invitee.email }),
    });
    expect(first.status).toBe(201);

    const duplicate = await api(`/v1/workspaces/${workspace.slug}/invites`, {
      method: 'POST',
      headers: ownerBearer,
      body: JSON.stringify({ email: invitee.email }),
    });
    expect(duplicate.status).toBe(409);

    const existing = await addMember(ownerBearer.Authorization.replace('Bearer ', ''), workspace.slug);
    const alreadyMember = await api(`/v1/workspaces/${workspace.slug}/invites`, {
      method: 'POST',
      headers: ownerBearer,
      body: JSON.stringify({ email: existing.email }),
    });
    expect(alreadyMember.status).toBe(409);
  });

  it('a revoked invite disappears from preview and cannot be accepted', async () => {
    const { workspace, ownerBearer } = await setupWorkspace();
    const invitee = await signUpUser('Invitee');

    const invite = await api<{ id: string; token: string }>(`/v1/workspaces/${workspace.slug}/invites`, {
      method: 'POST',
      headers: ownerBearer,
      body: JSON.stringify({ email: invitee.email }),
    });

    await api(`/v1/workspaces/${workspace.slug}/invites/${invite.body.data?.id}`, {
      method: 'DELETE',
      headers: ownerBearer,
    });

    const preview = await api(`/v1/invites/${invite.body.data?.token}`);
    expect(preview.status).toBe(404);

    const accept = await api(`/v1/invites/${invite.body.data?.token}/accept`, {
      method: 'POST',
      headers: invitee.bearer,
    });
    expect(accept.status).toBe(404);
  });

  it('unknown tokens 404 on preview and accept', async () => {
    const preview = await api('/v1/invites/definitely-not-a-token');
    expect(preview.status).toBe(404);

    const user = await signUpUser();
    const accept = await api('/v1/invites/definitely-not-a-token/accept', {
      method: 'POST',
      headers: user.bearer,
    });
    expect(accept.status).toBe(404);
  });

  it('members cannot create or list invites', async () => {
    const { owner, workspace } = await setupWorkspace();
    const member = await addMember(owner.token, workspace.slug, 'member');

    const create = await api(`/v1/workspaces/${workspace.slug}/invites`, {
      method: 'POST',
      headers: member.bearer,
      body: JSON.stringify({ email: 'someone@buzzkit.dev' }),
    });
    expect(create.status).toBe(403);

    const list = await api(`/v1/workspaces/${workspace.slug}/invites`, { headers: member.bearer });
    expect(list.status).toBe(403);
  });
});

describe('member management', () => {
  it('the last owner can never be demoted or removed', async () => {
    const { workspace, ownerBearer } = await setupWorkspace();

    const members = await api<Array<{ id: string; role: string }>>(
      `/v1/workspaces/${workspace.slug}/members`,
      { headers: ownerBearer }
    );
    const ownerMember = members.body.data?.find((m) => m.role === 'owner');
    expect(ownerMember).toBeDefined();

    const demote = await api(`/v1/workspaces/${workspace.slug}/members/${ownerMember?.id}`, {
      method: 'PATCH',
      headers: ownerBearer,
      body: JSON.stringify({ role: 'member' }),
    });
    expect(demote.status).toBe(400);

    const remove = await api(`/v1/workspaces/${workspace.slug}/members/${ownerMember?.id}`, {
      method: 'DELETE',
      headers: ownerBearer,
    });
    expect(remove.status).toBe(400);
  });

  it('with two owners, one can step down and be removed', async () => {
    const { owner, workspace, ownerBearer } = await setupWorkspace();
    const second = await addMember(owner.token, workspace.slug, 'owner');

    const demote = await api<{ role: string }>(
      `/v1/workspaces/${workspace.slug}/members/${second.memberId}`,
      {
        method: 'PATCH',
        headers: ownerBearer,
        body: JSON.stringify({ role: 'member' }),
      }
    );
    expect(demote.status).toBe(200);
    expect(demote.body.data?.role).toBe('member');

    const remove = await api(`/v1/workspaces/${workspace.slug}/members/${second.memberId}`, {
      method: 'DELETE',
      headers: ownerBearer,
    });
    expect(remove.status).toBe(200);

    const access = await api(`/v1/workspaces/${workspace.slug}`, { headers: second.bearer });
    expect(access.status).toBe(403);
  });

  it('a removed member can be re-invited and rejoin', async () => {
    const { owner, workspace, ownerBearer } = await setupWorkspace();
    const member = await addMember(owner.token, workspace.slug, 'member');

    await api(`/v1/workspaces/${workspace.slug}/members/${member.memberId}`, {
      method: 'DELETE',
      headers: ownerBearer,
    });

    const reinvite = await api<{ token: string }>(`/v1/workspaces/${workspace.slug}/invites`, {
      method: 'POST',
      headers: ownerBearer,
      body: JSON.stringify({ email: member.email }),
    });
    expect(reinvite.status).toBe(201);

    const accept = await api(`/v1/invites/${reinvite.body.data?.token}/accept`, {
      method: 'POST',
      headers: member.bearer,
    });
    expect(accept.status).toBe(201);
  });
});
