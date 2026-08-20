import { describe, expect, it } from 'vitest';
import { api } from '../../utils/api';
import { createKey, setupWorkspace, signUpUser, uniq } from '../../utils/setup';

/**
 * The isolation matrix — multi-tenancy is the core primitive, and these tests
 * are its permanent enforcement. Every phase adds rows here.
 */
describe('isolation: workspaces', () => {
  it('a non-member session cannot read or touch a foreign workspace', async () => {
    const { workspace } = await setupWorkspace();
    const stranger = await signUpUser('Stranger');

    const read = await api(`/v1/workspaces/${workspace.slug}`, { headers: stranger.bearer });
    expect(read.status).toBe(403);

    const patch = await api(`/v1/workspaces/${workspace.slug}`, {
      method: 'PATCH',
      headers: stranger.bearer,
      body: JSON.stringify({ name: 'Hijacked' }),
    });
    expect(patch.status).toBe(403);
  });

  it("a workspace key cannot address another workspace's routes", async () => {
    const a = await setupWorkspace();
    const b = await setupWorkspace();

    const cross = await api(`/v1/workspaces/${b.workspace.slug}`, { headers: a.keyBearer });
    expect(cross.status).toBe(403);
    expect(cross.body.error?.message).toContain('different workspace');
  });

  it('a session with x-workspace pointing at a foreign workspace is refused', async () => {
    const { workspace } = await setupWorkspace();
    const stranger = await signUpUser('Stranger');

    const { status } = await api('/v1/tenants', {
      headers: { ...stranger.bearer, 'x-workspace': workspace.slug },
    });

    expect(status).toBe(403);
  });
});

describe('isolation: API keys', () => {
  it('a tenant key is rejected on workspace-context routes', async () => {
    const { owner, workspace, keyBearer } = await setupWorkspace();

    const slug = `cust-${uniq()}`;
    await api('/v1/tenants', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ name: 'Customer', slug }),
    });

    const tenantKey = await createKey(owner.token, workspace.slug, {
      kind: 'tenant',
      tenant: slug,
      scopes: ['tenants:read'],
    });

    const list = await api('/v1/tenants', {
      headers: { Authorization: `Bearer ${tenantKey.secret}` },
    });
    expect(list.status).toBe(403);
    expect(list.body.error?.message).toContain('workspace API key');
  });

  it('keys can never manage keys — even with a wildcard grant', async () => {
    const { workspace, keyBearer } = await setupWorkspace();

    const mint = await api(`/v1/workspaces/${workspace.slug}/keys`, {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ name: 'evil', scopes: ['*'] }),
    });
    expect(mint.status).toBe(403);

    const list = await api(`/v1/workspaces/${workspace.slug}/keys`, { headers: keyBearer });
    expect(list.status).toBe(403);
  });

  it('a key without the required scope is refused', async () => {
    const { owner, workspace } = await setupWorkspace();
    const readOnly = await createKey(owner.token, workspace.slug, { scopes: ['tenants:read'] });

    const { status, body } = await api('/v1/tenants', {
      method: 'POST',
      headers: { Authorization: `Bearer ${readOnly.secret}` },
      body: JSON.stringify({ name: 'Nope', slug: `cust-${uniq()}` }),
    });

    expect(status).toBe(403);
    expect(body.error?.code).toBe('MISSING_PERMISSION');
  });

  it('a revoked key stops authenticating', async () => {
    const { owner, workspace, key } = await setupWorkspace();

    const revoke = await api(`/v1/workspaces/${workspace.slug}/keys/${key.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    expect(revoke.status).toBe(200);

    const { status } = await api('/v1/tenants', {
      headers: { Authorization: `Bearer ${key.secret}` },
    });
    expect(status).toBe(401);
  });

  it('garbage and empty keys are refused', async () => {
    const garbage = await api('/v1/tenants', {
      headers: { Authorization: 'Bearer bk_ws_thisIsNotARealKeyAtAll12345678901234567' },
    });
    expect(garbage.status).toBe(401);

    const missing = await api('/v1/tenants', {});
    expect(missing.status).toBe(401);
  });

  it('unvalidatable scopes are refused at key creation', async () => {
    const { owner, workspace } = await setupWorkspace();

    const { status } = await api(`/v1/workspaces/${workspace.slug}/keys`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${owner.token}` },
      body: JSON.stringify({ name: 'bad', scopes: ['keys:write'] }),
    });

    expect(status).toBe(400);
  });
});

describe('roles', () => {
  it('a member cannot administer, an admin cannot delete the workspace', async () => {
    const { owner, workspace } = await setupWorkspace();

    // Bring in a member via invite
    const invitee = await signUpUser('Member');
    const invite = await api<{ token: string }>(`/v1/workspaces/${workspace.slug}/invites`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${owner.token}` },
      body: JSON.stringify({ email: invitee.email, role: 'member' }),
    });
    await api(`/v1/invites/${invite.body.data?.token}/accept`, {
      method: 'POST',
      headers: invitee.bearer,
    });

    // member: reads work, admin actions don't
    const read = await api(`/v1/workspaces/${workspace.slug}`, { headers: invitee.bearer });
    expect(read.status).toBe(200);

    const patch = await api(`/v1/workspaces/${workspace.slug}`, {
      method: 'PATCH',
      headers: invitee.bearer,
      body: JSON.stringify({ name: 'Nope' }),
    });
    expect(patch.status).toBe(403);

    const del = await api(`/v1/workspaces/${workspace.slug}`, {
      method: 'DELETE',
      headers: invitee.bearer,
    });
    expect(del.status).toBe(403);
  });
});
