import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { api } from '../../utils/api';
import { createClientKey, createTenant, setupWorkspace, uniq } from '../../utils/setup';

function fakeToken() {
  return `tok-${uniq()}${'c'.repeat(48)}`;
}

async function setupClient() {
  const base = await setupWorkspace();
  const clientKey = await createClientKey(base.owner.token, base.workspace.slug, 'default');
  return { ...base, clientKey, clientBearer: { Authorization: `Bearer ${clientKey.secret}` } };
}

describe('client keys', () => {
  it('mints with bk_pk_ prefix, requires a tenant, refuses scopes, and lists its token', async () => {
    const { owner, workspace, ownerBearer } = await setupWorkspace();

    const key = await createClientKey(owner.token, workspace.slug, 'default');
    expect(key.secret).toMatch(/^bk_pk_/);

    const noTenant = await api(`/v1/workspaces/${workspace.slug}/keys`, {
      method: 'POST',
      headers: ownerBearer,
      body: JSON.stringify({ name: 'bad', kind: 'client' }),
    });
    expect(noTenant.status).toBe(404);

    const withScopes = await api(`/v1/workspaces/${workspace.slug}/keys`, {
      method: 'POST',
      headers: ownerBearer,
      body: JSON.stringify({ name: 'bad', kind: 'client', tenant: 'default', scopes: ['*'] }),
    });
    expect(withScopes.status).toBe(400);

    const list = await api<Array<{ kind: string; token?: string }>>(`/v1/workspaces/${workspace.slug}/keys`, {
      headers: ownerBearer,
    });
    const clientRow = list.body.data?.find((row) => row.kind === 'client');
    expect(clientRow?.token).toMatch(/^bk_pk_/);
  });

  it('client keys work ONLY on /v1/client/* — everything else refuses them', async () => {
    const { clientBearer, workspace } = await setupClient();

    for (const attempt of [
      { path: '/v1/tenants', method: 'GET' },
      { path: '/v1/credentials', method: 'GET' },
      { path: '/v1/subscribers', method: 'GET' },
      { path: `/v1/workspaces/${workspace.slug}`, method: 'GET' },
      { path: '/v1/profile', method: 'GET' },
    ]) {
      const { status } = await api(attempt.path, { method: attempt.method, headers: clientBearer });
      expect(status, `client key at ${attempt.path}`).toBe(401);
    }
  });

  it('secret keys and sessions are refused on client routes', async () => {
    const { keyBearer, ownerBearer } = await setupWorkspace();

    const viaWorkspaceKey = await api('/v1/client/identify', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ externalId: 'user_1' }),
    });
    expect(viaWorkspaceKey.status).toBe(401);

    const viaSession = await api('/v1/client/identify', {
      method: 'POST',
      headers: ownerBearer,
      body: JSON.stringify({ externalId: 'user_1' }),
    });
    expect(viaSession.status).toBe(401);
  });

  it('a revoked client key dies immediately', async () => {
    const { clientKey, clientBearer, workspace, ownerBearer } = await setupClient();

    const before = await api('/v1/client/identify', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({ externalId: `user_${uniq()}` }),
    });
    expect(before.status).toBe(201);

    await api(`/v1/workspaces/${workspace.slug}/keys/${clientKey.id}`, {
      method: 'DELETE',
      headers: ownerBearer,
    });

    const after = await api('/v1/client/identify', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({ externalId: `user_${uniq()}` }),
    });
    expect(after.status).toBe(401);
  });
});

describe('client key boundaries', () => {
  it('refuses a buzzkit-tenant header naming another tenant, accepts its own', async () => {
    const { clientBearer, keyBearer } = await setupClient();
    const other = await createTenant(keyBearer);

    const own = await api('/v1/client/identify', {
      method: 'POST',
      headers: { ...clientBearer, 'buzzkit-tenant': 'default' },
      body: JSON.stringify({ externalId: `user_${uniq()}` }),
    });
    expect(own.status).toBe(201);

    const foreign = await api('/v1/client/identify', {
      method: 'POST',
      headers: { ...clientBearer, 'buzzkit-tenant': other.slug },
      body: JSON.stringify({ externalId: `user_${uniq()}` }),
    });
    expect(foreign.status).toBe(403);
  });

  it('dies when its tenant is deleted', async () => {
    const { owner, workspace, keyBearer } = await setupWorkspace();
    const tenant = await createTenant(keyBearer);
    const clientKey = await createClientKey(owner.token, workspace.slug, tenant.slug);
    const bearer = { Authorization: `Bearer ${clientKey.secret}` };

    const before = await api('/v1/client/identify', {
      method: 'POST',
      headers: bearer,
      body: JSON.stringify({ externalId: `user_${uniq()}` }),
    });
    expect(before.status).toBe(201);

    await api(`/v1/tenants/${tenant.slug}`, { method: 'DELETE', headers: keyBearer });

    const after = await api('/v1/client/identify', {
      method: 'POST',
      headers: bearer,
      body: JSON.stringify({ externalId: `user_${uniq()}` }),
    });
    expect(after.status).toBe(401);
  });

  it("cannot mute or remove another tenant's subscription even with the same token", async () => {
    const { owner, workspace, keyBearer } = await setupWorkspace();
    const tenant = await createTenant(keyBearer);
    const otherClientKey = await createClientKey(owner.token, workspace.slug, tenant.slug);
    const token = fakeToken();

    await api('/v1/subscriptions', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ externalId: `user_${uniq()}`, channel: 'push', platform: 'ios', token }),
    });

    const otherBearer = { Authorization: `Bearer ${otherClientKey.secret}` };
    const mute = await api('/v1/client/subscriptions', {
      method: 'PATCH',
      headers: otherBearer,
      body: JSON.stringify({ channel: 'push', platform: 'ios', token, enabled: false }),
    });
    expect(mute.status).toBe(404);

    const remove = await api('/v1/client/subscriptions', {
      method: 'DELETE',
      headers: otherBearer,
      body: JSON.stringify({ channel: 'push', platform: 'ios', token }),
    });
    expect(remove.status).toBe(404);
  });
});

describe('client registration flow', () => {
  it('identify with email creates an email subscription; the app can register email directly too', async () => {
    const { clientBearer, keyBearer } = await setupClient();
    const externalId = `user_${uniq()}`;
    const address = `jane-${uniq()}@acme.com`;

    const identified = await api('/v1/client/identify', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({ externalId, email: address }),
    });
    expect(identified.status).toBe(201);

    const second = `second-${uniq()}@acme.com`;
    const direct = await api<{ channel: string; endpoint: string }>('/v1/client/subscriptions', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({ externalId, channel: 'email', address: second }),
    });
    expect(direct.status).toBe(201);
    expect(direct.body.data?.channel).toBe('email');

    const view = await api<{ subscriptions: Array<{ channel: string; endpoint: string }> }>(
      `/v1/subscribers/${externalId}`,
      { headers: keyBearer }
    );
    const emails = view.body.data?.subscriptions.filter((s) => s.channel === 'email').map((s) => s.endpoint);
    expect(emails?.sort()).toEqual([address, second].sort());
  });

  it('404s on unknown subscriptions, subscribers, and topics', async () => {
    const { clientBearer, keyBearer } = await setupClient();

    const unknownMute = await api('/v1/client/subscriptions', {
      method: 'PATCH',
      headers: clientBearer,
      body: JSON.stringify({ channel: 'push', platform: 'ios', token: fakeToken(), enabled: false }),
    });
    expect(unknownMute.status).toBe(404);

    const unknownDelete = await api('/v1/client/subscriptions', {
      method: 'DELETE',
      headers: clientBearer,
      body: JSON.stringify({ channel: 'push', platform: 'ios', token: fakeToken() }),
    });
    expect(unknownDelete.status).toBe(404);

    const unknownSubscriber = await api('/v1/client/preferences', {
      headers: { ...clientBearer, 'buzzkit-subscriber': `ghost_${uniq()}` },
    });
    expect(unknownSubscriber.status).toBe(404);

    const externalId = `user_${uniq()}`;
    await api('/v1/client/identify', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({ externalId }),
    });
    const unknownTopic = await api('/v1/client/preferences', {
      method: 'PATCH',
      headers: { ...clientBearer, 'buzzkit-subscriber': externalId },
      body: JSON.stringify({ preferences: { 'no-such-topic': false } }),
    });
    expect(unknownTopic.status).toBe(404);
    void keyBearer;
  });

  it('records client actions in the ledger as the subscriber (actor type user)', async () => {
    const { clientBearer, ownerBearer, workspace } = await setupClient();
    const externalId = `user_${uniq()}`;

    await api('/v1/client/subscriptions', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({ externalId, channel: 'push', platform: 'ios', token: fakeToken() }),
    });

    const events = await api<{ items: Array<{ event: string; actorType: string; actorDisplay: string }> }>(
      `/v1/workspaces/${workspace.slug}/events?event=subscription.created`,
      { headers: ownerBearer }
    );
    const created = events.body.data?.items.find((item) => item.actorDisplay === externalId);
    expect(created?.actorType).toBe('user');
  });

  it('the app registers, mutes, and unregisters its own subscription', async () => {
    const { clientBearer, keyBearer } = await setupClient();
    const externalId = `user_${uniq()}`;
    const token = fakeToken();

    const registered = await api<{ id: string; externalId: string }>('/v1/client/subscriptions', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({ externalId, channel: 'push', platform: 'ios', token }),
    });
    expect(registered.status).toBe(201);
    expect(registered.body.data?.externalId).toBe(externalId);

    const serverView = await api<{ subscriptions: unknown[] }>(`/v1/subscribers/${externalId}`, {
      headers: keyBearer,
    });
    expect(serverView.status).toBe(200);
    expect(serverView.body.data?.subscriptions).toHaveLength(1);

    const muted = await api<{ enabled: boolean }>('/v1/client/subscriptions', {
      method: 'PATCH',
      headers: clientBearer,
      body: JSON.stringify({ channel: 'push', platform: 'ios', token, enabled: false }),
    });
    expect(muted.status).toBe(200);
    expect(muted.body.data?.enabled).toBe(false);

    const unregistered = await api('/v1/client/subscriptions', {
      method: 'DELETE',
      headers: clientBearer,
      body: JSON.stringify({ channel: 'push', platform: 'ios', token }),
    });
    expect(unregistered.status).toBe(200);

    const emptied = await api<{ subscriptions: unknown[] }>(`/v1/subscribers/${externalId}`, {
      headers: keyBearer,
    });
    expect(emptied.body.data?.subscriptions).toHaveLength(0);
  });

  it('the app reads and updates its own preferences', async () => {
    const { clientBearer, keyBearer } = await setupClient();
    const gym = `gym-${uniq()}`;
    await api('/v1/topics', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ slug: gym, name: 'Gym reminders' }),
    });

    const externalId = `user_${uniq()}`;
    await api('/v1/client/identify', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({ externalId }),
    });

    const subscriberHeaders = { ...clientBearer, 'buzzkit-subscriber': externalId };

    type Pref = { topic: string; channels: Record<string, { optedIn: boolean }> };

    const before = await api<Pref[]>('/v1/client/preferences', { headers: subscriberHeaders });
    expect(before.status).toBe(200);
    expect(before.body.data?.find((p) => p.topic === gym)?.channels.push.optedIn).toBe(true);

    const patched = await api<Pref[]>('/v1/client/preferences', {
      method: 'PATCH',
      headers: subscriberHeaders,
      body: JSON.stringify({ preferences: { [gym]: { push: false } } }),
    });
    expect(patched.status).toBe(200);
    expect(patched.body.data?.find((p) => p.topic === gym)?.channels.push.optedIn).toBe(false);
    expect(patched.body.data?.find((p) => p.topic === gym)?.channels.email.optedIn).toBe(true);

    const missingHeader = await api('/v1/client/preferences', { headers: clientBearer });
    expect(missingHeader.status).toBe(400);
  });

  it('client keys are tenant-isolated', async () => {
    const { owner, workspace, keyBearer } = await setupWorkspace();
    const tenant = await createTenant(keyBearer);
    const tenantClientKey = await createClientKey(owner.token, workspace.slug, tenant.slug);
    const externalId = `user_${uniq()}`;

    await api('/v1/client/identify', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tenantClientKey.secret}` },
      body: JSON.stringify({ externalId }),
    });

    const inTenant = await api(`/v1/subscribers/${externalId}`, {
      headers: { ...keyBearer, 'buzzkit-tenant': tenant.slug },
    });
    expect(inTenant.status).toBe(200);

    const inDefault = await api(`/v1/subscribers/${externalId}`, { headers: keyBearer });
    expect(inDefault.status).toBe(404);
  });
});

describe('identity verification', () => {
  it('stamps subscribers verified when a valid hash is offered even without enforcement', async () => {
    const { clientBearer, keyBearer } = await setupClient();

    const tenantDetail = await api<{ identitySecret: string }>('/v1/tenants/default', {
      headers: keyBearer,
    });
    const identitySecret = tenantDetail.body.data?.identitySecret ?? '';

    const anonymousId = `anon_${uniq()}`;
    const anonymous = await api<{ verified: boolean }>('/v1/client/identify', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({ externalId: anonymousId }),
    });
    expect(anonymous.status).toBe(201);
    expect(anonymous.body.data?.verified).toBe(false);

    const verifiedId = `user_${uniq()}`;
    const validHash = createHmac('sha256', identitySecret).update(verifiedId).digest('hex');
    const verified = await api<{ verified: boolean }>('/v1/client/identify', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({ externalId: verifiedId, identityHash: validHash }),
    });
    expect(verified.status).toBe(201);
    expect(verified.body.data?.verified).toBe(true);

    const wrongHash = await api('/v1/client/identify', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({ externalId: `user_${uniq()}`, identityHash: 'deadbeef' }),
    });
    expect(wrongHash.status).toBe(401);

    const serverView = await api<{ verified: boolean }>(`/v1/subscribers/${verifiedId}`, {
      headers: keyBearer,
    });
    expect(serverView.body.data?.verified).toBe(true);
  });

  it('when enforced, requires a valid HMAC and blocks spoofing', async () => {
    const { clientBearer, keyBearer, ownerBearer, workspace } = await setupClient();

    const tenantDetail = await api<{ identitySecret: string }>('/v1/tenants/default', {
      headers: keyBearer,
    });
    const identitySecret = tenantDetail.body.data?.identitySecret ?? '';
    expect(identitySecret.length).toBeGreaterThan(0);

    const enable = await api('/v1/tenants/default', {
      method: 'PATCH',
      headers: { ...ownerBearer, 'buzzkit-workspace': workspace.slug },
      body: JSON.stringify({ settings: { identity: { requireVerification: true } } }),
    });
    expect(enable.status).toBe(200);

    const externalId = `user_${uniq()}`;
    const validHash = createHmac('sha256', identitySecret).update(externalId).digest('hex');

    const withoutHash = await api('/v1/client/identify', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({ externalId }),
    });
    expect(withoutHash.status).toBe(401);

    const spoofed = await api('/v1/client/identify', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({ externalId: `victim_${uniq()}`, identityHash: validHash }),
    });
    expect(spoofed.status).toBe(401);

    const legitimate = await api('/v1/client/identify', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({ externalId, identityHash: validHash }),
    });
    expect(legitimate.status).toBe(201);

    const device = await api('/v1/client/subscriptions', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({
        externalId,
        channel: 'push',
        platform: 'ios',
        token: fakeToken(),
        identityHash: validHash,
      }),
    });
    expect(device.status).toBe(201);

    const preferences = await api('/v1/client/preferences', {
      headers: { ...clientBearer, 'buzzkit-subscriber': externalId, 'buzzkit-identity': validHash },
    });
    expect(preferences.status).toBe(200);

    const preferencesSpoofed = await api('/v1/client/preferences', {
      headers: { ...clientBearer, 'buzzkit-subscriber': externalId, 'buzzkit-identity': 'deadbeef' },
    });
    expect(preferencesSpoofed.status).toBe(401);
  });

  it("a hash minted with another tenant's secret is worthless, and enforced preferences need the header", async () => {
    const { clientBearer, keyBearer, ownerBearer, workspace } = await setupClient();
    const other = await setupWorkspace();
    const otherSecret =
      (await api<{ identitySecret: string }>('/v1/tenants/default', { headers: other.keyBearer })).body.data
        ?.identitySecret ?? '';

    await api('/v1/tenants/default', {
      method: 'PATCH',
      headers: { ...ownerBearer, 'buzzkit-workspace': workspace.slug },
      body: JSON.stringify({ settings: { identity: { requireVerification: true } } }),
    });

    const externalId = `user_${uniq()}`;
    const foreignHash = createHmac('sha256', otherSecret).update(externalId).digest('hex');

    const identify = await api('/v1/client/identify', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({ externalId, identityHash: foreignHash }),
    });
    expect(identify.status).toBe(401);

    const missingHeader = await api('/v1/client/preferences', {
      headers: { ...clientBearer, 'buzzkit-subscriber': externalId },
    });
    expect(missingHeader.status).toBe(401);
    void keyBearer;
  });

  it('accepts uppercase hex hashes', async () => {
    const { clientBearer, keyBearer } = await setupClient();
    const tenantDetail = await api<{ identitySecret: string }>('/v1/tenants/default', { headers: keyBearer });
    const externalId = `user_${uniq()}`;
    const upper = createHmac('sha256', tenantDetail.body.data?.identitySecret ?? '')
      .update(externalId)
      .digest('hex')
      .toUpperCase();

    const { status, body } = await api<{ verified: boolean }>('/v1/client/identify', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({ externalId, identityHash: upper }),
    });

    expect(status).toBe(201);
    expect(body.data?.verified).toBe(true);
  });

  it('when not enforced, registration works without a hash', async () => {
    const { clientBearer } = await setupClient();

    const { status } = await api('/v1/client/subscriptions', {
      method: 'POST',
      headers: clientBearer,
      body: JSON.stringify({
        externalId: `user_${uniq()}`,
        channel: 'push',
        platform: 'android',
        token: fakeToken(),
      }),
    });

    expect(status).toBe(201);
  });
});
