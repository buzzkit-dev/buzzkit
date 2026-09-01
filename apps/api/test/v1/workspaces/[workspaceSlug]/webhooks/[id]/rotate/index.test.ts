import { describe, expect, it } from 'vitest';
import { api } from '../../../../../../utils/api';
import { setupWorkspace } from '../../../../../../utils/setup';

type EndpointBody = { id: string; secret: string };

describe('POST /v1/workspaces/:workspaceSlug/webhooks/:id/rotate', () => {
  it('rotates the signing secret to a new whsec value', async () => {
    const { workspace, ownerBearer } = await setupWorkspace();
    const created = await api<EndpointBody>(`/v1/workspaces/${workspace.slug}/webhooks`, {
      method: 'POST',
      headers: ownerBearer,
      body: JSON.stringify({ url: 'https://hooks.example.com/buzzkit' }),
    });
    const endpoint = created.body.data!;

    const rotated = await api<EndpointBody>(
      `/v1/workspaces/${workspace.slug}/webhooks/${endpoint.id}/rotate`,
      { method: 'POST', headers: ownerBearer }
    );
    expect(rotated.status).toBe(200);
    expect(rotated.body.data?.secret).toMatch(/^whsec_/);
    expect(rotated.body.data?.secret).not.toBe(endpoint.secret);
  });

  it('requires auth and answers 404 for unknown endpoints', async () => {
    const { workspace, ownerBearer } = await setupWorkspace();

    const unauthenticated = await api(`/v1/workspaces/${workspace.slug}/webhooks/wh_x/rotate`, {
      method: 'POST',
    });
    expect(unauthenticated.status).toBe(401);

    const unknown = await api(`/v1/workspaces/${workspace.slug}/webhooks/not-a-sqid/rotate`, {
      method: 'POST',
      headers: ownerBearer,
    });
    expect(unknown.status).toBe(404);
  });
});
