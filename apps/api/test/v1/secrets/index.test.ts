import { describe, expect, it } from 'vitest';
import { api } from '../../utils/api';
import { db, sql } from '../../utils/db';
import { setupWorkspace } from '../../utils/setup';

type SecretBody = { id: string; name: string; version: number; createdAt: string; updatedAt: string };

describe('/v1/secrets', () => {
  it('stores, lists, updates and removes sealed secrets without ever returning a value', async () => {
    const { keyBearer } = await setupWorkspace({ bare: true });

    const created = await api<SecretBody>('/v1/secrets/api', {
      method: 'PUT',
      headers: keyBearer,
      body: JSON.stringify({ value: 'sk_live_1' }),
    });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ name: 'api', version: 1 });
    expect(created.body.data?.id).toMatch(/^sec_/);
    expect(JSON.stringify(created.body)).not.toContain('sk_live_1');

    const updated = await api<SecretBody>('/v1/secrets/api', {
      method: 'PUT',
      headers: keyBearer,
      body: JSON.stringify({ value: 'sk_live_2' }),
    });
    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({ name: 'api', version: 2, id: created.body.data?.id });

    const other = await api<SecretBody>('/v1/secrets/other', {
      method: 'PUT',
      headers: keyBearer,
      body: JSON.stringify({ value: 'x' }),
    });
    expect(other.status).toBe(201);

    const list = await api<{ items: SecretBody[] }>('/v1/secrets', { headers: keyBearer });
    expect(list.status).toBe(200);
    expect(list.body.data?.items.map((item) => item.name)).toEqual(['api', 'other']);
    expect(JSON.stringify(list.body)).not.toContain('sk_live');

    const rows = await db.execute(
      sql`select secret_ciphertext from secret where name = 'api' and deleted_at is null`
    );
    expect(JSON.stringify(rows)).not.toContain('sk_live');

    const badName = await api('/v1/secrets/Api-Key', {
      method: 'PUT',
      headers: keyBearer,
      body: JSON.stringify({ value: 'x' }),
    });
    expect(badName.status).toBe(400);
    const empty = await api('/v1/secrets/api', {
      method: 'PUT',
      headers: keyBearer,
      body: JSON.stringify({ value: '' }),
    });
    expect(empty.status).toBe(400);

    const removed = await api<SecretBody & { deleted: boolean }>('/v1/secrets/other', {
      method: 'DELETE',
      headers: keyBearer,
    });
    expect(removed.status).toBe(200);
    expect(removed.body.data?.deleted).toBe(true);
    const missing = await api('/v1/secrets/other', { headers: keyBearer });
    expect(missing.status).toBe(404);
    const after = await api<{ items: SecretBody[] }>('/v1/secrets', { headers: keyBearer });
    expect(after.body.data?.items.map((item) => item.name)).toEqual(['api']);
  });
});
