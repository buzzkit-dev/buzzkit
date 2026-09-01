import { describe, expect, it } from 'vitest';
import { api } from '../../utils/api';
import { setupWorkspace, uniq } from '../../utils/setup';

type CategoryBody = { id: string; name: string };

async function seedCategory(keyBearer: Record<string, string>, name: string) {
  await api('/v1/topics', {
    method: 'POST',
    headers: keyBearer,
    body: JSON.stringify({ slug: `alerts-${uniq()}`, name: 'Alerts', category: name }),
  });
  const listed = await api<{ items: CategoryBody[] }>('/v1/topic-categories', { headers: keyBearer });
  return listed.body.data?.items.find((item) => item.name === name);
}

describe('/v1/topic-categories', () => {
  it('lists categories created through topics, renames and deletes one', async () => {
    const { keyBearer } = await setupWorkspace();
    const name = `Signals ${uniq()}`;
    const category = await seedCategory(keyBearer, name);
    expect(category?.id).toMatch(/^tcg_/);

    const renamed = await api<CategoryBody>(`/v1/topic-categories/${category?.id}`, {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ name: `${name} v2` }),
    });
    expect(renamed.status).toBe(200);
    expect(renamed.body.data?.name).toBe(`${name} v2`);

    const deleted = await api<{ deleted: boolean }>(`/v1/topic-categories/${category?.id}`, {
      method: 'DELETE',
      headers: keyBearer,
    });
    expect(deleted.status).toBe(200);
    expect(deleted.body.data?.deleted).toBe(true);

    const relisted = await api<{ items: CategoryBody[] }>('/v1/topic-categories', { headers: keyBearer });
    expect(relisted.body.data?.items.some((item) => item.id === category?.id)).toBe(false);
  });

  it('requires auth, isolates tenants and answers 404 for malformed ids', async () => {
    const { keyBearer } = await setupWorkspace();
    const foreign = await setupWorkspace();
    const category = await seedCategory(keyBearer, `Signals ${uniq()}`);

    const unauthenticated = await api('/v1/topic-categories');
    expect(unauthenticated.status).toBe(401);

    const malformed = await api('/v1/topic-categories/not-a-sqid', {
      method: 'PATCH',
      headers: keyBearer,
      body: JSON.stringify({ name: 'X' }),
    });
    expect(malformed.status).toBe(404);

    const crossTenant = await api(`/v1/topic-categories/${category?.id}`, {
      method: 'DELETE',
      headers: foreign.keyBearer,
    });
    expect(crossTenant.status).toBe(404);
  });
});
