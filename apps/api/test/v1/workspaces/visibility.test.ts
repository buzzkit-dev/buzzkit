import { describe, expect, it } from 'vitest';
import { api, BASE_URL } from '../../utils/api';
import { grantAdmin } from '../../utils/db';
import { addMember, setupWorkspace, signUpUser, uniq } from '../../utils/setup';

const ADMIN_KEY = /"admin":/;

function bodyText(body: unknown): string {
  return JSON.stringify(body);
}

describe('the admin flag never reaches a customer', () => {
  it('no customer-facing response carries the key, even when an admin is a member of the workspace', async () => {
    const { workspace, owner, ownerBearer } = await setupWorkspace({ bare: true });
    const member = await signUpUser('Member');
    await grantAdmin(member.email);
    const invite = await api<{ token: string }>(`/v1/workspaces/${workspace.slug}/invites`, {
      method: 'POST',
      headers: ownerBearer,
      body: JSON.stringify({ email: member.email, role: 'member' }),
    });
    const preview = await api(`/v1/invites/${invite.body.data?.token}`);
    expect(bodyText(preview.body)).not.toMatch(ADMIN_KEY);
    await api(`/v1/invites/${invite.body.data?.token}/accept`, { method: 'POST', headers: member.bearer });

    const surfaces = await Promise.all([
      api('/v1/profile', { headers: ownerBearer }),
      api('/v1/workspaces', { headers: ownerBearer }),
      api(`/v1/workspaces/${workspace.slug}`, { headers: ownerBearer }),
      api(`/v1/workspaces/${workspace.slug}/members`, { headers: ownerBearer }),
      api(`/v1/workspaces/${workspace.slug}/members`, { headers: member.bearer }),
      api(`/v1/workspaces/${workspace.slug}/invites`, { headers: ownerBearer }),
      api(`/v1/workspaces/${workspace.slug}/audit`, { headers: ownerBearer }),
      api(`/v1/workspaces/${workspace.slug}/keys`, { headers: ownerBearer }),
    ]);
    for (const surface of surfaces) {
      expect(surface.status).toBe(200);
      expect(bodyText(surface.body)).not.toMatch(ADMIN_KEY);
    }
    expect(owner.email).not.toBe(member.email);
  });

  it('the admin key never appears in any response, not even to the admin, who simply reads as an owner', async () => {
    const plain = await setupWorkspace({ bare: true });
    const support = await signUpUser('Support');
    await grantAdmin(support.email);

    const plainProfile = await api<Record<string, unknown>>('/v1/profile', { headers: plain.ownerBearer });
    expect(plainProfile.body.data).not.toHaveProperty('admin');
    const plainList = await api<{ items: Record<string, unknown>[] }>('/v1/workspaces', {
      headers: plain.ownerBearer,
    });
    expect(plainList.body.data?.items[0]).not.toHaveProperty('admin');
    const plainWorkspace = await api<Record<string, unknown>>(`/v1/workspaces/${plain.workspace.slug}`, {
      headers: plain.ownerBearer,
    });
    expect(plainWorkspace.body.data).not.toHaveProperty('admin');

    const adminProfile = await api<Record<string, unknown>>('/v1/profile', { headers: support.bearer });
    expect(adminProfile.body.data).not.toHaveProperty('admin');
    const session = await fetch(`${BASE_URL}/v1/auth/get-session`, { headers: support.bearer });
    expect(await session.text()).not.toMatch(ADMIN_KEY);
    const foreign = await api<{ role: string | null }>(`/v1/workspaces/${plain.workspace.slug}`, {
      headers: support.bearer,
    });
    expect(foreign.body.data).toMatchObject({ role: 'owner' });
    expect(foreign.body.data).not.toHaveProperty('admin');
  });

  it('nobody can grant themselves: sign-up, profile updates and the auth update endpoint all ignore the flag', async () => {
    const email = `escalate-${uniq()}@buzzkit.dev`;
    const signup = await fetch(`${BASE_URL}/v1/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Escalator', email, password: `Bk-${crypto.randomUUID()}`, admin: true }),
    });
    const token = signup.headers.get('set-auth-token');
    expect(token).toBeTruthy();
    const bearer = { Authorization: `Bearer ${token}` };

    await api('/v1/profile', {
      method: 'PATCH',
      headers: bearer,
      body: JSON.stringify({ name: 'Still plain', admin: true }),
    });
    await fetch(`${BASE_URL}/v1/auth/update-user`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...bearer },
      body: JSON.stringify({ admin: true }),
    });

    const profile = await api<Record<string, unknown>>('/v1/profile', { headers: bearer });
    expect(profile.body.data).not.toHaveProperty('admin');
    const everything = await api('/v1/admin/workspaces', { headers: bearer });
    expect(everything.status).toBe(403);
    const { workspace } = await setupWorkspace({ bare: true });
    expect((await api(`/v1/workspaces/${workspace.slug}`, { headers: bearer })).status).toBe(404);
  });

  it('a member listing is identical whether or not one of the members is an admin', async () => {
    const { workspace, owner, ownerBearer } = await setupWorkspace({ bare: true });
    const member = await addMember(owner.token, workspace.slug, 'member');

    const before = await api(`/v1/workspaces/${workspace.slug}/members`, { headers: ownerBearer });
    await grantAdmin(member.email);
    const after = await api(`/v1/workspaces/${workspace.slug}/members`, { headers: ownerBearer });

    expect(after.body.data).toEqual(before.body.data);
  });
});

describe('every remaining surface that carries a user object', () => {
  it('sign-in, sessions, invite acceptance, a single member, and error envelopes all stay clean for an admin', async () => {
    const { workspace, ownerBearer } = await setupWorkspace({ bare: true });
    const email = `admin-${uniq()}@buzzkit.dev`;
    const password = `Bk-${crypto.randomUUID()}`;
    await fetch(`${BASE_URL}/v1/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Admin', email, password }),
    });
    await grantAdmin(email);

    const signIn = await fetch(`${BASE_URL}/v1/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const bearer = { Authorization: `Bearer ${signIn.headers.get('set-auth-token')}` };
    expect(await signIn.text()).not.toMatch(ADMIN_KEY);

    const sessions = await fetch(`${BASE_URL}/v1/auth/list-sessions`, { headers: bearer });
    expect(await sessions.text()).not.toMatch(ADMIN_KEY);

    const invite = await api<{ token: string }>(`/v1/workspaces/${workspace.slug}/invites`, {
      method: 'POST',
      headers: ownerBearer,
      body: JSON.stringify({ email, role: 'admin' }),
    });
    const accepted = await api<{ id: string }>(`/v1/invites/${invite.body.data?.token}/accept`, {
      method: 'POST',
      headers: bearer,
    });
    expect(accepted.status).toBe(201);
    expect(bodyText(accepted.body)).not.toMatch(ADMIN_KEY);

    const single = await api(`/v1/workspaces/${workspace.slug}/members/${accepted.body.data?.id}`, {
      headers: ownerBearer,
    });
    expect(single.status).toBe(200);
    expect(bodyText(single.body)).not.toMatch(ADMIN_KEY);

    const forbidden = await api('/v1/admin/workspaces', { headers: ownerBearer });
    expect(forbidden.status).toBe(403);
    expect(bodyText(forbidden.body)).not.toMatch(ADMIN_KEY);
    const missing = await api('/v1/workspaces/does-not-exist', { headers: bearer });
    expect(missing.status).toBe(404);
    expect(bodyText(missing.body)).not.toMatch(ADMIN_KEY);
  });

  it("the audit log's search cannot be used to guess an admin's email", async () => {
    const { workspace, ownerBearer } = await setupWorkspace({ bare: true });
    const support = await signUpUser('Support');
    await grantAdmin(support.email);
    await api(`/v1/workspaces/${workspace.slug}`, {
      method: 'PATCH',
      headers: support.bearer,
      body: JSON.stringify({ name: 'Touched by support' }),
    });

    const byEmail = await api<{ items: unknown[]; total?: number }>(
      `/v1/workspaces/${workspace.slug}/audit?q=${encodeURIComponent(support.email)}`,
      { headers: ownerBearer }
    );
    expect(byEmail.body.data?.items).toEqual([]);
    expect(byEmail.body.data?.total).toBe(0);

    const byLabel = await api<{ items: Array<{ event: string; actorDisplay: string }> }>(
      `/v1/workspaces/${workspace.slug}/audit?q=support`,
      { headers: ownerBearer }
    );
    expect(byLabel.body.data?.items.map((entry) => entry.event)).toEqual(['workspace.updated']);
    expect(byLabel.body.data?.items[0]?.actorDisplay).toBe('BuzzKit Support');

    const byActor = await api<{ items: Array<{ actorDisplay: string }> }>(
      `/v1/workspaces/${workspace.slug}/audit?actorType=admin`,
      { headers: ownerBearer }
    );
    expect(byActor.body.data?.items.every((entry) => entry.actorDisplay === 'BuzzKit Support')).toBe(true);
    expect(bodyText(byActor.body)).not.toContain(support.email);
  });
});
