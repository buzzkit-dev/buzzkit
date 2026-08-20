import { describe, expect, it } from 'vitest';
import { api } from '../../utils/api';
import { setupWorkspace, signUpUser } from '../../utils/setup';

describe('invite lifecycle', () => {
  it('invite → public preview → accept grants membership with the invited role', async () => {
    const { owner, workspace } = await setupWorkspace();
    const invitee = await signUpUser('Invitee');

    const invite = await api<{ id: string; token: string }>(`/v1/workspaces/${workspace.slug}/invites`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${owner.token}` },
      body: JSON.stringify({ email: invitee.email, role: 'admin' }),
    });
    expect(invite.status).toBe(201);
    expect(invite.body.data?.id).toMatch(/^inv_/);

    // Public preview masks the email
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

    // Accepting twice conflicts
    const again = await api(`/v1/invites/${invite.body.data?.token}/accept`, {
      method: 'POST',
      headers: invitee.bearer,
    });
    expect(again.status).toBe(409);
  });

  it('only the invited email can accept', async () => {
    const { owner, workspace } = await setupWorkspace();
    const invitee = await signUpUser('Invitee');
    const impostor = await signUpUser('Impostor');

    const invite = await api<{ token: string }>(`/v1/workspaces/${workspace.slug}/invites`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${owner.token}` },
      body: JSON.stringify({ email: invitee.email, role: 'member' }),
    });

    const { status } = await api(`/v1/invites/${invite.body.data?.token}/accept`, {
      method: 'POST',
      headers: impostor.bearer,
    });

    expect(status).toBe(404);
  });

  it('a revoked invite cannot be accepted', async () => {
    const { owner, workspace } = await setupWorkspace();
    const invitee = await signUpUser('Invitee');
    const ownerBearer = { Authorization: `Bearer ${owner.token}` };

    const invite = await api<{ id: string; token: string }>(`/v1/workspaces/${workspace.slug}/invites`, {
      method: 'POST',
      headers: ownerBearer,
      body: JSON.stringify({ email: invitee.email, role: 'member' }),
    });

    await api(`/v1/workspaces/${workspace.slug}/invites/${invite.body.data?.id}`, {
      method: 'DELETE',
      headers: ownerBearer,
    });

    const { status } = await api(`/v1/invites/${invite.body.data?.token}/accept`, {
      method: 'POST',
      headers: invitee.bearer,
    });

    expect(status).toBe(404);
  });
});

describe('member management', () => {
  it('the last owner can never be demoted or removed', async () => {
    const { owner, workspace } = await setupWorkspace();
    const ownerBearer = { Authorization: `Bearer ${owner.token}` };

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
});
