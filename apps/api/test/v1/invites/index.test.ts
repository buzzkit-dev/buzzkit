import { describe, expect, it } from 'vitest';
import { api } from '../../utils/api';
import { db, eq, tables } from '../../utils/db';
import { addMember, setupWorkspace, signUpUser, uniq } from '../../utils/setup';

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

  it('the public preview never leaks the token or the full email', async () => {
    const { workspace, ownerBearer } = await setupWorkspace();
    const email = `secret-${uniq()}@buzzkit.dev`;

    const invite = await api<{ token: string }>(`/v1/workspaces/${workspace.slug}/invites`, {
      method: 'POST',
      headers: ownerBearer,
      body: JSON.stringify({ email }),
    });

    const preview = await api<Record<string, unknown>>(`/v1/invites/${invite.body.data?.token}`);
    const serialized = JSON.stringify(preview.body);
    expect(preview.body.data?.token).toBeUndefined();
    expect(serialized).not.toContain(invite.body.data?.token ?? 'never');
    expect(serialized).not.toContain(email);
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

  it('normalizes email casing and validates role/email shape', async () => {
    const { workspace, ownerBearer } = await setupWorkspace();
    const invitee = await signUpUser('Invitee');

    const upper = await api<{ email: string; token: string }>(`/v1/workspaces/${workspace.slug}/invites`, {
      method: 'POST',
      headers: ownerBearer,
      body: JSON.stringify({ email: invitee.email.toUpperCase() }),
    });
    expect(upper.status).toBe(201);
    expect(upper.body.data?.email).toBe(invitee.email);

    const accept = await api(`/v1/invites/${upper.body.data?.token}/accept`, {
      method: 'POST',
      headers: invitee.bearer,
    });
    expect(accept.status).toBe(201);

    for (const body of [
      { email: 'not-an-email' },
      { email: `x-${uniq()}@buzzkit.dev`, role: 'owner' },
      { email: `x-${uniq()}@buzzkit.dev`, role: 'superuser' },
      {},
    ]) {
      const { status } = await api(`/v1/workspaces/${workspace.slug}/invites`, {
        method: 'POST',
        headers: ownerBearer,
        body: JSON.stringify(body),
      });
      expect(status, JSON.stringify(body)).toBe(400);
    }
  });

  it('resend refuses accepted invites and unknown ids', async () => {
    const { workspace, ownerBearer } = await setupWorkspace();
    const invitee = await signUpUser('Invitee');

    const invite = await api<{ id: string; token: string }>(`/v1/workspaces/${workspace.slug}/invites`, {
      method: 'POST',
      headers: ownerBearer,
      body: JSON.stringify({ email: invitee.email }),
    });
    await api(`/v1/invites/${invite.body.data?.token}/accept`, { method: 'POST', headers: invitee.bearer });

    const accepted = await api(`/v1/workspaces/${workspace.slug}/invites/${invite.body.data?.id}/resend`, {
      method: 'POST',
      headers: ownerBearer,
    });
    expect(accepted.status).toBe(409);

    const malformed = await api(`/v1/workspaces/${workspace.slug}/invites/nope!/resend`, {
      method: 'POST',
      headers: ownerBearer,
    });
    expect(malformed.status).toBe(404);

    const pending = await api<{ items: Array<{ id: string }> }>(`/v1/workspaces/${workspace.slug}/invites`, {
      headers: ownerBearer,
    });
    expect(pending.body.data?.items?.some((i) => i.id === invite.body.data?.id)).toBe(false);
  });

  it('workspace API keys cannot invite — invites are a session-only, dashboard action', async () => {
    const { workspace, keyBearer } = await setupWorkspace();

    const { status } = await api(`/v1/workspaces/${workspace.slug}/invites`, {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ email: `via-key-${uniq()}@buzzkit.dev` }),
    });

    expect(status).toBe(403);
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
  it('lists members with user identity and rejects bad member ids', async () => {
    const { owner, workspace, ownerBearer } = await setupWorkspace();
    const member = await addMember(owner.token, workspace.slug, 'member');

    const list = await api<{
      items: Array<{ id: string; role: string; user: { email: string; name: string } }>;
    }>(`/v1/workspaces/${workspace.slug}/members`, { headers: ownerBearer });
    expect(list.status).toBe(200);
    expect(list.body.data?.items).toHaveLength(2);
    const row = list.body.data?.items?.find((m) => m.id === member.memberId);
    expect(row?.role).toBe('member');
    expect(row?.user.email).toBe(member.email);

    const malformed = await api(`/v1/workspaces/${workspace.slug}/members/not-an-id!`, {
      method: 'PATCH',
      headers: ownerBearer,
      body: JSON.stringify({ role: 'admin' }),
    });
    expect(malformed.status).toBe(404);

    const badRole = await api(`/v1/workspaces/${workspace.slug}/members/${member.memberId}`, {
      method: 'PATCH',
      headers: ownerBearer,
      body: JSON.stringify({ role: 'god' }),
    });
    expect(badRole.status).toBe(400);

    const foreign = await setupWorkspace();
    const notMine = await api(`/v1/workspaces/${foreign.workspace.slug}/members/${member.memberId}`, {
      method: 'PATCH',
      headers: foreign.ownerBearer,
      body: JSON.stringify({ role: 'admin' }),
    });
    expect(notMine.status).toBe(404);
  });

  it('promoting member → admin → member works and is audited', async () => {
    const { owner, workspace, ownerBearer } = await setupWorkspace();
    const member = await addMember(owner.token, workspace.slug, 'member');

    const promote = await api<{ role: string }>(
      `/v1/workspaces/${workspace.slug}/members/${member.memberId}`,
      {
        method: 'PATCH',
        headers: ownerBearer,
        body: JSON.stringify({ role: 'admin' }),
      }
    );
    expect(promote.body.data?.role).toBe('admin');

    const nowAdmin = await api(`/v1/workspaces/${workspace.slug}/invites`, { headers: member.bearer });
    expect(nowAdmin.status).toBe(200);

    await api(`/v1/workspaces/${workspace.slug}/members/${member.memberId}`, {
      method: 'PATCH',
      headers: ownerBearer,
      body: JSON.stringify({ role: 'member' }),
    });
    const demoted = await api(`/v1/workspaces/${workspace.slug}/invites`, { headers: member.bearer });
    expect(demoted.status).toBe(403);

    const events = await api<{ items: Array<{ event: string; data: { from: string; to: string } }> }>(
      `/v1/workspaces/${workspace.slug}/events?event=member.role_changed`,
      { headers: ownerBearer }
    );
    expect(events.body.data?.items.length).toBe(2);
    expect(events.body.data?.items[0]?.data).toEqual({ from: 'admin', to: 'member' });
  });

  it('the last owner can never be demoted or removed', async () => {
    const { workspace, ownerBearer } = await setupWorkspace();

    const members = await api<{ items: Array<{ id: string; role: string }> }>(
      `/v1/workspaces/${workspace.slug}/members`,
      { headers: ownerBearer }
    );
    const ownerMember = members.body.data?.items?.find((m) => m.role === 'owner');
    expect(ownerMember).toBeDefined();

    const demote = await api(`/v1/workspaces/${workspace.slug}/members/${ownerMember?.id}`, {
      method: 'PATCH',
      headers: ownerBearer,
      body: JSON.stringify({ role: 'member' }),
    });
    expect(demote.status).toBe(409);

    const remove = await api(`/v1/workspaces/${workspace.slug}/members/${ownerMember?.id}`, {
      method: 'DELETE',
      headers: ownerBearer,
    });
    expect(remove.status).toBe(409);
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
    expect(access.status).toBe(404);
  });

  it('admins may remove members and other admins; members may remove nobody', async () => {
    const { owner, workspace } = await setupWorkspace();
    const admin = await addMember(owner.token, workspace.slug, 'admin');
    const otherAdmin = await addMember(owner.token, workspace.slug, 'admin');
    const member = await addMember(owner.token, workspace.slug, 'member');
    const victim = await addMember(owner.token, workspace.slug, 'member');

    const memberRemoves = await api(`/v1/workspaces/${workspace.slug}/members/${victim.memberId}`, {
      method: 'DELETE',
      headers: member.bearer,
    });
    expect(memberRemoves.status).toBe(403);

    const selfPromote = await api(`/v1/workspaces/${workspace.slug}/members/${member.memberId}`, {
      method: 'PATCH',
      headers: member.bearer,
      body: JSON.stringify({ role: 'admin' }),
    });
    expect(selfPromote.status).toBe(403);

    const adminRemovesMember = await api(`/v1/workspaces/${workspace.slug}/members/${victim.memberId}`, {
      method: 'DELETE',
      headers: admin.bearer,
    });
    expect(adminRemovesMember.status).toBe(200);

    const adminRemovesAdmin = await api(`/v1/workspaces/${workspace.slug}/members/${otherAdmin.memberId}`, {
      method: 'DELETE',
      headers: admin.bearer,
    });
    expect(adminRemovesAdmin.status).toBe(200);

    const gone = await api(`/v1/workspaces/${workspace.slug}`, { headers: otherAdmin.bearer });
    expect(gone.status).toBe(404);
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

describe('invite edges', () => {
  it('revoking an invite returns it deleted, audits it, and refuses malformed, foreign, and member callers', async () => {
    const { owner, workspace, ownerBearer } = await setupWorkspace();
    const member = await addMember(owner.token, workspace.slug, 'member');
    const created = await api<{ id: string }>(`/v1/workspaces/${workspace.slug}/invites`, {
      method: 'POST',
      headers: ownerBearer,
      body: JSON.stringify({ email: `rev-${uniq()}@acme.com` }),
    });
    const inviteId = created.body.data!.id;

    expect(
      (
        await api(`/v1/workspaces/${workspace.slug}/invites/${inviteId}`, {
          method: 'DELETE',
          headers: member.bearer,
        })
      ).status
    ).toBe(403);
    expect(
      (
        await api(`/v1/workspaces/${workspace.slug}/invites/nope!`, {
          method: 'DELETE',
          headers: ownerBearer,
        })
      ).status
    ).toBe(404);
    const foreign = await setupWorkspace();
    expect(
      (
        await api(`/v1/workspaces/${foreign.workspace.slug}/invites/${inviteId}`, {
          method: 'DELETE',
          headers: foreign.ownerBearer,
        })
      ).status
    ).toBe(404);

    const revoked = await api<{ id: string; deleted: boolean }>(
      `/v1/workspaces/${workspace.slug}/invites/${inviteId}`,
      {
        method: 'DELETE',
        headers: ownerBearer,
      }
    );
    expect(revoked.status).toBe(200);
    expect(revoked.body.data?.deleted).toBe(true);
    const events = await api<{ items: Array<{ event: string; targetId: string }> }>(
      `/v1/workspaces/${workspace.slug}/events?event=invite.revoked`,
      { headers: ownerBearer }
    );
    expect(events.body.data?.items.some((item) => item.targetId === inviteId)).toBe(true);
  });

  it('accepting needs a session and a non-member; resending an unknown invite is 404', async () => {
    const { owner, workspace, ownerBearer, keyBearer } = await setupWorkspace();
    const existing = await addMember(owner.token, workspace.slug, 'member');
    const invite = await api<{ id: string; token: string }>(`/v1/workspaces/${workspace.slug}/invites`, {
      method: 'POST',
      headers: ownerBearer,
      body: JSON.stringify({ email: existing.email }),
    });
    expect(invite.status).toBe(409);

    const fresh = await api<{ id: string; token: string }>(`/v1/workspaces/${workspace.slug}/invites`, {
      method: 'POST',
      headers: ownerBearer,
      body: JSON.stringify({ email: `late-${uniq()}@acme.com` }),
    });
    expect((await api(`/v1/invites/${fresh.body.data?.token}/accept`, { method: 'POST' })).status).toBe(401);
    expect(
      (await api(`/v1/invites/${fresh.body.data?.token}/accept`, { method: 'POST', headers: keyBearer }))
        .status
    ).toBe(401);
    expect(
      (
        await api(`/v1/workspaces/${workspace.slug}/invites/${fresh.body.data?.id}x/resend`, {
          method: 'POST',
          headers: ownerBearer,
        })
      ).status
    ).toBe(404);
  });
});
