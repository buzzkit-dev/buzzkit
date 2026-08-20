import { describe, expect, it } from 'vitest';
import { api } from '../../utils/api';
import { createTenant, setupWorkspace, uniq } from '../../utils/setup';

async function identify(headers: Record<string, string>, externalId: string, attributes?: object) {
  return api<{ id: string; externalId: string; attributes: Record<string, unknown> }>(
    `/v1/subscribers/${encodeURIComponent(externalId)}`,
    {
      method: 'PUT',
      headers,
      body: JSON.stringify(attributes === undefined ? {} : { attributes }),
    }
  );
}

describe('PUT /v1/subscribers/:externalId', () => {
  it('creates on first call (201) and upserts after (200)', async () => {
    const { keyBearer } = await setupWorkspace();
    const externalId = `user_${uniq()}`;

    const first = await identify(keyBearer, externalId, { plan: 'free' });
    expect(first.status).toBe(201);
    expect(first.body.data?.id).toMatch(/^sub_/);
    expect(first.body.data?.id.length).toBeGreaterThanOrEqual(36);
    expect(first.body.data?.externalId).toBe(externalId);
    expect(first.body.data?.attributes).toEqual({ plan: 'free' });

    const second = await identify(keyBearer, externalId, { plan: 'pro' });
    expect(second.status).toBe(200);
    expect(second.body.data?.id).toBe(first.body.data?.id);
    expect(second.body.data?.attributes).toEqual({ plan: 'pro' });
  });

  it('keeps attributes untouched when the body omits them', async () => {
    const { keyBearer } = await setupWorkspace();
    const externalId = `user_${uniq()}`;

    await identify(keyBearer, externalId, { plan: 'free', city: 'berlin' });
    const noop = await identify(keyBearer, externalId);

    expect(noop.status).toBe(200);
    expect(noop.body.data?.attributes).toEqual({ plan: 'free', city: 'berlin' });
  });

  it('stores and updates the email channel endpoint', async () => {
    const { keyBearer } = await setupWorkspace();
    const externalId = `user_${uniq()}`;

    const withEmail = await api<{ email: string | null }>(`/v1/subscribers/${externalId}`, {
      method: 'PUT',
      headers: keyBearer,
      body: JSON.stringify({ email: 'jane@acme.com' }),
    });
    expect(withEmail.status).toBe(201);
    expect(withEmail.body.data?.email).toBe('jane@acme.com');

    const invalid = await api(`/v1/subscribers/${externalId}`, {
      method: 'PUT',
      headers: keyBearer,
      body: JSON.stringify({ email: 'not-an-email' }),
    });
    expect(invalid.status).toBe(400);

    const cleared = await api<{ email: string | null }>(`/v1/subscribers/${externalId}`, {
      method: 'PUT',
      headers: keyBearer,
      body: JSON.stringify({ email: null }),
    });
    expect(cleared.status).toBe(200);
    expect(cleared.body.data?.email).toBeNull();
  });

  it('never sqid-transforms user attributes, even id-looking ones', async () => {
    const { keyBearer } = await setupWorkspace();

    const { body } = await identify(keyBearer, `user_${uniq()}`, { orderId: 12345, nested: { userId: 7 } });

    expect(body.data?.attributes).toEqual({ orderId: 12345, nested: { userId: 7 } });
  });
});

describe('GET /v1/subscribers', () => {
  it('lists with keyset pagination', async () => {
    const { keyBearer } = await setupWorkspace();
    for (let i = 0; i < 3; i++) {
      await identify(keyBearer, `user_${uniq()}`);
    }

    const page1 = await api<{ items: Array<{ id: string }>; hasMore: boolean; nextCursor: string }>(
      '/v1/subscribers?limit=2',
      { headers: keyBearer }
    );
    expect(page1.body.data?.items).toHaveLength(2);
    expect(page1.body.data?.hasMore).toBe(true);

    const page2 = await api<{ items: Array<{ id: string }>; hasMore: boolean }>(
      `/v1/subscribers?limit=2&cursor=${page1.body.data?.nextCursor}`,
      { headers: keyBearer }
    );
    expect(page2.body.data?.items).toHaveLength(1);
    expect(page2.body.data?.hasMore).toBe(false);
  });
});

describe('subscriber lifecycle & isolation', () => {
  it('GET returns the subscriber with devices; DELETE cascades to devices', async () => {
    const { keyBearer } = await setupWorkspace();
    const externalId = `user_${uniq()}`;
    const token = `apns-token-${uniq()}${'0'.repeat(40)}`;

    await api('/v1/devices', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ externalId, platform: 'ios', token }),
    });

    const detail = await api<{ externalId: string; devices: Array<{ id: string; platform: string }> }>(
      `/v1/subscribers/${externalId}`,
      { headers: keyBearer }
    );
    expect(detail.status).toBe(200);
    expect(detail.body.data?.devices).toHaveLength(1);
    expect(detail.body.data?.devices[0]?.id).toMatch(/^dev_/);

    const del = await api(`/v1/subscribers/${externalId}`, { method: 'DELETE', headers: keyBearer });
    expect(del.status).toBe(200);

    const gone = await api(`/v1/subscribers/${externalId}`, { headers: keyBearer });
    expect(gone.status).toBe(404);

    const reregister = await api('/v1/devices', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ externalId, platform: 'ios', token }),
    });
    expect(reregister.status).toBe(201);
  });

  it('scopes subscribers to their tenant — same externalId, different tenants, different subscribers', async () => {
    const { keyBearer } = await setupWorkspace();
    const tenant = await createTenant(keyBearer);
    const externalId = `user_${uniq()}`;

    const inDefault = await identify(keyBearer, externalId);
    const inTenant = await identify({ ...keyBearer, 'buzzkit-tenant': tenant.slug }, externalId);

    expect(inDefault.status).toBe(201);
    expect(inTenant.status).toBe(201);
    expect(inDefault.body.data?.id).not.toBe(inTenant.body.data?.id);

    const foreign = await setupWorkspace();
    const crossWorkspace = await api(`/v1/subscribers/${externalId}`, { headers: foreign.keyBearer });
    expect(crossWorkspace.status).toBe(404);
  });
});
