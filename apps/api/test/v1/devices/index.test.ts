import { describe, expect, it } from 'vitest';
import { api } from '../../utils/api';
import { createTenant, setupWorkspace, uniq } from '../../utils/setup';

function fakeToken() {
  return `tok-${uniq()}${'a'.repeat(48)}`;
}

async function register(headers: Record<string, string>, input: Partial<Record<string, unknown>> = {}) {
  return api<{ id: string; subscriberId: string; externalId: string; status: string; platform: string }>(
    '/v1/devices',
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        externalId: `user_${uniq()}`,
        platform: 'ios',
        token: fakeToken(),
        ...input,
      }),
    }
  );
}

describe('POST /v1/devices', () => {
  it('registers a device (201) and creates the subscriber implicitly', async () => {
    const { keyBearer } = await setupWorkspace();
    const externalId = `user_${uniq()}`;

    const { status, body } = await register(keyBearer, { externalId });

    expect(status).toBe(201);
    expect(body.data?.id).toMatch(/^dev_/);
    expect(body.data?.subscriberId).toMatch(/^sub_/);
    expect(body.data?.externalId).toBe(externalId);
    expect(body.data?.status).toBe('active');

    const subscriber = await api(`/v1/subscribers/${externalId}`, { headers: keyBearer });
    expect(subscriber.status).toBe(200);
  });

  it('re-registering the same token is idempotent (200) and moves it between subscribers', async () => {
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
    expect(moved.body.data?.id).toBe(first.body.data?.id);
    expect(moved.body.data?.externalId).toBe(movedTo);

    const oldOwner = await api<{ devices: unknown[] }>(`/v1/subscribers/${first.body.data?.externalId}`, {
      headers: keyBearer,
    });
    expect(oldOwner.body.data?.devices).toHaveLength(0);
  });

  it('rejects unknown platforms and short tokens', async () => {
    const { keyBearer } = await setupWorkspace();

    const platform = await register(keyBearer, { platform: 'windows' });
    expect(platform.status).toBe(400);

    const token = await register(keyBearer, { token: 'short' });
    expect(token.status).toBe(400);
  });

  it('the same token can exist in different tenants independently', async () => {
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

describe('DELETE /v1/devices/:id', () => {
  it('removes a device and frees its token for re-registration', async () => {
    const { keyBearer } = await setupWorkspace();
    const token = fakeToken();

    const registered = await register(keyBearer, { token });

    const del = await api(`/v1/devices/${registered.body.data?.id}`, {
      method: 'DELETE',
      headers: keyBearer,
    });
    expect(del.status).toBe(200);

    const again = await register(keyBearer, { token });
    expect(again.status).toBe(201);
    expect(again.body.data?.id).not.toBe(registered.body.data?.id);
  });

  it("cannot remove another tenant's device", async () => {
    const { keyBearer } = await setupWorkspace();
    const tenant = await createTenant(keyBearer);
    const registered = await register(keyBearer, {});

    const { status } = await api(`/v1/devices/${registered.body.data?.id}`, {
      method: 'DELETE',
      headers: { ...keyBearer, 'buzzkit-tenant': tenant.slug },
    });

    expect(status).toBe(404);
  });
});
