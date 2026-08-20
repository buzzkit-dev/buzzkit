import { describe, expect, it } from 'vitest';
import { api } from '../../utils/api';
import { createTenant, setupWorkspace, uniq } from '../../utils/setup';

function fakeToken() {
  return `tok-${uniq()}${'a'.repeat(48)}`;
}

type SubscriptionBody = {
  id: string;
  subscriberId: string;
  externalId: string;
  channel: string;
  platform: string | null;
  endpoint: string;
  enabled: boolean;
  status: string;
};

async function register(headers: Record<string, string>, input: Partial<Record<string, unknown>> = {}) {
  return api<SubscriptionBody>('/v1/subscriptions', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      externalId: `user_${uniq()}`,
      channel: 'push',
      platform: 'ios',
      token: fakeToken(),
      ...input,
    }),
  });
}

describe('POST /v1/subscriptions', () => {
  it('registers a push subscription (201) and creates the subscriber implicitly', async () => {
    const { keyBearer } = await setupWorkspace();
    const externalId = `user_${uniq()}`;

    const { status, body } = await register(keyBearer, { externalId });

    expect(status).toBe(201);
    expect(body.data?.id).toMatch(/^sbn_/);
    expect(body.data?.subscriberId).toMatch(/^sub_/);
    expect(body.data?.externalId).toBe(externalId);
    expect(body.data?.channel).toBe('push');
    expect(body.data?.enabled).toBe(true);
    expect(body.data?.status).toBe('active');

    const subscriber = await api(`/v1/subscribers/${externalId}`, { headers: keyBearer });
    expect(subscriber.status).toBe(200);
  });

  it('registers an email subscription — same subscriber, second channel', async () => {
    const { keyBearer } = await setupWorkspace();
    const externalId = `user_${uniq()}`;

    await register(keyBearer, { externalId });
    const email = await register(keyBearer, {
      externalId,
      channel: 'email',
      platform: undefined,
      token: undefined,
      address: `jane-${uniq()}@acme.com`,
    });
    expect(email.status).toBe(201);
    expect(email.body.data?.channel).toBe('email');
    expect(email.body.data?.platform).toBeNull();

    const detail = await api<{ subscriptions: Array<{ channel: string }> }>(`/v1/subscribers/${externalId}`, {
      headers: keyBearer,
    });
    expect(detail.body.data?.subscriptions).toHaveLength(2);
    expect(detail.body.data?.subscriptions.map((s) => s.channel).sort()).toEqual(['email', 'push']);
  });

  it('re-registering the same endpoint is idempotent (200) and moves it between subscribers', async () => {
    const { keyBearer } = await setupWorkspace();
    const token = fakeToken();

    const first = await register(keyBearer, { token, externalId: `user_a_${uniq()}` });
    expect(first.status).toBe(201);

    const refreshed = await register(keyBearer, { token, externalId: first.body.data?.externalId });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.data?.id).toBe(first.body.data?.id);

    const movedTo = `user_b_${uniq()}`;
    const moved = await register(keyBearer, { token, externalId: movedTo });
    expect(moved.status).toBe(200);
    expect(moved.body.data?.externalId).toBe(movedTo);
  });

  it('validates channel-shaped input', async () => {
    const { keyBearer } = await setupWorkspace();

    const noToken = await register(keyBearer, { token: undefined });
    expect(noToken.status).toBe(400);

    const noPlatform = await register(keyBearer, { platform: undefined });
    expect(noPlatform.status).toBe(400);

    const badAddress = await register(keyBearer, {
      channel: 'email',
      token: undefined,
      platform: undefined,
      address: 'not-an-email',
    });
    expect(badAddress.status).toBe(400);

    const badPlatform = await register(keyBearer, { platform: 'windows' });
    expect(badPlatform.status).toBe(400);
  });

  it('infers the channel from the endpoint shape and bounds token length', async () => {
    const { keyBearer } = await setupWorkspace();

    const inferredPush = await register(keyBearer, { channel: undefined });
    expect(inferredPush.status).toBe(201);
    expect(inferredPush.body.data?.channel).toBe('push');

    const inferredEmail = await register(keyBearer, {
      channel: undefined,
      platform: undefined,
      token: undefined,
      address: `infer-${uniq()}@acme.com`,
    });
    expect(inferredEmail.status).toBe(201);
    expect(inferredEmail.body.data?.channel).toBe('email');

    const tooLong = await register(keyBearer, { token: 'x'.repeat(4097) });
    expect(tooLong.status).toBe(400);
  });

  it('audits mute and removal', async () => {
    const { keyBearer, ownerBearer, workspace } = await setupWorkspace();
    const registered = await register(keyBearer, {});

    await api(`/v1/subscriptions/${registered.body.data?.id}`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ enabled: false }),
    });
    await api(`/v1/subscriptions/${registered.body.data?.id}`, { method: 'DELETE', headers: keyBearer });

    const events = await api<{
      items: Array<{ event: string; targetId: string; data: { enabled?: boolean } }>;
    }>(`/v1/workspaces/${workspace.slug}/events`, { headers: ownerBearer });
    const mine = events.body.data?.items.filter((i) => i.targetId === registered.body.data?.id) ?? [];
    expect(mine.map((i) => i.event).sort()).toEqual([
      'subscription.created',
      'subscription.removed',
      'subscription.updated',
    ]);
    expect(mine.find((i) => i.event === 'subscription.updated')?.data.enabled).toBe(false);
  });

  it('the same endpoint can exist in different tenants independently', async () => {
    const { keyBearer } = await setupWorkspace();
    const tenant = await createTenant(keyBearer);
    const token = fakeToken();

    const inDefault = await register(keyBearer, { token });
    const inTenant = await register({ ...keyBearer, 'buzzkit-tenant': tenant.slug }, { token });

    expect(inDefault.status).toBe(201);
    expect(inTenant.status).toBe(201);
    expect(inDefault.body.data?.id).not.toBe(inTenant.body.data?.id);
  });
});

describe('PATCH /v1/subscriptions/:id — per-subscription control', () => {
  it('disables one device while the others keep receiving (the work-iPhone case)', async () => {
    const { keyBearer } = await setupWorkspace();
    const externalId = `user_${uniq()}`;

    const android = await register(keyBearer, { externalId, platform: 'android' });
    const workIphone = await register(keyBearer, { externalId, platform: 'ios' });

    const muted = await api<SubscriptionBody>(`/v1/subscriptions/${workIphone.body.data?.id}`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ enabled: false }),
    });
    expect(muted.status).toBe(200);
    expect(muted.body.data?.enabled).toBe(false);

    const detail = await api<{ subscriptions: Array<{ id: string; enabled: boolean }> }>(
      `/v1/subscribers/${externalId}`,
      { headers: keyBearer }
    );
    const byId = new Map(detail.body.data?.subscriptions.map((s) => [s.id, s.enabled]));
    expect(byId.get(android.body.data?.id ?? '')).toBe(true);
    expect(byId.get(workIphone.body.data?.id ?? '')).toBe(false);

    const reregistered = await register(keyBearer, {
      externalId,
      token: workIphone.body.data?.endpoint,
    });
    expect(reregistered.body.data?.enabled).toBe(false);
  });
});

describe('subscription ids, listing, and ledger', () => {
  it('rejects malformed and wrong-entity ids', async () => {
    const { keyBearer } = await setupWorkspace();
    const tenant = await createTenant(keyBearer);

    const malformed = await api('/v1/subscriptions/nope!', {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ enabled: false }),
    });
    expect(malformed.status).toBe(400);

    const wrongEntity = await api(`/v1/subscriptions/${tenant.id}`, { method: 'DELETE', headers: keyBearer });
    expect(wrongEntity.status).toBe(400);

    const badBody = await api('/v1/subscriptions/nope!', {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ enabled: 'yes' }),
    });
    expect(badBody.status).toBe(400);
  });

  it('lists a subscriber’s subscriptions and re-enables after a mute', async () => {
    const { keyBearer } = await setupWorkspace();
    const externalId = `user_${uniq()}`;
    const registered = await register(keyBearer, { externalId });

    await api(`/v1/subscriptions/${registered.body.data?.id}`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ enabled: false }),
    });
    const reenabled = await api<{ enabled: boolean }>(`/v1/subscriptions/${registered.body.data?.id}`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ enabled: true }),
    });
    expect(reenabled.body.data?.enabled).toBe(true);

    const list = await api<Array<{ id: string; enabled: boolean }>>(
      `/v1/subscribers/${externalId}/subscriptions`,
      { headers: keyBearer }
    );
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data?.[0]).toMatchObject({ id: registered.body.data?.id, enabled: true });
  });

  it('an email endpoint moves between subscribers like a push token', async () => {
    const { keyBearer } = await setupWorkspace();
    const address = `shared-${uniq()}@acme.com`;
    const emailInput = { channel: 'email', platform: undefined, token: undefined, address };

    const first = await register(keyBearer, { ...emailInput, externalId: `user_a_${uniq()}` });
    expect(first.status).toBe(201);

    const movedTo = `user_b_${uniq()}`;
    const moved = await register(keyBearer, { ...emailInput, externalId: movedTo });
    expect(moved.status).toBe(200);
    expect(moved.body.data?.id).toBe(first.body.data?.id);
    expect(moved.body.data?.externalId).toBe(movedTo);
  });

  it('logs subscription.created once per endpoint, not per refresh', async () => {
    const { keyBearer, ownerBearer, workspace } = await setupWorkspace();
    const token = fakeToken();
    const externalId = `user_${uniq()}`;

    await register(keyBearer, { externalId, token });
    await register(keyBearer, { externalId, token });
    await register(keyBearer, { externalId, token });

    const events = await api<{ items: Array<{ event: string; data: { externalId: string } }> }>(
      `/v1/workspaces/${workspace.slug}/events?event=subscription.created`,
      { headers: ownerBearer }
    );
    const mine = events.body.data?.items.filter((item) => item.data.externalId === externalId);
    expect(mine).toHaveLength(1);
  });
});

describe('DELETE /v1/subscriptions/:id', () => {
  it('removes a subscription and frees its endpoint', async () => {
    const { keyBearer } = await setupWorkspace();
    const token = fakeToken();

    const registered = await register(keyBearer, { token });

    const del = await api(`/v1/subscriptions/${registered.body.data?.id}`, {
      method: 'DELETE',
      headers: keyBearer,
    });
    expect(del.status).toBe(200);

    const again = await register(keyBearer, { token });
    expect(again.status).toBe(201);
    expect(again.body.data?.id).not.toBe(registered.body.data?.id);
  });

  it("cannot touch another tenant's subscription", async () => {
    const { keyBearer } = await setupWorkspace();
    const tenant = await createTenant(keyBearer);
    const registered = await register(keyBearer, {});

    const foreign = { ...keyBearer, 'buzzkit-tenant': tenant.slug };

    const patch = await api(`/v1/subscriptions/${registered.body.data?.id}`, {
      method: 'PATCH',
      headers: foreign,
      body: JSON.stringify({ enabled: false }),
    });
    expect(patch.status).toBe(404);

    const del = await api(`/v1/subscriptions/${registered.body.data?.id}`, {
      method: 'DELETE',
      headers: foreign,
    });
    expect(del.status).toBe(404);
  });
});
