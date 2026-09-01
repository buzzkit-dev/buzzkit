import { describe, expect, it } from 'vitest';
import { api } from '../../../../../utils/api';
import { createKey, setupWorkspace } from '../../../../../utils/setup';

type KeyBody = { id: string; name: string; kind: string; last4: string };

describe('/v1/workspaces/:workspaceSlug/keys/:id', () => {
  it('reads one key, revokes it and keeps the row readable while the secret dies', async () => {
    const { workspace, owner, ownerBearer } = await setupWorkspace();
    const created = await createKey(owner.token, workspace.slug, { name: 'CI key', kind: 'workspace' });
    const id = created.id;

    const fetched = await api<KeyBody>(`/v1/workspaces/${workspace.slug}/keys/${id}`, {
      headers: ownerBearer,
    });
    expect(fetched.status).toBe(200);
    expect(fetched.body.data?.name).toBe('CI key');

    const revoked = await api(`/v1/workspaces/${workspace.slug}/keys/${id}`, {
      method: 'DELETE',
      headers: ownerBearer,
    });
    expect(revoked.status).toBe(200);

    const revokedRow = await api<KeyBody & { revokedAt: string | null }>(
      `/v1/workspaces/${workspace.slug}/keys/${id}`,
      { headers: ownerBearer }
    );
    expect(revokedRow.status).toBe(200);
    expect(revokedRow.body.data?.revokedAt).not.toBeNull();

    const revokedSecret = created.secret;
    const dead = await api('/v1/tenants', { headers: { Authorization: `Bearer ${revokedSecret}` } });
    expect(dead.status).toBe(401);
  });

  it('is session-only and answers 404 for malformed ids', async () => {
    const { workspace, ownerBearer, keyBearer } = await setupWorkspace();

    const keyDenied = await api(`/v1/workspaces/${workspace.slug}/keys/key_x`, { headers: keyBearer });
    expect(keyDenied.status).toBe(403);

    const malformed = await api(`/v1/workspaces/${workspace.slug}/keys/not-a-sqid`, {
      headers: ownerBearer,
    });
    expect(malformed.status).toBe(404);
  });
});
