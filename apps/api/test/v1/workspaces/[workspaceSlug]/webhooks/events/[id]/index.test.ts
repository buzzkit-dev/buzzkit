import { describe, expect, it } from 'vitest';
import { api, type PageData } from '../../../../../../utils/api';
import { eventually } from '../../../../../../utils/eventually';
import { setupWorkspace, uniq } from '../../../../../../utils/setup';

type EventBody = { id: string; type: string; payload: Record<string, unknown> };

describe('GET /v1/workspaces/:workspaceSlug/webhooks/events/:id', () => {
  it('reads one webhook event object with its payload', async () => {
    const { workspace, ownerBearer, keyBearer } = await setupWorkspace();
    const created = await api<{ id: string }>(`/v1/workspaces/${workspace.slug}/webhooks`, {
      method: 'POST',
      headers: ownerBearer,
      body: JSON.stringify({ url: 'https://buzzkit-nowhere.invalid/hook', events: ['tenant.created'] }),
    });
    const endpointId = created.body.data?.id ?? '';
    await api('/v1/tenants', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ name: 'Hooked', slug: `hooked-${uniq()}` }),
    });

    const eventId = await eventually(
      async () => {
        const { body } = await api<PageData<{ eventId: string }>>(
          `/v1/workspaces/${workspace.slug}/webhooks/${endpointId}/deliveries`,
          { headers: ownerBearer }
        );
        return body.data?.items[0]?.eventId;
      },
      { label: 'webhook event recorded' }
    );

    const fetched = await api<EventBody>(`/v1/workspaces/${workspace.slug}/webhooks/events/${eventId}`, {
      headers: ownerBearer,
    });
    expect(fetched.status).toBe(200);
    expect(fetched.body.data?.type).toBe('tenant.created');
    expect(fetched.body.data?.payload).toBeDefined();
  });

  it('requires auth and answers 404 for malformed ids', async () => {
    const { workspace, ownerBearer } = await setupWorkspace();

    const unauthenticated = await api(`/v1/workspaces/${workspace.slug}/webhooks/events/whe_x`);
    expect(unauthenticated.status).toBe(401);

    const malformed = await api(`/v1/workspaces/${workspace.slug}/webhooks/events/not-a-sqid`, {
      headers: ownerBearer,
    });
    expect(malformed.status).toBe(404);
  });
});
