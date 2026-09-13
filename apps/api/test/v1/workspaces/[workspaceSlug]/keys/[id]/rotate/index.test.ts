import { describe, expect, it } from 'vitest';
import { api } from '../../../../../../utils/api';
import { createKey, setupWorkspace } from '../../../../../../utils/setup';

type RotatedBody = {
  id: string;
  name: string;
  secret: string;
  prefix: string;
  last4: string;
  token: string | null;
};

describe('POST /v1/workspaces/:workspaceSlug/keys/:id/rotate', () => {
  it('replaces the secret in place: same id and name, old secret dead, new secret live', async () => {
    const { workspace, owner, ownerBearer } = await setupWorkspace();
    const created = await createKey(owner.token, workspace.slug, { name: 'CI key', kind: 'workspace' });

    const rotated = await api<RotatedBody>(`/v1/workspaces/${workspace.slug}/keys/${created.id}/rotate`, {
      method: 'POST',
      headers: ownerBearer,
    });
    expect(rotated.status).toBe(200);
    expect(rotated.body.data?.id).toBe(created.id);
    expect(rotated.body.data?.name).toBe('CI key');
    expect(rotated.body.data?.secret).toMatch(/^bk_ws_/);
    expect(rotated.body.data?.secret).not.toBe(created.secret);
    expect(rotated.body.data?.secret.endsWith(rotated.body.data.last4)).toBe(true);
    expect(rotated.body.data?.token).toBeNull();

    const old = await api('/v1/tenants', { headers: { Authorization: `Bearer ${created.secret}` } });
    expect(old.status).toBe(401);

    const fresh = await api('/v1/tenants', {
      headers: { Authorization: `Bearer ${rotated.body.data?.secret}` },
    });
    expect(fresh.status).toBe(200);

    const audit = await api<{ items: { event: string; data: Record<string, unknown> }[] }>(
      `/v1/workspaces/${workspace.slug}/audit?limit=50`,
      { headers: ownerBearer }
    );
    const entries = audit.body.data?.items.filter((item) => item.event === 'key.rotated') ?? [];
    expect(entries).toHaveLength(1);
    expect(entries[0]?.data).toMatchObject({ name: 'CI key', kind: 'workspace' });
    expect(JSON.stringify(audit.body)).not.toContain(rotated.body.data?.secret);
  });

  it('keeps a client key public after rotation', async () => {
    const { workspace, ownerBearer } = await setupWorkspace();
    const created = await api<RotatedBody>(`/v1/workspaces/${workspace.slug}/keys`, {
      method: 'POST',
      headers: ownerBearer,
      body: JSON.stringify({ name: 'iOS app', kind: 'client', tenant: 'default' }),
    });

    const rotated = await api<RotatedBody>(
      `/v1/workspaces/${workspace.slug}/keys/${created.body.data?.id}/rotate`,
      { method: 'POST', headers: ownerBearer }
    );
    expect(rotated.status).toBe(200);
    expect(rotated.body.data?.secret).toMatch(/^bk_pk_/);
    expect(rotated.body.data?.token).toBe(rotated.body.data?.secret);
  });

  it('refuses a revoked key and is session-only', async () => {
    const { workspace, owner, ownerBearer, keyBearer } = await setupWorkspace();
    const created = await createKey(owner.token, workspace.slug, { name: 'Old', kind: 'workspace' });

    const keyDenied = await api(`/v1/workspaces/${workspace.slug}/keys/${created.id}/rotate`, {
      method: 'POST',
      headers: keyBearer,
    });
    expect(keyDenied.status).toBe(403);

    await api(`/v1/workspaces/${workspace.slug}/keys/${created.id}`, {
      method: 'DELETE',
      headers: ownerBearer,
    });

    const refused = await api<never>(`/v1/workspaces/${workspace.slug}/keys/${created.id}/rotate`, {
      method: 'POST',
      headers: ownerBearer,
    });
    expect(refused.status).toBe(400);
    expect(refused.body.error?.code).toBe('key_revoked');
  });
});
