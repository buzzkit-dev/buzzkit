import { describe, expect, it } from 'vitest';
import { api } from '../../../../../utils/api';
import { setupWorkspace, uniq } from '../../../../../utils/setup';

type InviteBody = { id: string; email: string; status?: string };

async function createInvite(workspaceSlug: string, ownerBearer: Record<string, string>) {
  const { body } = await api<InviteBody>(`/v1/workspaces/${workspaceSlug}/invites`, {
    method: 'POST',
    headers: ownerBearer,
    body: JSON.stringify({ email: `invitee-${uniq()}@example.com`, role: 'member' }),
  });
  return body.data!;
}

describe('/v1/workspaces/:workspaceSlug/invites/:id', () => {
  it('reads one invite and revokes it', async () => {
    const { workspace, ownerBearer } = await setupWorkspace();
    const invite = await createInvite(workspace.slug, ownerBearer);

    const fetched = await api<InviteBody>(`/v1/workspaces/${workspace.slug}/invites/${invite.id}`, {
      headers: ownerBearer,
    });
    expect(fetched.status).toBe(200);
    expect(fetched.body.data?.email).toBe(invite.email);

    const revoked = await api(`/v1/workspaces/${workspace.slug}/invites/${invite.id}`, {
      method: 'DELETE',
      headers: ownerBearer,
    });
    expect(revoked.status).toBe(200);

    const gone = await api(`/v1/workspaces/${workspace.slug}/invites/${invite.id}`, {
      headers: ownerBearer,
    });
    expect(gone.status).toBe(404);
  });

  it('requires a session and answers 404 for malformed ids', async () => {
    const { workspace, ownerBearer, keyBearer } = await setupWorkspace();
    const invite = await createInvite(workspace.slug, ownerBearer);

    const keyDenied = await api(`/v1/workspaces/${workspace.slug}/invites/${invite.id}`, {
      headers: keyBearer,
    });
    expect(keyDenied.status).toBe(403);

    const malformed = await api(`/v1/workspaces/${workspace.slug}/invites/not-a-sqid`, {
      headers: ownerBearer,
    });
    expect(malformed.status).toBe(404);
  });
});
