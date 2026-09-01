import { describe, expect, it } from 'vitest';
import { api } from '../../../utils/api';
import { setupWorkspace, uniq } from '../../../utils/setup';

type SecretBody = { name: string; version: number; updatedAt: string };

describe('/v1/secrets/:name', () => {
  it('puts, reads, bumps the version on change and deletes', async () => {
    const { keyBearer } = await setupWorkspace();
    const name = `token_${uniq()}`.slice(0, 24).replace(/-/g, '_');

    const created = await api<SecretBody>(`/v1/secrets/${name}`, {
      method: 'PUT',
      headers: keyBearer,
      body: JSON.stringify({ value: 'first' }),
    });
    expect(created.status).toBe(201);
    expect(created.body.data?.version).toBe(1);

    const fetched = await api<SecretBody>(`/v1/secrets/${name}`, { headers: keyBearer });
    expect(fetched.status).toBe(200);
    expect(fetched.body.data?.name).toBe(name);
    expect(JSON.stringify(fetched.body.data)).not.toContain('first');

    const updated = await api<SecretBody>(`/v1/secrets/${name}`, {
      method: 'PUT',
      headers: keyBearer,
      body: JSON.stringify({ value: 'second' }),
    });
    expect(updated.body.data?.version).toBe(2);

    const deleted = await api<{ deleted: boolean }>(`/v1/secrets/${name}`, {
      method: 'DELETE',
      headers: keyBearer,
    });
    expect(deleted.status).toBe(200);

    const gone = await api(`/v1/secrets/${name}`, { headers: keyBearer });
    expect(gone.status).toBe(404);
  });

  it('requires auth, isolates tenants and answers 404 for unknown names', async () => {
    const { keyBearer } = await setupWorkspace();
    const foreign = await setupWorkspace();
    const name = `token_${uniq()}`.slice(0, 24).replace(/-/g, '_');
    await api(`/v1/secrets/${name}`, {
      method: 'PUT',
      headers: keyBearer,
      body: JSON.stringify({ value: 'mine' }),
    });

    const unauthenticated = await api(`/v1/secrets/${name}`);
    expect(unauthenticated.status).toBe(401);

    const crossTenant = await api(`/v1/secrets/${name}`, { headers: foreign.keyBearer });
    expect(crossTenant.status).toBe(404);

    const unknown = await api(`/v1/secrets/ghost_${uniq()}`.replace(/-/g, '_'), { headers: keyBearer });
    expect(unknown.status).toBe(404);
  });
});
