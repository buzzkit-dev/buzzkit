import { describe, expect, it } from 'vitest';
import { api } from '../../../../utils/api';
import { addMember, setupWorkspace } from '../../../../utils/setup';

type MemberRow = { id: string; role: string; email?: string };

describe('GET /v1/workspaces/:workspaceSlug/members', () => {
  it('lists the memberships including invited members', async () => {
    const { workspace, owner, ownerBearer } = await setupWorkspace();
    await addMember(owner.token, workspace.slug, 'admin');

    const listed = await api<{ items: MemberRow[] }>(`/v1/workspaces/${workspace.slug}/members`, {
      headers: ownerBearer,
    });
    expect(listed.status).toBe(200);
    expect(listed.body.data?.items.length).toBe(2);
    expect(listed.body.data?.items.map((row) => row.role).sort()).toEqual(['admin', 'owner']);
  });

  it('requires auth and hides foreign workspaces from non-members', async () => {
    const { workspace } = await setupWorkspace();
    const outsider = await setupWorkspace();

    const unauthenticated = await api(`/v1/workspaces/${workspace.slug}/members`);
    expect(unauthenticated.status).toBe(401);

    const foreign = await api(`/v1/workspaces/${workspace.slug}/members`, {
      headers: outsider.ownerBearer,
    });
    expect(foreign.status).toBe(404);
  });
});
