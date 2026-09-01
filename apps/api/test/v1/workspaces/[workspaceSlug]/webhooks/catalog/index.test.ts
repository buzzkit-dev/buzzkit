import { describe, expect, it } from 'vitest';
import { api } from '../../../../../utils/api';
import { setupWorkspace } from '../../../../../utils/setup';

type CatalogBody = { groups: Array<{ label: string; wildcard?: string; options: string[] }> };

describe('GET /v1/workspaces/:workspaceSlug/webhooks/catalog', () => {
  it('lists every subscribable event name in resource groups', async () => {
    const { workspace, ownerBearer } = await setupWorkspace();

    const { status, body } = await api<CatalogBody>(`/v1/workspaces/${workspace.slug}/webhooks/catalog`, {
      headers: ownerBearer,
    });
    expect(status).toBe(200);
    const names = (body.data?.groups ?? []).flatMap((group) => group.options);
    expect(names).toContain('tenant.created');
    expect((body.data?.groups.length ?? 0) > 0).toBe(true);
  });

  it('requires auth', async () => {
    const { workspace } = await setupWorkspace();

    const unauthenticated = await api(`/v1/workspaces/${workspace.slug}/webhooks/catalog`);
    expect(unauthenticated.status).toBe(401);
  });
});
