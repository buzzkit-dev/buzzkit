import { describe, expect, it } from 'vitest';
import { api, type PageData } from '../../../../../../../../utils/api';
import { eventually } from '../../../../../../../../utils/eventually';
import { setupWorkspace, uniq } from '../../../../../../../../utils/setup';

type DeliveryRow = { id: string; status: string; attempts: number };

describe('POST /v1/workspaces/:workspaceSlug/webhooks/:id/deliveries/:deliveryId/replay', () => {
  it('queues another attempt for a settled delivery', async () => {
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
    const delivery = await eventually(
      async () => {
        const { body } = await api<PageData<DeliveryRow>>(
          `/v1/workspaces/${workspace.slug}/webhooks/${endpointId}/deliveries`,
          { headers: ownerBearer }
        );
        const row = body.data?.items[0];
        return row && row.attempts >= 1 ? row : undefined;
      },
      { label: 'delivery attempted' }
    );

    const replayed = await api<DeliveryRow>(
      `/v1/workspaces/${workspace.slug}/webhooks/${endpointId}/deliveries/${delivery.id}/replay`,
      { method: 'POST', headers: ownerBearer }
    );
    expect([200, 202]).toContain(replayed.status);
  });

  it('requires auth and answers 404 for unknown deliveries', async () => {
    const { workspace, ownerBearer } = await setupWorkspace();
    const created = await api<{ id: string }>(`/v1/workspaces/${workspace.slug}/webhooks`, {
      method: 'POST',
      headers: ownerBearer,
      body: JSON.stringify({ url: 'https://hooks.example.com/x' }),
    });
    const endpointId = created.body.data?.id ?? '';

    const unauthenticated = await api(
      `/v1/workspaces/${workspace.slug}/webhooks/${endpointId}/deliveries/whd_x/replay`,
      { method: 'POST' }
    );
    expect(unauthenticated.status).toBe(401);

    const unknown = await api(
      `/v1/workspaces/${workspace.slug}/webhooks/${endpointId}/deliveries/not-a-sqid/replay`,
      { method: 'POST', headers: ownerBearer }
    );
    expect(unknown.status).toBe(404);
  });
});
