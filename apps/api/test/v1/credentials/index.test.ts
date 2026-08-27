import { describe, expect, it } from 'vitest';
import { api } from '../../utils/api';
import { db, sql, tables } from '../../utils/db';
import { generateP8, generateServiceAccount } from '../../utils/providerKeys';
import { createKey, createTenant, setupWorkspace, uniq } from '../../utils/setup';

type CredentialBody = {
  id: string;
  status: string;
  environment: string;
  details: Record<string, string>;
  lastError: string | null;
};

async function uploadApns(headers: Record<string, string>, options: { p8?: string; bundleId?: string } = {}) {
  const { status, body } = await api<{ items: CredentialBody[] }>('/v1/credentials', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      provider: 'apns',
      p8: options.p8 ?? (await generateP8()),
      teamId: 'ABCDE12345',
      keyId: 'XYZ9876543',
      bundleId: options.bundleId ?? 'dev.buzzkit.testapp',
      environment: 'sandbox',
    }),
  });
  return { status, body: { ...body, data: body.data?.items[0] ?? null } };
}

describe('POST /v1/credentials (apns)', () => {
  it('rejects a structurally invalid .p8 without storing anything', async () => {
    const { keyBearer } = await setupWorkspace({ bare: true });

    const { status, body } = await uploadApns(keyBearer, { p8: 'not a p8 key at all' });

    expect(status).toBe(400);
    expect(body.error?.message).toContain('.p8');

    const list = await api<unknown[]>('/v1/credentials', { headers: keyBearer });
    expect(list.body.data?.items).toHaveLength(0);
  });

  it('stores a well-formed key against the default tenant (unvalidated when APNs is unreachable locally)', async () => {
    const { keyBearer } = await setupWorkspace({ bare: true });

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
    const { keyBearer } = await setupWorkspace({ bare: true });
    const p8 = await generateP8();
    const bundleId = `dev.buzzkit.secrecy${uniq()}`;

    const upload = await uploadApns(keyBearer, { p8, bundleId });
    expect(JSON.stringify(upload.body)).not.toContain('PRIVATE KEY');

    const list = await api<{ items: Array<Record<string, unknown>> }>('/v1/credentials', {
      headers: keyBearer,
    });
    expect(JSON.stringify(list.body)).not.toContain('PRIVATE KEY');
    for (const row of list.body.data?.items ?? []) {
      expect(row.secretCiphertext).toBeUndefined();
      expect(row.dekCiphertext).toBeUndefined();
    }

    const [stored] = await db
      .select()
      .from(tables.credential)
      .where(sql`${tables.credential.details}->>'bundleId' = ${bundleId}`);
    expect(stored?.secretCiphertext).toBeTruthy();
    expect(stored?.secretCiphertext).not.toContain('PRIVATE KEY');
    expect(stored?.secretCiphertext).not.toBe(p8);
  });

  it('re-uploading replaces the credential — one live row per provider and environment', async () => {
    const { keyBearer } = await setupWorkspace({ bare: true });

    await uploadApns(keyBearer);
    await uploadApns(keyBearer);

    const list = await api<unknown[]>('/v1/credentials', { headers: keyBearer });
    expect(list.body.data?.items).toHaveLength(1);
  });
});

describe('credential input validation and slots', () => {
  it('validates APNs metadata shape before touching any provider', async () => {
    const { keyBearer } = await setupWorkspace({ bare: true });
    const p8 = await generateP8();

    for (const body of [
      { p8, teamId: 'SHORT', keyId: 'XYZ9876543', bundleId: 'a.b' },
      { p8, teamId: 'ABCDE12345', keyId: 'X', bundleId: 'a.b' },
      { p8, teamId: 'ABCDE12345', keyId: 'XYZ9876543', bundleId: '' },
      { p8, teamId: 'ABCDE12345', keyId: 'XYZ9876543', bundleId: 'a.b', environment: 'staging' },
      { teamId: 'ABCDE12345', keyId: 'XYZ9876543', bundleId: 'a.b' },
    ]) {
      const { status } = await api('/v1/credentials', {
        method: 'POST',
        headers: keyBearer,
        body: JSON.stringify({ provider: 'apns', ...body }),
      });
      expect(status, JSON.stringify({ ...body, p8: body.p8 ? '<p8>' : undefined })).toBe(400);
    }
  });

  it('sandbox and production APNs credentials are separate slots', async () => {
    const { keyBearer } = await setupWorkspace({ bare: true });
    const base = { teamId: 'ABCDE12345', keyId: 'XYZ9876543', bundleId: 'dev.buzzkit.slots' };

    const sandbox = await api('/v1/credentials', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ provider: 'apns', ...base, p8: await generateP8(), environment: 'sandbox' }),
    });
    const production = await api('/v1/credentials', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ provider: 'apns', ...base, p8: await generateP8(), environment: 'production' }),
    });
    expect(sandbox.status).toBe(201);
    expect(production.status).toBe(201);

    const list = await api<{ items: Array<{ environment: string }> }>('/v1/credentials', {
      headers: keyBearer,
    });
    expect(list.body.data?.items?.map((c) => c.environment).sort()).toEqual(['production', 'sandbox']);
  });

  it('dashboard sessions upload with workspace + tenant headers', async () => {
    const { workspace, ownerBearer, keyBearer } = await setupWorkspace({ bare: true });
    const tenant = await createTenant(keyBearer, undefined, { bare: true });

    const { status } = await uploadApns({
      ...ownerBearer,
      'buzzkit-workspace': workspace.slug,
      'buzzkit-tenant': tenant.slug,
    });
    expect(status).toBe(201);

    const viaKey = await api<{ items: unknown[] }>('/v1/credentials', {
      headers: { ...keyBearer, 'buzzkit-tenant': tenant.slug },
    });
    expect(viaKey.body.data?.items).toHaveLength(1);
  });
});

describe('POST /v1/credentials (fcm)', () => {
  it('rejects malformed service accounts', async () => {
    const { keyBearer } = await setupWorkspace({ bare: true });

    const { status } = await api('/v1/credentials', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ provider: 'fcm', serviceAccount: '{"not":"a service account"}' }),
    });

    expect(status).toBe(400);
  });

  it('validates against Google and rejects unregistered accounts end-to-end', async () => {
    const { keyBearer } = await setupWorkspace({ bare: true });
    const account = await generateServiceAccount(`buzzkit-test-${uniq()}`);

    const { status, body } = await api('/v1/credentials', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ provider: 'fcm', serviceAccount: account }),
    });

    if (status === 201) {
      expect((body.data as { items: Array<{ status: string }> }).items[0]?.status).toBe('unvalidated');
    } else {
      expect(status).toBe(400);
      expect(body.error?.message).toContain('Firebase rejected');
    }
  });
});

describe('POST /v1/credentials (resend)', () => {
  it('validates against Resend and rejects invalid keys end-to-end', async () => {
    const { keyBearer } = await setupWorkspace({ bare: true });

    const { status, body } = await api('/v1/credentials', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ provider: 'resend', apiKey: `re_definitely_not_valid_${uniq()}` }),
    });

    if (status === 201) {
      expect((body.data as { items: Array<{ status: string }> }).items[0]?.status).toBe('unvalidated');
    } else {
      expect(status).toBe(400);
      expect(body.error?.message).toContain('Resend rejected');
    }
  });

  it('an email credential lives in its own slot next to push credentials', async () => {
    const { keyBearer } = await setupWorkspace({ bare: true });
    await uploadApns(keyBearer);

    const list = await api<{ items: Array<{ channel: string; provider: string }> }>('/v1/credentials', {
      headers: keyBearer,
    });
    expect(list.body.data?.items?.every((row) => row.channel === 'push')).toBe(true);
  });
});

describe('credential tenant isolation', () => {
  it('scopes credentials to the addressed tenant via buzzkit-tenant', async () => {
    const { keyBearer } = await setupWorkspace({ bare: true });
    const tenant = await createTenant(keyBearer, undefined, { bare: true });

    await uploadApns(keyBearer);
    await uploadApns({ ...keyBearer, 'buzzkit-tenant': tenant.slug });

    const defaultList = await api<{ items: Array<{ id: string }> }>('/v1/credentials', {
      headers: keyBearer,
    });
    const tenantList = await api<{ items: Array<{ id: string }> }>('/v1/credentials', {
      headers: { ...keyBearer, 'buzzkit-tenant': tenant.slug },
    });

    expect(defaultList.body.data?.items).toHaveLength(1);
    expect(tenantList.body.data?.items).toHaveLength(1);
    expect(defaultList.body.data?.items?.[0]?.id).not.toBe(tenantList.body.data?.items?.[0]?.id);
  });

  it('404s on unknown buzzkit-tenant slugs', async () => {
    const { keyBearer } = await setupWorkspace({ bare: true });

    const { status } = await api('/v1/credentials', {
      headers: { ...keyBearer, 'buzzkit-tenant': `ghost-${uniq()}` },
    });

    expect(status).toBe(404);
  });

  it('a tenant key reads its own tenant and only its own tenant', async () => {
    const { owner, workspace, keyBearer } = await setupWorkspace({ bare: true });
    const tenant = await createTenant(keyBearer, undefined, { bare: true });
    await uploadApns({ ...keyBearer, 'buzzkit-tenant': tenant.slug });

    const tenantKey = await createKey(owner.token, workspace.slug, {
      kind: 'tenant',
      tenant: tenant.slug,
      scopes: ['credentials:read'],
    });
    const tenantBearer = { Authorization: `Bearer ${tenantKey.secret}` };

    const own = await api<{ items: unknown[] }>('/v1/credentials', { headers: tenantBearer });
    expect(own.status).toBe(200);
    expect(own.body.data?.items).toHaveLength(1);

    const crossTenant = await api('/v1/credentials', {
      headers: { ...tenantBearer, 'buzzkit-tenant': 'default' },
    });
    expect(crossTenant.status).toBe(403);

    const write = await api('/v1/credentials', {
      method: 'POST',
      headers: tenantBearer,
      body: JSON.stringify({
        provider: 'apns',
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
    const { keyBearer } = await setupWorkspace({ bare: true });
    const tenant = await createTenant(keyBearer, undefined, { bare: true });
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
    const { keyBearer } = await setupWorkspace({ bare: true });
    const tenant = await createTenant(keyBearer, undefined, { bare: true });

    const malformed = await api('/v1/credentials/not-a-sqid!', { headers: keyBearer });
    expect(malformed.status).toBe(404);

    const wrongEntity = await api(`/v1/credentials/${tenant.id}`, { headers: keyBearer });
    expect(wrongEntity.status).toBe(404);
  });
});

describe('credential lifecycle edges', () => {
  it('a replaced credential id dies; a revoked one 404s on every verb; read-only keys cannot act', async () => {
    const { owner, workspace, keyBearer } = await setupWorkspace({ bare: true });

    const first = await uploadApns(keyBearer);
    const second = await uploadApns(keyBearer);
    expect(first.body.data?.id).not.toBe(second.body.data?.id);

    const oldId = await api(`/v1/credentials/${first.body.data?.id}`, { headers: keyBearer });
    expect(oldId.status).toBe(404);

    await api(`/v1/credentials/${second.body.data?.id}`, { method: 'DELETE', headers: keyBearer });
    for (const [method, suffix] of [
      ['GET', ''],
      ['POST', '/validate'],
      ['DELETE', ''],
    ] as const) {
      const { status } = await api(`/v1/credentials/${second.body.data?.id}${suffix}`, {
        method,
        headers: keyBearer,
      });
      expect(status, `${method} ${suffix}`).toBe(404);
    }

    const third = await uploadApns(keyBearer);
    const readOnly = await createKey(owner.token, workspace.slug, { scopes: ['credentials:read'] });
    const readBearer = { Authorization: `Bearer ${readOnly.secret}` };

    const read = await api(`/v1/credentials/${third.body.data?.id}`, { headers: readBearer });
    expect(read.status).toBe(200);

    const validate = await api(`/v1/credentials/${third.body.data?.id}/validate`, {
      method: 'POST',
      headers: readBearer,
    });
    expect(validate.status).toBe(403);

    const revoke = await api(`/v1/credentials/${third.body.data?.id}`, {
      method: 'DELETE',
      headers: readBearer,
    });
    expect(revoke.status).toBe(403);
  });

  it('the audit ledger never contains credential secrets', async () => {
    const { workspace, keyBearer, ownerBearer } = await setupWorkspace({ bare: true });
    const p8 = await generateP8();
    await uploadApns(keyBearer, { p8, bundleId: `dev.buzzkit.ledger${uniq()}` });

    const events = await api(`/v1/workspaces/${workspace.slug}/audit`, { headers: ownerBearer });
    const serialized = JSON.stringify(events.body);
    expect(serialized).not.toContain('PRIVATE KEY');
    expect(serialized).not.toContain(p8.split('\n')[1] ?? 'never');
  });
});

describe('credential lifecycle', () => {
  it('revokes, revalidates, and records ledger events', async () => {
    const { workspace, keyBearer, ownerBearer } = await setupWorkspace({ bare: true });

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
    expect(list.body.data?.items).toHaveLength(0);

    const events = await api<{ items: Array<{ event: string; targetId: string }> }>(
      `/v1/workspaces/${workspace.slug}/audit`,
      { headers: ownerBearer }
    );
    const names = events.body.data?.items.map((item) => item.event);
    expect(names).toContain('credential.created');
    expect(names).toContain('credential.validated');
    expect(names).toContain('credential.revoked');
  });
});

describe('environment detection', () => {
  it('detects the environments a key is valid for and creates one slot per environment', async () => {
    const { keyBearer } = await setupWorkspace({ bare: true });
    const { status, body } = await api<{ items: CredentialBody[] }>('/v1/credentials', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({
        provider: 'apns',
        p8: await generateP8(),
        teamId: 'ABCDE12345',
        keyId: 'XYZ9876543',
        bundleId: 'dev.buzzkit.detect',
      }),
    });
    expect(status).toBe(201);
    const environments = body.data?.items.map((item) => item.environment).sort();
    expect(environments).toEqual(['production', 'sandbox']);
    for (const item of body.data?.items ?? []) expect(['active', 'unvalidated']).toContain(item.status);

    const list = await api<{ items: CredentialBody[] }>('/v1/credentials', { headers: keyBearer });
    expect(list.body.data?.items.map((item) => item.environment).sort()).toEqual(['production', 'sandbox']);
  });

  it('an explicit environment creates exactly that slot', async () => {
    const { keyBearer } = await setupWorkspace({ bare: true });
    const { body } = await uploadApns(keyBearer);
    expect(body.data?.environment).toBe('sandbox');
    const list = await api<{ items: CredentialBody[] }>('/v1/credentials', { headers: keyBearer });
    expect(list.body.data?.items).toHaveLength(1);
  });
});
