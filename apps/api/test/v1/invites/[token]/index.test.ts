import { describe, expect, it } from 'vitest';
import { api } from '../../../utils/api';
import { setupWorkspace, uniq } from '../../../utils/setup';

type PreviewBody = { workspace: { name: string }; email: string; role: string };

describe('GET /v1/invites/:token', () => {
  it('previews an invite publicly without authentication', async () => {
    const { workspace, ownerBearer } = await setupWorkspace();
    const email = `invitee-${uniq()}@example.com`;
    const invite = await api<{ token: string }>(`/v1/workspaces/${workspace.slug}/invites`, {
      method: 'POST',
      headers: ownerBearer,
      body: JSON.stringify({ email, role: 'member' }),
    });

    const preview = await api<PreviewBody>(`/v1/invites/${invite.body.data?.token}`);
    expect(preview.status).toBe(200);
    expect(preview.body.data?.email).toBe(`${email[0]}***@example.com`);
    expect(preview.body.data?.role).toBe('member');
  });

  it('answers 404 for an unknown token', async () => {
    const unknown = await api(`/v1/invites/ghost-${uniq()}`);
    expect(unknown.status).toBe(404);
  });
});
