import { describe, expect, it } from 'vitest';
import { api } from '../../../../utils/api';
import { setupWorkspace, uniq } from '../../../../utils/setup';

type IngestBody = { outcome: string; reason: string | null };

describe('POST /v1/sources/:id/ingest', () => {
  it('is unauthenticated but rejects an unsigned request on a secret-bearing source', async () => {
    const { keyBearer } = await setupWorkspace();
    const created = await api<{ id: string; url: string }>('/v1/sources', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ name: `Hooks ${uniq()}`, provider: 'custom', secret: 'whsec_test_secret' }),
    });
    const source = created.body.data!;

    const unsigned = await api<IngestBody>(source.url, {
      method: 'POST',
      body: JSON.stringify({ hello: 'world' }),
    });
    expect(unsigned.status).toBe(401);
    expect(unsigned.body.data?.outcome).toBe('rejected');
  });

  it('answers 404 for unknown source ids', async () => {
    const unknown = await api('/v1/sources/not-a-sqid/ingest', { method: 'POST', body: '{}' });
    expect(unknown.status).toBe(404);
  });
});
