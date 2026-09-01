import { describe, expect, it } from 'vitest';
import { api } from '../../../utils/api';
import { setupWorkspace, uniq } from '../../../utils/setup';

type SegmentBody = { id: string; slug: string; name: string; version: { number: number } | null };

const onPush = { all: [{ channel: 'push' }] };

async function createSegment(keyBearer: Record<string, string>, slug: string) {
  return api<SegmentBody>('/v1/segments', {
    method: 'POST',
    headers: keyBearer,
    body: JSON.stringify({ slug, name: 'On push', expression: onPush }),
  });
}

describe('/v1/segments/:segmentSlug', () => {
  it('reads, patches (bumping the version only on change) and soft-deletes', async () => {
    const { keyBearer } = await setupWorkspace();
    const slug = `seg-${uniq()}`;
    await createSegment(keyBearer, slug);

    const fetched = await api<SegmentBody>(`/v1/segments/${slug}`, { headers: keyBearer });
    expect(fetched.status).toBe(200);
    expect(fetched.body.data?.version?.number).toBe(1);

    const renamed = await api<SegmentBody>(`/v1/segments/${slug}`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ name: 'Push audience' }),
    });
    expect(renamed.status).toBe(200);
    expect(renamed.body.data?.name).toBe('Push audience');
    expect(renamed.body.data?.version?.number).toBe(1);

    const rewritten = await api<SegmentBody>(`/v1/segments/${slug}`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({
        expression: { all: [{ channel: 'push' }, { ref: 'attributes.vip', eq: true }] },
      }),
    });
    expect(rewritten.body.data?.version?.number).toBe(2);

    const unchanged = await api<SegmentBody>(`/v1/segments/${slug}`, {
      method: 'PATCH',
      headers: keyBearer,
      body: '{}',
    });
    expect(unchanged.status).toBe(200);
    expect(unchanged.body.data?.version?.number).toBe(2);

    const deleted = await api(`/v1/segments/${slug}`, { method: 'DELETE', headers: keyBearer });
    expect(deleted.status).toBe(200);

    const gone = await api(`/v1/segments/${slug}`, { headers: keyBearer });
    expect(gone.status).toBe(404);
  });

  it('requires auth, isolates tenants and answers 404 for unknown slugs', async () => {
    const { keyBearer } = await setupWorkspace();
    const foreign = await setupWorkspace();
    const slug = `seg-${uniq()}`;
    await createSegment(keyBearer, slug);

    const unauthenticated = await api(`/v1/segments/${slug}`);
    expect(unauthenticated.status).toBe(401);

    const crossTenant = await api(`/v1/segments/${slug}`, { headers: foreign.keyBearer });
    expect(crossTenant.status).toBe(404);

    const unknown = await api(`/v1/segments/ghost-${uniq()}`, { headers: keyBearer });
    expect(unknown.status).toBe(404);
  });
});
