import { describe, expect, it } from 'vitest';
import { api } from '../../utils/api';
import { db, eq, sql, tables } from '../../utils/db';
import { generateP8 } from '../../utils/providerKeys';
import { createTenant, setupWorkspace, uniq } from '../../utils/setup';

async function uploadApns(headers: Record<string, string>, bundleId: string) {
  const response = await api<{ items: Array<{ id: string }> }>('/v1/credentials', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      provider: 'apns',
      p8: await generateP8(),
      teamId: 'ABCDE12345',
      keyId: 'XYZ9876543',
      bundleId,
      environment: 'sandbox',
    }),
  });
  const created = response.body.data?.items[0];
  if (response.status !== 201 || !created) {
    throw new Error(`upload failed: ${response.status}`);
  }
  return created;
}

async function storedRow(bundleId: string) {
  const [row] = await db
    .select()
    .from(tables.credential)
    .where(sql`${tables.credential.details}->>'bundleId' = ${bundleId}`);
  if (!row) throw new Error(`no stored credential for ${bundleId}`);
  return row;
}

describe('credential storage security', () => {
  it('detects ciphertext tampering — a flipped byte fails closed as invalid', async () => {
    const { keyBearer } = await setupWorkspace({ bare: true });
    const bundleId = `dev.buzzkit.tamper${uniq()}`;
    const uploaded = await uploadApns(keyBearer, bundleId);

    const row = await storedRow(bundleId);
    const corrupted = Buffer.from(row.secretCiphertext, 'base64');
    corrupted[0] = (corrupted[0] ?? 0) ^ 0xff;
    await db
      .update(tables.credential)
      .set({ secretCiphertext: corrupted.toString('base64') })
      .where(eq(tables.credential.id, row.id));

    const { status, body } = await api<{ status: string; lastError: string }>(
      `/v1/credentials/${uploaded.id}/validate`,
      { method: 'POST', headers: keyBearer }
    );

    expect(status).toBe(200);
    expect(body.data?.status).toBe('invalid');
    expect(body.data?.lastError).toContain('integrity');
    expect(JSON.stringify(body)).not.toContain('PRIVATE KEY');
  });

  it('refuses a ciphertext swapped between tenants — AAD context binding', async () => {
    const { keyBearer } = await setupWorkspace({ bare: true });
    const tenant = await createTenant(keyBearer, undefined, { bare: true });
    const bundleA = `dev.buzzkit.aad-a${uniq()}`;
    const bundleB = `dev.buzzkit.aad-b${uniq()}`;

    const defaultCred = await uploadApns(keyBearer, bundleA);
    await uploadApns({ ...keyBearer, 'buzzkit-tenant': tenant.slug }, bundleB);

    const rowA = await storedRow(bundleA);
    const rowB = await storedRow(bundleB);
    await db
      .update(tables.credential)
      .set({
        secretCiphertext: rowB.secretCiphertext,
        secretIv: rowB.secretIv,
        dekCiphertext: rowB.dekCiphertext,
        dekIv: rowB.dekIv,
      })
      .where(eq(tables.credential.id, rowA.id));

    const { status, body } = await api<{ status: string; lastError: string }>(
      `/v1/credentials/${defaultCred.id}/validate`,
      { method: 'POST', headers: keyBearer }
    );

    expect(status).toBe(200);
    expect(body.data?.status).toBe('invalid');
    expect(body.data?.lastError).toContain('integrity');
  });

  it('stores unique data keys and IVs per credential — no reuse', async () => {
    const { keyBearer } = await setupWorkspace({ bare: true });
    const bundleA = `dev.buzzkit.uniq-a${uniq()}`;
    const bundleB = `dev.buzzkit.uniq-b${uniq()}`;

    await uploadApns(keyBearer, bundleA);
    const tenant = await createTenant(keyBearer, undefined, { bare: true });
    await uploadApns({ ...keyBearer, 'buzzkit-tenant': tenant.slug }, bundleB);

    const rowA = await storedRow(bundleA);
    const rowB = await storedRow(bundleB);

    expect(rowA.secretIv).not.toBe(rowB.secretIv);
    expect(rowA.dekIv).not.toBe(rowB.dekIv);
    expect(rowA.dekCiphertext).not.toBe(rowB.dekCiphertext);
    expect(rowA.keyVersion).toBe(1);
  });

  it('an intact credential still revalidates after the tamper suite ran', async () => {
    const { keyBearer } = await setupWorkspace({ bare: true });
    const bundleId = `dev.buzzkit.intact${uniq()}`;
    const uploaded = await uploadApns(keyBearer, bundleId);

    const { status, body } = await api<{ status: string; lastError: string | null }>(
      `/v1/credentials/${uploaded.id}/validate`,
      { method: 'POST', headers: keyBearer }
    );

    expect(status).toBe(200);
    expect(body.data?.status).not.toBe('invalid');
  });
});
