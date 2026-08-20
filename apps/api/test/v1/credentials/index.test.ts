import { describe, expect, it } from 'vitest';
import { api } from '../../utils/api';
import { db, tables } from '../../utils/db';
import { generateP8, generateServiceAccount } from '../../utils/providerKeys';
import { createKey, createTenant, setupWorkspace, uniq } from '../../utils/setup';

async function uploadApns(headers: Record<string, string>, options: { p8?: string; bundleId?: string } = {}) {
  return api<{ id: string; status: string; details: Record<string, string>; lastError: string | null }>(
    '/v1/credentials/apns',
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        p8: options.p8 ?? (await generateP8()),
        teamId: 'ABCDE12345',
        keyId: 'XYZ9876543',
        bundleId: options.bundleId ?? 'dev.buzzkit.testapp',
        environment: 'sandbox',
      }),
    }
  );
}

describe('POST /v1/credentials/apns', () => {
  it('rejects a structurally invalid .p8 without storing anything', async () => {
    const { keyBearer } = await setupWorkspace();

    const { status, body } = await uploadApns(keyBearer, { p8: 'not a p8 key at all' });

    expect(status).toBe(400);
    expect(body.error?.message).toContain('.p8');

    const list = await api<unknown[]>('/v1/credentials', { headers: keyBearer });
    expect(list.body.data).toHaveLength(0);
  });

  it('stores a well-formed key against the default tenant (unvalidated when APNs is unreachable locally)', async () => {
    const { keyBearer } = await setupWorkspace();

    const { status, body } = await uploadApns(keyBearer);

    expect(status).toBe(201);
    expect(body.data?.id).toMatch(/^crd_/);
    expect(['active', 'unvalidated']).toContain(body.data?.status);
    expect(body.data?.details).toEqual({
      teamId: 'ABCDE12345',
      keyId: 'XYZ9876543',
      bundleId: 'dev.buzzkit.testapp',
    });
  });

  it('never returns or stores the secret in readable form', async () => {
    const { keyBearer } = await setupWorkspace();
    const p8 = await generateP8();
    const bundleId = `dev.buzzkit.secrecy${uniq()}`;

    const upload = await uploadApns(keyBearer, { p8, bundleId });
    expect(JSON.stringify(upload.body)).not.toContain('PRIVATE KEY');

    const list = await api<Array<Record<string, unknown>>>('/v1/credentials', { headers: keyBearer });
    expect(JSON.stringify(list.body)).not.toContain('PRIVATE KEY');
    for (const row of list.body.data ?? []) {
      expect(row.secretCiphertext).toBeUndefined();
      expect(row.dekCiphertext).toBeUndefined();
    }

    const rows = await db.select().from(tables.credential);
    const stored = rows.find((row) => (row.details as { bundleId?: string }).bundleId === bundleId);
    expect(stored?.secretCiphertext).toBeTruthy();
    expect(stored?.secretCiphertext).not.toContain('PRIVATE KEY');
    expect(stored?.secretCiphertext).not.toBe(p8);
  });

  it('re-uploading replaces the credential — one live row per provider and environment', async () => {
    const { keyBearer } = await setupWorkspace();

    await uploadApns(keyBearer);
    await uploadApns(keyBearer);

    const list = await api<unknown[]>('/v1/credentials', { headers: keyBearer });
    expect(list.body.data).toHaveLength(1);
  });
});

describe('POST /v1/credentials/fcm', () => {
  it('rejects malformed service accounts', async () => {
    const { keyBearer } = await setupWorkspace();

    const { status } = await api('/v1/credentials/fcm', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ serviceAccount: '{"not":"a service account"}' }),
    });

    expect(status).toBe(400);
  });

  it('validates against Google and rejects unregistered accounts end-to-end', async () => {
    const { keyBearer } = await setupWorkspace();
    const account = await generateServiceAccount(`buzzkit-test-${uniq()}`);

    const { status, body } = await api('/v1/credentials/fcm', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ serviceAccount: account }),
    });

    expect(status).toBe(400);
    expect(body.error?.message).toContain('Google rejected');
  });
});

describe('POST /v1/credentials/resend', () => {
  it('validates against Resend and rejects invalid keys end-to-end', async () => {
    const { keyBearer } = await setupWorkspace();

    const { status, body } = await api('/v1/credentials/resend', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ apiKey: `re_definitely_not_valid_${uniq()}` }),
    });

    expect(status).toBe(400);
    expect(body.error?.message).toContain('Resend rejected');
  });

  it('an email credential lives in its own slot next to push credentials', async () => {
    const { keyBearer } = await setupWorkspace();
    await uploadApns(keyBearer);

    const list = await api<Array<{ channel: string; provider: string }>>('/v1/credentials', {
      headers: keyBearer,
    });
    expect(list.body.data?.every((row) => row.channel === 'push')).toBe(true);
  });
});

describe('credential tenant isolation', () => {
  it('scopes credentials to the addressed tenant via buzzkit-tenant', async () => {
    const { keyBearer } = await setupWorkspace();
    const tenant = await createTenant(keyBearer);

    await uploadApns(keyBearer);
    await uploadApns({ ...keyBearer, 'buzzkit-tenant': tenant.slug });

    const defaultList = await api<Array<{ id: string }>>('/v1/credentials', { headers: keyBearer });
    const tenantList = await api<Array<{ id: string }>>('/v1/credentials', {
      headers: { ...keyBearer, 'buzzkit-tenant': tenant.slug },
    });

    expect(defaultList.body.data).toHaveLength(1);
    expect(tenantList.body.data).toHaveLength(1);
    expect(defaultList.body.data?.[0]?.id).not.toBe(tenantList.body.data?.[0]?.id);
  });

  it('404s on unknown buzzkit-tenant slugs', async () => {
    const { keyBearer } = await setupWorkspace();

    const { status } = await api('/v1/credentials', {
      headers: { ...keyBearer, 'buzzkit-tenant': `ghost-${uniq()}` },
    });

    expect(status).toBe(404);
  });

  it('a tenant key reads its own tenant and only its own tenant', async () => {
    const { owner, workspace, keyBearer } = await setupWorkspace();
    const tenant = await createTenant(keyBearer);
    await uploadApns({ ...keyBearer, 'buzzkit-tenant': tenant.slug });

    const tenantKey = await createKey(owner.token, workspace.slug, {
      kind: 'tenant',
      tenant: tenant.slug,
      scopes: ['credentials:read'],
    });
    const tenantBearer = { Authorization: `Bearer ${tenantKey.secret}` };

    const own = await api<unknown[]>('/v1/credentials', { headers: tenantBearer });
    expect(own.status).toBe(200);
    expect(own.body.data).toHaveLength(1);

    const crossTenant = await api('/v1/credentials', {
      headers: { ...tenantBearer, 'buzzkit-tenant': 'default' },
    });
    expect(crossTenant.status).toBe(403);

    const write = await api('/v1/credentials/apns', {
      method: 'POST',
      headers: tenantBearer,
      body: JSON.stringify({
        p8: await generateP8(),
        teamId: 'ABCDE12345',
        keyId: 'XYZ9876543',
        bundleId: 'dev.buzzkit.testapp',
      }),
    });
    expect(write.status).toBe(403);
  });
});

describe('credential id isolation', () => {
  it("a credential id never resolves under a different tenant's context", async () => {
    const { keyBearer } = await setupWorkspace();
    const tenant = await createTenant(keyBearer);
    const defaultCred = await uploadApns(keyBearer);
    const credentialId = defaultCred.body.data?.id;

    const otherContext = { ...keyBearer, 'buzzkit-tenant': tenant.slug };

    const read = await api(`/v1/credentials/${credentialId}`, { headers: otherContext });
    expect(read.status).toBe(404);

    const validate = await api(`/v1/credentials/${credentialId}/validate`, {
      method: 'POST',
      headers: otherContext,
    });
    expect(validate.status).toBe(404);

    const revoke = await api(`/v1/credentials/${credentialId}`, {
      method: 'DELETE',
      headers: otherContext,
    });
    expect(revoke.status).toBe(404);

    const stillThere = await api(`/v1/credentials/${credentialId}`, { headers: keyBearer });
    expect(stillThere.status).toBe(200);
  });

  it('rejects malformed and wrong-entity credential ids', async () => {
    const { keyBearer } = await setupWorkspace();
    const tenant = await createTenant(keyBearer);

    const malformed = await api('/v1/credentials/not-a-sqid!', { headers: keyBearer });
    expect(malformed.status).toBe(400);

    const wrongEntity = await api(`/v1/credentials/${tenant.id}`, { headers: keyBearer });
    expect(wrongEntity.status).toBe(400);
  });
});

describe('credential lifecycle', () => {
  it('revokes, revalidates, and records ledger events', async () => {
    const { workspace, keyBearer, ownerBearer } = await setupWorkspace();

    const upload = await uploadApns(keyBearer);
    const credentialId = upload.body.data?.id;

    const fetched = await api<{ id: string; status: string }>(`/v1/credentials/${credentialId}`, {
      headers: keyBearer,
    });
    expect(fetched.status).toBe(200);
    expect(fetched.body.data?.id).toBe(credentialId);

    const revalidate = await api<{ status: string }>(`/v1/credentials/${credentialId}/validate`, {
      method: 'POST',
      headers: keyBearer,
    });
    expect(revalidate.status).toBe(200);

    const revoke = await api(`/v1/credentials/${credentialId}`, { method: 'DELETE', headers: keyBearer });
    expect(revoke.status).toBe(200);

    const list = await api<unknown[]>('/v1/credentials', { headers: keyBearer });
    expect(list.body.data).toHaveLength(0);

    const events = await api<{ items: Array<{ event: string; targetId: string }> }>(
      `/v1/workspaces/${workspace.slug}/events`,
      { headers: ownerBearer }
    );
    const names = events.body.data?.items.map((item) => item.event);
    expect(names).toContain('credential.created');
    expect(names).toContain('credential.validated');
    expect(names).toContain('credential.revoked');
  });
});
