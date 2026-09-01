import { describe, expect, it } from 'vitest';
import { api } from '../../../../../../utils/api';
import { setupWorkspace, uniq } from '../../../../../../utils/setup';

type InviteBody = { id: string; expiresAt?: string };

describe('POST /v1/workspaces/:workspaceSlug/invites/:id/resend', () => {
  it('re-issues the invite email and extends the invite', async () => {
    const { workspace, ownerBearer } = await setupWorkspace();
    const created = await api<InviteBody>(`/v1/workspaces/${workspace.slug}/invites`, {
      method: 'POST',
      headers: ownerBearer,
      body: JSON.stringify({ email: `invitee-${uniq()}@example.com`, role: 'member' }),
    });
    const id = created.body.data?.id ?? '';

    const resent = await api<InviteBody>(`/v1/workspaces/${workspace.slug}/invites/${id}/resend`, {
      method: 'POST',
      headers: ownerBearer,
    });
    expect(resent.status).toBe(200);
    expect(resent.body.data?.id).toBe(id);
  });

  it('is session-only and answers 404 for unknown invites', async () => {
    const { workspace, ownerBearer, keyBearer } = await setupWorkspace();

    const keyDenied = await api(`/v1/workspaces/${workspace.slug}/invites/inv_x/resend`, {
      method: 'POST',
      headers: keyBearer,
    });
    expect(keyDenied.status).toBe(403);

    const unknown = await api(`/v1/workspaces/${workspace.slug}/invites/not-a-sqid/resend`, {
      method: 'POST',
      headers: ownerBearer,
    });
    expect(unknown.status).toBe(404);
  });
});
