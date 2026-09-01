import { describe, expect, it } from 'vitest';
import { api } from '../../../../utils/api';
import { setupWorkspace, uniq } from '../../../../utils/setup';

type PreviewBody = { outcome: string; event: { name: string } | null };

describe('POST /v1/sources/:id/preview', () => {
  it('maps a sample payload through the source mapping without recording anything', async () => {
    const { keyBearer } = await setupWorkspace();
    const created = await api<{ id: string }>('/v1/sources', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ name: `Hooks ${uniq()}`, provider: 'custom', secret: 'whsec_test_secret' }),
    });
    const id = created.body.data?.id ?? '';

    const preview = await api<PreviewBody>(`/v1/sources/${id}/preview`, {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({
        payload: { type: 'order.paid', userId: `user_${uniq()}`, data: { total: 42 } },
      }),
    });
    expect(preview.status).toBe(200);
    expect(preview.body.data?.outcome).toBeDefined();

    const ledger = await api<{ items: unknown[] }>(`/v1/sources/${id}/deliveries`, { headers: keyBearer });
    expect(ledger.body.data?.items).toHaveLength(0);
  });

  it('requires auth and answers 404 for unknown sources', async () => {
    const { keyBearer } = await setupWorkspace();

    const unauthenticated = await api('/v1/sources/src_x/preview', { method: 'POST', body: '{}' });
    expect(unauthenticated.status).toBe(401);

    const unknown = await api('/v1/sources/not-a-sqid/preview', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ payload: {} }),
    });
    expect(unknown.status).toBe(404);
  });
});
