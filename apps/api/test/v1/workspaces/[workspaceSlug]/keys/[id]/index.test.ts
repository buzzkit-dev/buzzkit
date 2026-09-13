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

  it('renames a key without touching its secret, and an empty patch returns it unchanged', async () => {
    const { workspace, owner, ownerBearer } = await setupWorkspace();
    const created = await createKey(owner.token, workspace.slug, { name: 'Before', kind: 'workspace' });

    const renamed = await api<KeyBody & { updatedAt: string }>(
      `/v1/workspaces/${workspace.slug}/keys/${created.id}`,
      { method: 'PATCH', headers: ownerBearer, body: JSON.stringify({ name: 'After' }) }
    );
    expect(renamed.status).toBe(200);
    expect(renamed.body.data?.name).toBe('After');
    expect(renamed.body.data?.last4).toBe(created.secret.slice(-4));

    const stillWorks = await api('/v1/tenants', { headers: { Authorization: `Bearer ${created.secret}` } });
    expect(stillWorks.status).toBe(200);

    const untouched = await api<KeyBody>(`/v1/workspaces/${workspace.slug}/keys/${created.id}`, {
      method: 'PATCH',
      headers: ownerBearer,
      body: JSON.stringify({}),
    });
    expect(untouched.status).toBe(200);
    expect(untouched.body.data?.name).toBe('After');

    const audit = await api<{ items: { event: string; data: Record<string, unknown> }[] }>(
      `/v1/workspaces/${workspace.slug}/audit?limit=50`,
      { headers: ownerBearer }
    );
    const updated = audit.body.data?.items.filter((item) => item.event === 'key.updated') ?? [];
    expect(updated).toHaveLength(1);
    expect(updated[0]?.data).toMatchObject({
      changes: ['name'],
      previousAttributes: { name: 'Before' },
      name: 'After',
    });
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
