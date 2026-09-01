import { describe, expect, it } from 'vitest';
import { api } from '../../../utils/api';
import { setupWorkspace, uniq } from '../../../utils/setup';

type SourceBody = { id: string; name: string; provider: string; status: string; hasSecret: boolean };

async function createSource(keyBearer: Record<string, string>) {
  const { body } = await api<SourceBody>('/v1/sources', {
    method: 'POST',
    headers: keyBearer,
    body: JSON.stringify({ name: `Hooks ${uniq()}`, provider: 'custom', secret: 'whsec_test_secret' }),
  });
  return body.data!;
}

describe('/v1/sources/:id', () => {
  it('reads, patches and soft-deletes a source', async () => {
    const { keyBearer } = await setupWorkspace();
    const source = await createSource(keyBearer);
    expect(source.id).toMatch(/^src_/);
    expect(source.status).toBe('active');

    const fetched = await api<SourceBody>(`/v1/sources/${source.id}`, { headers: keyBearer });
    expect(fetched.status).toBe(200);
    expect(fetched.body.data?.hasSecret).toBe(true);

    const paused = await api<SourceBody>(`/v1/sources/${source.id}`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ status: 'paused' }),
    });
    expect(paused.status).toBe(200);
    expect(paused.body.data?.status).toBe('paused');

    const deleted = await api<{ deleted: boolean }>(`/v1/sources/${source.id}`, {
      method: 'DELETE',
      headers: keyBearer,
    });
    expect(deleted.status).toBe(200);

    const gone = await api(`/v1/sources/${source.id}`, { headers: keyBearer });
    expect(gone.status).toBe(404);
  });

  it('requires auth, isolates tenants and answers 404 for malformed ids', async () => {
    const { keyBearer } = await setupWorkspace();
    const foreign = await setupWorkspace();
    const source = await createSource(keyBearer);

    const unauthenticated = await api(`/v1/sources/${source.id}`);
    expect(unauthenticated.status).toBe(401);

    const malformed = await api('/v1/sources/not-a-sqid', { headers: keyBearer });
    expect(malformed.status).toBe(404);

    const crossTenant = await api(`/v1/sources/${source.id}`, { headers: foreign.keyBearer });
    expect(crossTenant.status).toBe(404);
  });
});
