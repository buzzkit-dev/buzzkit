import { describe, expect, it } from 'vitest';
import { api } from '../../../../utils/api';
import { setupWorkspace, uniq } from '../../../../utils/setup';

type InviteBody = { id: string; email: string; role: string; emailSent: boolean };

describe('/v1/workspaces/:workspaceSlug/invites', () => {
  it('creates and lists invites for a session', async () => {
    const { workspace, ownerBearer } = await setupWorkspace();
    const email = `invitee-${uniq()}@example.com`;

    const created = await api<InviteBody>(`/v1/workspaces/${workspace.slug}/invites`, {
      method: 'POST',
      headers: ownerBearer,
      body: JSON.stringify({ email, role: 'admin' }),
    });
    expect(created.status).toBe(201);
    expect(created.body.data?.id).toMatch(/^inv_/);
    expect(created.body.data?.role).toBe('admin');

    const listed = await api<{ items: InviteBody[] }>(`/v1/workspaces/${workspace.slug}/invites`, {
      headers: ownerBearer,
    });
    expect(listed.status).toBe(200);
    expect(listed.body.data?.items.some((row) => row.email === email)).toBe(true);
  });

  it('is session-only: API keys are refused', async () => {
    const { workspace, keyBearer } = await setupWorkspace();

    const denied = await api(`/v1/workspaces/${workspace.slug}/invites`, { headers: keyBearer });
    expect(denied.status).toBe(403);

    const unauthenticated = await api(`/v1/workspaces/${workspace.slug}/invites`);
    expect(unauthenticated.status).toBe(401);
  });
});
