import { describe, expect, it } from 'vitest';
import { api } from '../../../../../utils/api';
import { addMember, setupWorkspace } from '../../../../../utils/setup';

type MemberBody = { id: string; role: string };

describe('/v1/workspaces/:workspaceSlug/members/:id', () => {
  it('reads a membership, changes its role, and removes it', async () => {
    const { workspace, owner, ownerBearer } = await setupWorkspace();
    const member = await addMember(owner.token, workspace.slug, 'member');

    const fetched = await api<MemberBody>(`/v1/workspaces/${workspace.slug}/members/${member.memberId}`, {
      headers: ownerBearer,
    });
    expect(fetched.status).toBe(200);
    expect(fetched.body.data?.role).toBe('member');

    const promoted = await api<MemberBody>(`/v1/workspaces/${workspace.slug}/members/${member.memberId}`, {
      method: 'PATCH',
      headers: ownerBearer,
      body: JSON.stringify({ role: 'admin' }),
    });
    expect(promoted.status).toBe(200);
    expect(promoted.body.data?.role).toBe('admin');

    const removed = await api(`/v1/workspaces/${workspace.slug}/members/${member.memberId}`, {
      method: 'DELETE',
      headers: ownerBearer,
    });
    expect(removed.status).toBe(200);

    const gone = await api(`/v1/workspaces/${workspace.slug}/members/${member.memberId}`, {
      headers: ownerBearer,
    });
    expect(gone.status).toBe(404);
  });

  it('requires a session for writes and answers 404 for malformed ids', async () => {
    const { workspace, ownerBearer, keyBearer } = await setupWorkspace();

    const keyDenied = await api(`/v1/workspaces/${workspace.slug}/members/mem_x`, {
      method: 'DELETE',
      headers: keyBearer,
    });
    expect(keyDenied.status).toBe(403);

    const malformed = await api(`/v1/workspaces/${workspace.slug}/members/not-a-sqid`, {
      headers: ownerBearer,
    });
    expect(malformed.status).toBe(404);
  });
});
