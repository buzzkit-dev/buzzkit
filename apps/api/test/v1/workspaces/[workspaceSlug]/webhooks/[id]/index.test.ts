import { describe, expect, it } from 'vitest';
import { api } from '../../../../../utils/api';
import { setupWorkspace } from '../../../../../utils/setup';

type EndpointBody = { id: string; url: string; description: string | null; enabled?: boolean };

async function createEndpoint(workspaceSlug: string, ownerBearer: Record<string, string>) {
  const { body } = await api<EndpointBody>(`/v1/workspaces/${workspaceSlug}/webhooks`, {
    method: 'POST',
    headers: ownerBearer,
    body: JSON.stringify({ url: 'https://hooks.example.com/buzzkit', events: ['tenant.created'] }),
  });
  return body.data!;
}

describe('/v1/workspaces/:workspaceSlug/webhooks/:id', () => {
  it('reads, patches and deletes an endpoint', async () => {
    const { workspace, ownerBearer } = await setupWorkspace();
    const endpoint = await createEndpoint(workspace.slug, ownerBearer);
    expect(endpoint.id).toMatch(/^whk_/);

    const fetched = await api<EndpointBody>(`/v1/workspaces/${workspace.slug}/webhooks/${endpoint.id}`, {
      headers: ownerBearer,
    });
    expect(fetched.status).toBe(200);
    expect(fetched.body.data?.url).toBe('https://hooks.example.com/buzzkit');

    const patched = await api<EndpointBody>(`/v1/workspaces/${workspace.slug}/webhooks/${endpoint.id}`, {
      method: 'PATCH',
      headers: ownerBearer,
      body: JSON.stringify({ description: 'Billing sink' }),
    });
    expect(patched.status).toBe(200);
    expect(patched.body.data?.description).toBe('Billing sink');

    const unchanged = await api<EndpointBody>(`/v1/workspaces/${workspace.slug}/webhooks/${endpoint.id}`, {
      method: 'PATCH',
      headers: ownerBearer,
      body: '{}',
    });
    expect(unchanged.status).toBe(200);

    const deleted = await api(`/v1/workspaces/${workspace.slug}/webhooks/${endpoint.id}`, {
      method: 'DELETE',
      headers: ownerBearer,
    });
    expect(deleted.status).toBe(200);

    const gone = await api(`/v1/workspaces/${workspace.slug}/webhooks/${endpoint.id}`, {
      headers: ownerBearer,
    });
    expect(gone.status).toBe(404);
  });

  it('requires auth and answers 404 for malformed or foreign ids', async () => {
    const { workspace, ownerBearer } = await setupWorkspace();
    const outsider = await setupWorkspace();
    const endpoint = await createEndpoint(workspace.slug, ownerBearer);

    const unauthenticated = await api(`/v1/workspaces/${workspace.slug}/webhooks/${endpoint.id}`);
    expect(unauthenticated.status).toBe(401);

    const malformed = await api(`/v1/workspaces/${workspace.slug}/webhooks/not-a-sqid`, {
      headers: ownerBearer,
    });
    expect(malformed.status).toBe(404);

    const foreign = await api(`/v1/workspaces/${outsider.workspace.slug}/webhooks/${endpoint.id}`, {
      headers: outsider.ownerBearer,
    });
    expect(foreign.status).toBe(404);
  });
});
