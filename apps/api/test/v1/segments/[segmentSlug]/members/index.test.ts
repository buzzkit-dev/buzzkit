import { describe, expect, it } from 'vitest';
import { api, type PageData } from '../../../../utils/api';
import { eventually } from '../../../../utils/eventually';
import { fakeToken } from '../../../../utils/fixtures';
import { setupWorkspace, uniq } from '../../../../utils/setup';

type MemberRow = { id: string; externalId: string };

describe('GET /v1/segments/:segmentSlug/members', () => {
  it('lists the subscribers matching the segment expression', async () => {
    const { keyBearer } = await setupWorkspace();
    const insider = `pro_${uniq()}`;
    const outsider = `free_${uniq()}`;
    for (const [externalId, plan] of [
      [insider, 'pro'],
      [outsider, 'free'],
    ]) {
      await api(`/v1/subscribers/${externalId}`, {
        method: 'PUT',
        headers: keyBearer,
        body: JSON.stringify({ attributes: { plan } }),
      });
      await api('/v1/subscriptions', {
        method: 'POST',
        headers: keyBearer,
        body: JSON.stringify({
          externalId,
          channel: 'push',
          platform: 'ios',
          token: fakeToken(externalId ?? 'a'),
        }),
      });
    }
    const slug = `seg-${uniq()}`;
    await api('/v1/segments', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({
        slug,
        name: 'Pros',
        expression: { all: [{ ref: 'attributes.plan', eq: 'pro' }] },
      }),
    });

    const items = await eventually(
      async () => {
        const members = await api<PageData<MemberRow>>(`/v1/segments/${slug}/members`, {
          headers: keyBearer,
        });
        expect(members.status).toBe(200);
        const rows = members.body.data?.items ?? [];
        return rows.length === 1 ? rows : undefined;
      },
      { label: 'segment member listed', intervalMs: 1000 }
    );
    expect(items.map((row) => row.externalId)).toEqual([insider]);
  });

  it('requires auth and answers 404 for unknown segments', async () => {
    const { keyBearer } = await setupWorkspace();

    const unauthenticated = await api('/v1/segments/seg-x/members');
    expect(unauthenticated.status).toBe(401);

    const unknown = await api(`/v1/segments/ghost-${uniq()}/members`, { headers: keyBearer });
    expect(unknown.status).toBe(404);
  });
});
