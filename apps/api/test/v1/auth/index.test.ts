import { describe, expect, it } from 'vitest';
import { api } from '../../utils/api';
import { db, eq, tables } from '../../utils/db';
import { addMember, createKey, createTenant, setupWorkspace, signUpUser, uniq } from '../../utils/setup';

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

  it('a session with buzzkit-workspace pointing at a foreign workspace is refused', async () => {
    const { workspace } = await setupWorkspace();
    const stranger = await signUpUser('Stranger');

    const { status } = await api('/v1/tenants', {
      headers: { ...stranger.bearer, 'buzzkit-workspace': workspace.slug },
    });

    expect(status).toBe(403);
  });

  it('a session without buzzkit-workspace on a slug-less route is a 400, not a leak', async () => {
    const user = await signUpUser();

    const { status, body } = await api('/v1/tenants', { headers: user.bearer });

    expect(status).toBe(400);
    expect(body.error?.message).toContain('workspace identifier');
  });
});

describe('isolation: API keys', () => {
  it('a tenant key is rejected on workspace-context routes', async () => {
    const { owner, workspace, keyBearer } = await setupWorkspace();
    const tenant = await createTenant(keyBearer);

    const tenantKey = await createKey(owner.token, workspace.slug, {
      kind: 'tenant',
      tenant: tenant.slug,
      scopes: ['credentials:read'],
    });

    const list = await api('/v1/tenants', {
      headers: { Authorization: `Bearer ${tenantKey.secret}` },
    });
    expect(list.status).toBe(403);
    expect(list.body.error?.message).toContain('workspace API key');
  });

  it('deleting a tenant kills its keys entirely — 401, not 403', async () => {
    const { owner, workspace, keyBearer } = await setupWorkspace();
    const tenant = await createTenant(keyBearer);
    const tenantKey = await createKey(owner.token, workspace.slug, {
      kind: 'tenant',
      tenant: tenant.slug,
      scopes: ['credentials:read'],
    });
    const tenantKeyBearer = { Authorization: `Bearer ${tenantKey.secret}` };

    // Alive: authenticated but rejected on this workspace-context route
    const before = await api('/v1/tenants', { headers: tenantKeyBearer });
    expect(before.status).toBe(403);

    await api(`/v1/tenants/${tenant.slug}`, { method: 'DELETE', headers: keyBearer });

    // Dead: no longer authenticates at all
    const after = await api('/v1/tenants', { headers: tenantKeyBearer });
    expect(after.status).toBe(401);
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

  it('scope enforcement: exact grants, resource wildcards, missing scopes', async () => {
    const { owner, workspace } = await setupWorkspace();

    const readOnly = await createKey(owner.token, workspace.slug, { scopes: ['tenants:read'] });
    const readBearer = { Authorization: `Bearer ${readOnly.secret}` };

    const listAllowed = await api('/v1/tenants', { headers: readBearer });
    expect(listAllowed.status).toBe(200);

    const createDenied = await api('/v1/tenants', {
      method: 'POST',
      headers: readBearer,
      body: JSON.stringify({ name: 'Nope', slug: `cust-${uniq()}` }),
    });
    expect(createDenied.status).toBe(403);
    expect(createDenied.body.error?.code).toBe('MISSING_PERMISSION');

    const wildcard = await createKey(owner.token, workspace.slug, { scopes: ['tenants:*'] });
    const wildcardBearer = { Authorization: `Bearer ${wildcard.secret}` };

    const createAllowed = await api('/v1/tenants', {
      method: 'POST',
      headers: wildcardBearer,
      body: JSON.stringify({ name: 'Yes', slug: `cust-${uniq()}` }),
    });
    expect(createAllowed.status).toBe(201);

    const otherResource = await api(`/v1/workspaces/${workspace.slug}`, {
      method: 'PATCH',
      headers: wildcardBearer,
      body: JSON.stringify({ name: 'Nope' }),
    });
    expect(otherResource.status).toBe(403);
  });

  it('an expired key stops authenticating', async () => {
    const { owner, workspace } = await setupWorkspace();
    const name = `expiring-${uniq()}`;
    const key = await createKey(owner.token, workspace.slug, { name, scopes: ['tenants:read'] });
    const bearer = { Authorization: `Bearer ${key.secret}` };

    const before = await api('/v1/tenants', { headers: bearer });
    expect(before.status).toBe(200);

    await db
      .update(tables.apiKey)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(tables.apiKey.name, name));

    const after = await api('/v1/tenants', { headers: bearer });
    expect(after.status).toBe(401);
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

  it('garbage, truncated, and missing credentials are refused', async () => {
    const garbage = await api('/v1/tenants', {
      headers: { Authorization: 'Bearer bk_ws_thisIsNotARealKeyAtAll12345678901234567' },
    });
    expect(garbage.status).toBe(401);

    const truncated = await api('/v1/tenants', { headers: { Authorization: 'Bearer bk_ws_' } });
    expect(truncated.status).toBe(401);

    const wrongScheme = await api('/v1/tenants', { headers: { Authorization: 'Basic dXNlcjpwYXNz' } });
    expect(wrongScheme.status).toBe(401);

    const missing = await api('/v1/tenants', {});
    expect(missing.status).toBe(401);

    const staleSession = await api('/v1/workspaces', {
      headers: { Authorization: 'Bearer not-a-real-session-token' },
    });
    expect(staleSession.status).toBe(401);
  });

  it('session-only and unknown scopes are refused at key creation', async () => {
    const { owner, workspace } = await setupWorkspace();
    const ownerBearer = { Authorization: `Bearer ${owner.token}` };

    for (const scopes of [['keys:write'], ['keys:*'], ['account:read'], ['made-up:read'], ['nonsense']]) {
      const { status } = await api(`/v1/workspaces/${workspace.slug}/keys`, {
        method: 'POST',
        headers: ownerBearer,
        body: JSON.stringify({ name: 'bad', scopes }),
      });
      expect(status, `scopes ${JSON.stringify(scopes)} must be refused`).toBe(400);
    }
  });
});

describe('role scope matrix', () => {
  it('enforces the member/admin/owner bundles across representative endpoints', async () => {
    const { owner, workspace, ownerBearer } = await setupWorkspace();
    const admin = await addMember(owner.token, workspace.slug, 'admin');
    const member = await addMember(owner.token, workspace.slug, 'member');

    const attempts = [
      {
        name: 'read workspace',
        member: 200,
        admin: 200,
        owner: 200,
        run: (h: Record<string, string>) => api(`/v1/workspaces/${workspace.slug}`, { headers: h }),
      },
      {
        name: 'list members',
        member: 200,
        admin: 200,
        owner: 200,
        run: (h: Record<string, string>) => api(`/v1/workspaces/${workspace.slug}/members`, { headers: h }),
      },
      {
        name: 'list tenants',
        member: 200,
        admin: 200,
        owner: 200,
        run: (h: Record<string, string>) =>
          api('/v1/tenants', { headers: { ...h, 'buzzkit-workspace': workspace.slug } }),
      },
      {
        name: 'list keys',
        member: 200,
        admin: 200,
        owner: 200,
        run: (h: Record<string, string>) => api(`/v1/workspaces/${workspace.slug}/keys`, { headers: h }),
      },
      {
        name: 'rename workspace',
        member: 403,
        admin: 200,
        owner: 200,
        run: (h: Record<string, string>) =>
          api(`/v1/workspaces/${workspace.slug}`, {
            method: 'PATCH',
            headers: h,
            body: JSON.stringify({ name: 'Renamed' }),
          }),
      },
      {
        name: 'create tenant',
        member: 403,
        admin: 201,
        owner: 201,
        run: (h: Record<string, string>) =>
          api('/v1/tenants', {
            method: 'POST',
            headers: { ...h, 'buzzkit-workspace': workspace.slug },
            body: JSON.stringify({ name: 'T', slug: `cust-${uniq()}` }),
          }),
      },
      {
        name: 'create invite',
        member: 403,
        admin: 201,
        owner: 201,
        run: (h: Record<string, string>) =>
          api(`/v1/workspaces/${workspace.slug}/invites`, {
            method: 'POST',
            headers: h,
            body: JSON.stringify({ email: `inv-${uniq()}@buzzkit.dev` }),
          }),
      },
      {
        name: 'list invites',
        member: 403,
        admin: 200,
        owner: 200,
        run: (h: Record<string, string>) => api(`/v1/workspaces/${workspace.slug}/invites`, { headers: h }),
      },
      {
        name: 'create key',
        member: 403,
        admin: 201,
        owner: 201,
        run: (h: Record<string, string>) =>
          api(`/v1/workspaces/${workspace.slug}/keys`, {
            method: 'POST',
            headers: h,
            body: JSON.stringify({ name: `k-${uniq()}`, scopes: ['tenants:read'] }),
          }),
      },
    ] as const;

    for (const attempt of attempts) {
      const asMember = await attempt.run(member.bearer);
      expect(asMember.status, `member: ${attempt.name}`).toBe(attempt.member);

      const asAdmin = await attempt.run(admin.bearer);
      expect(asAdmin.status, `admin: ${attempt.name}`).toBe(attempt.admin);

      const asOwner = await attempt.run(ownerBearer);
      expect(asOwner.status, `owner: ${attempt.name}`).toBe(attempt.owner);
    }

    // workspace:delete is owner-only — checked last so the matrix above runs
    // against an intact workspace
    const adminDelete = await api(`/v1/workspaces/${workspace.slug}`, {
      method: 'DELETE',
      headers: admin.bearer,
    });
    expect(adminDelete.status).toBe(403);

    const ownerDelete = await api(`/v1/workspaces/${workspace.slug}`, {
      method: 'DELETE',
      headers: ownerBearer,
    });
    expect(ownerDelete.status).toBe(200);
  });

  it('ownership is owner-only: admins can neither grant nor revoke it', async () => {
    const { owner, workspace, ownerBearer } = await setupWorkspace();
    const admin = await addMember(owner.token, workspace.slug, 'admin');
    const member = await addMember(owner.token, workspace.slug, 'member');

    const ownerMembers = await api<Array<{ id: string; role: string }>>(
      `/v1/workspaces/${workspace.slug}/members`,
      { headers: ownerBearer }
    );
    const ownerMember = ownerMembers.body.data?.find((m) => m.role === 'owner');

    // Admin escalating a member (or themselves) to owner
    const escalate = await api(`/v1/workspaces/${workspace.slug}/members/${member.memberId}`, {
      method: 'PATCH',
      headers: admin.bearer,
      body: JSON.stringify({ role: 'owner' }),
    });
    expect(escalate.status).toBe(403);

    // Admin demoting or removing an owner
    const demote = await api(`/v1/workspaces/${workspace.slug}/members/${ownerMember?.id}`, {
      method: 'PATCH',
      headers: admin.bearer,
      body: JSON.stringify({ role: 'member' }),
    });
    expect(demote.status).toBe(403);

    const remove = await api(`/v1/workspaces/${workspace.slug}/members/${ownerMember?.id}`, {
      method: 'DELETE',
      headers: admin.bearer,
    });
    expect(remove.status).toBe(403);

    // The owner CAN grant ownership
    const promote = await api(`/v1/workspaces/${workspace.slug}/members/${member.memberId}`, {
      method: 'PATCH',
      headers: ownerBearer,
      body: JSON.stringify({ role: 'owner' }),
    });
    expect(promote.status).toBe(200);
  });
});

describe('id handling', () => {
  it('rejects ids carrying a known-but-wrong entity prefix', async () => {
    const { keyBearer, workspace, ownerBearer } = await setupWorkspace();
    const tenant = await createTenant(keyBearer);

    // A tenant id can never resolve at a members endpoint
    const { status } = await api(`/v1/workspaces/${workspace.slug}/members/${tenant.id}`, {
      method: 'PATCH',
      headers: ownerBearer,
      body: JSON.stringify({ role: 'admin' }),
    });

    expect(status).toBe(400);
  });
});
