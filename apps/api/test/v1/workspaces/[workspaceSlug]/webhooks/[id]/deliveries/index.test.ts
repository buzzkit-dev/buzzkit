import { describe, expect, it } from 'vitest';
import { api, type PageData } from '../../../../../../utils/api';
import { eventually } from '../../../../../../utils/eventually';
import { setupWorkspace, uniq } from '../../../../../../utils/setup';

type DeliveryRow = { id: string; eventId: string; eventType: string | null; status: string };

describe('GET /v1/workspaces/:workspaceSlug/webhooks/:id/deliveries', () => {
  it('lists the deliveries an audit event produced for the endpoint', async () => {
    const { workspace, ownerBearer, keyBearer } = await setupWorkspace();
    const created = await api<{ id: string }>(`/v1/workspaces/${workspace.slug}/webhooks`, {
      method: 'POST',
      headers: ownerBearer,
      body: JSON.stringify({
        url: 'https://buzzkit-nowhere.invalid/hook',
        events: ['tenant.created'],
      }),
    });
    const endpointId = created.body.data?.id ?? '';
    await api('/v1/tenants', {
      method: 'POST',
      headers: keyBearer,
      body: JSON.stringify({ name: 'Hooked', slug: `hooked-${uniq()}` }),
    });

    const rows = await eventually(
      async () => {
        const { body } = await api<PageData<DeliveryRow>>(
          `/v1/workspaces/${workspace.slug}/webhooks/${endpointId}/deliveries`,
          { headers: ownerBearer }
        );
        return (body.data?.items.length ?? 0) > 0 ? body.data?.items : undefined;
      },
      { label: 'webhook delivery listed' }
    );

    expect(rows?.[0]?.id).toMatch(/^whd_/);
    expect(rows?.[0]?.eventType).toBe('tenant.created');
  });

  it('requires auth and answers 404 for unknown endpoints', async () => {
    const { workspace, ownerBearer } = await setupWorkspace();

    const unauthenticated = await api(`/v1/workspaces/${workspace.slug}/webhooks/wh_x/deliveries`);
    expect(unauthenticated.status).toBe(401);

    const unknown = await api(`/v1/workspaces/${workspace.slug}/webhooks/not-a-sqid/deliveries`, {
      headers: ownerBearer,
    });
    expect(unknown.status).toBe(404);
  });
});
