import { describe, expect, it } from 'vitest';
import { api, type PageData } from '../../../../utils/api';
import { setupWorkspace, uniq } from '../../../../utils/setup';

type SourceDeliveryRow = { id: string; outcome: string; reason: string | null };

describe('GET /v1/sources/:id/deliveries', () => {
  it('lists the delivery ledger of one source', async () => {
    const { keyBearer } = await setupWorkspace();
    const created = await api<{ id: string; url: string }>('/v1/sources', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ name: `Hooks ${uniq()}`, provider: 'custom', secret: 'whsec_test_secret' }),
    });
    const source = created.body.data!;

    const unsigned = await api(source.url, { method: 'POST', body: JSON.stringify({ hello: 'world' }) });
    expect(unsigned.status).toBe(401);

    const listed = await api<PageData<SourceDeliveryRow>>(`/v1/sources/${source.id}/deliveries`, {
      headers: keyBearer,
    });
    expect(listed.status).toBe(200);
    expect(listed.body.data?.items).toHaveLength(1);
    expect(listed.body.data?.items[0]?.outcome).toBe('rejected');
  });

  it('requires auth and answers 404 for unknown sources', async () => {
    const { keyBearer } = await setupWorkspace();

    const unauthenticated = await api('/v1/sources/src_x/deliveries');
    expect(unauthenticated.status).toBe(401);

    const unknown = await api('/v1/sources/not-a-sqid/deliveries', { headers: keyBearer });
    expect(unknown.status).toBe(404);
  });
});
