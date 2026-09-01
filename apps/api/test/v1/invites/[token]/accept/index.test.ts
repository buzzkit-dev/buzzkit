import { describe, expect, it } from 'vitest';
import { api } from '../../../../utils/api';
import { setupWorkspace, signUpUser, uniq } from '../../../../utils/setup';

describe('POST /v1/invites/:token/accept', () => {
  it('grants membership to the signed-in user', async () => {
    const { workspace, ownerBearer } = await setupWorkspace();
    const invitee = await signUpUser('Invitee');
    const invite = await api<{ token: string }>(`/v1/workspaces/${workspace.slug}/invites`, {
      method: 'POST',
      headers: ownerBearer,
      body: JSON.stringify({ email: invitee.email, role: 'member' }),
    });

    const accepted = await api<{ id: string; role: string }>(
      `/v1/invites/${invite.body.data?.token}/accept`,
      { method: 'POST', headers: invitee.bearer }
    );
    expect(accepted.status).toBe(201);
    expect(accepted.body.data?.role).toBe('member');

    const members = await api<{ items: Array<{ role: string }> }>(
      `/v1/workspaces/${workspace.slug}/members`,
      { headers: invitee.bearer }
    );
    expect(members.status).toBe(200);
  });

  it('requires a session and answers 404 for unknown tokens', async () => {
    const unauthenticated = await api(`/v1/invites/ghost-${uniq()}/accept`, { method: 'POST' });
    expect(unauthenticated.status).toBe(401);

    const user = await signUpUser('Wanderer');
    const unknown = await api(`/v1/invites/ghost-${uniq()}/accept`, {
      method: 'POST',
      headers: user.bearer,
    });
    expect(unknown.status).toBe(404);
  });
});
