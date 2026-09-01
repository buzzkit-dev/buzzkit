import { describe, expect, it } from 'vitest';
import { api } from '../../../utils/api';
import { setupWorkspace, uniq } from '../../../utils/setup';

type TopicBody = { id: string; slug: string; name: string };

describe('/v1/topics/:topicSlug', () => {
  it('reads, renames and soft-deletes a topic', async () => {
    const { keyBearer } = await setupWorkspace();
    const slug = `deals-${uniq()}`;
    await api('/v1/topics', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ slug, name: 'Deals' }),
    });

    const fetched = await api<TopicBody>(`/v1/topics/${slug}`, { headers: keyBearer });
    expect(fetched.status).toBe(200);
    expect(fetched.body.data?.id).toMatch(/^tpc_/);

    const renamed = await api<TopicBody>(`/v1/topics/${slug}`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ name: 'Hot deals' }),
    });
    expect(renamed.status).toBe(200);
    expect(renamed.body.data?.name).toBe('Hot deals');

    const unchanged = await api<TopicBody>(`/v1/topics/${slug}`, {
      method: 'PATCH',
      headers: keyBearer,
      body: '{}',
    });
    expect(unchanged.status).toBe(200);
    expect(unchanged.body.data?.name).toBe('Hot deals');

    const deleted = await api<{ deleted: boolean }>(`/v1/topics/${slug}`, {
      method: 'DELETE',
      headers: keyBearer,
    });
    expect(deleted.status).toBe(200);

    const gone = await api(`/v1/topics/${slug}`, { headers: keyBearer });
    expect(gone.status).toBe(404);
  });

  it('requires auth, isolates tenants and answers 404 for unknown slugs', async () => {
    const { keyBearer } = await setupWorkspace();
    const foreign = await setupWorkspace();
    const slug = `deals-${uniq()}`;
    await api('/v1/topics', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ slug, name: 'Deals' }),
    });

    const unauthenticated = await api(`/v1/topics/${slug}`);
    expect(unauthenticated.status).toBe(401);

    const crossTenant = await api(`/v1/topics/${slug}`, { headers: foreign.keyBearer });
    expect(crossTenant.status).toBe(404);

    const unknown = await api(`/v1/topics/ghost-${uniq()}`, { headers: keyBearer });
    expect(unknown.status).toBe(404);
  });
});
