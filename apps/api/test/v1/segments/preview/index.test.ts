import { describe, expect, it } from 'vitest';
import { api } from '../../../utils/api';
import { eventually } from '../../../utils/eventually';
import { setupWorkspace, uniq } from '../../../utils/setup';

type PreviewBody = { count: number; sample: Array<{ externalId: string }> };

describe('POST /v1/segments/preview', () => {
  it('counts and samples matching subscribers without creating a segment', async () => {
    const { keyBearer } = await setupWorkspace();
    const insider = `vip_${uniq()}`;
    await api(`/v1/subscribers/${insider}`, {
      method: 'PUT',
      headers: keyBearer,
      body: JSON.stringify({ attributes: { vip: true } }),
    });
    await api(`/v1/subscribers/nobody_${uniq()}`, { method: 'PUT', headers: keyBearer, body: '{}' });

    const data = await eventually(
      async () => {
        const preview = await api<PreviewBody>('/v1/segments/preview', {
          method: 'POST',
          headers: keyBearer,
          body: JSON.stringify({ expression: { all: [{ ref: 'attributes.vip', eq: true }] } }),
        });
        expect(preview.status).toBe(200);
        return preview.body.data?.count === 1 ? preview.body.data : undefined;
      },
      { label: 'preview counted', intervalMs: 1000 }
    );
    expect(data.sample.map((row) => row.externalId)).toEqual([insider]);
  });

  it('requires auth and rejects an invalid expression', async () => {
    const { keyBearer } = await setupWorkspace();

    const unauthenticated = await api('/v1/segments/preview', {
      method: 'POST',
      body: JSON.stringify({ expression: { all: [{ channel: 'push' }] } }),
    });
    expect(unauthenticated.status).toBe(401);

    const invalid = await api('/v1/segments/preview', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ expression: { nonsense: true } }),
    });
    expect(invalid.status).toBe(400);
  });
});
