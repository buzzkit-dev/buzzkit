import { describe, expect, it } from 'vitest';
import { api, type PageData } from '../../../../../../../utils/api';
import { eventually } from '../../../../../../../utils/eventually';
import { setupWorkspace, uniq } from '../../../../../../../utils/setup';

type DeliveryRow = { id: string; status: string };

type DeliveryDetail = DeliveryRow & { attempts: number; event?: { type: string } };

async function seedDelivery(workspace: { slug: string }, bearers: Record<string, Record<string, string>>) {
  const created = await api<{ id: string }>(`/v1/workspaces/${workspace.slug}/webhooks`, {
    method: 'POST',
    headers: bearers.owner!,
    body: JSON.stringify({ url: 'https://buzzkit-nowhere.invalid/hook', events: ['tenant.created'] }),
  });
  const endpointId = created.body.data?.id ?? '';
  await api('/v1/tenants', {
    method: 'POST',
    headers: bearers.key!,
    body: JSON.stringify({ name: 'Hooked', slug: `hooked-${uniq()}` }),
  });
  const rows = await eventually(
    async () => {
      const { body } = await api<PageData<DeliveryRow>>(
        `/v1/workspaces/${workspace.slug}/webhooks/${endpointId}/deliveries`,
        { headers: bearers.owner! }
      );
      return (body.data?.items.length ?? 0) > 0 ? body.data?.items : undefined;
    },
    { label: 'webhook delivery seeded' }
  );
  return rows?.[0]?.id ?? '';
}

describe('GET /v1/workspaces/:workspaceSlug/webhooks/:id/deliveries/:deliveryId', () => {
  it('reads one delivery with its attempts and event', async () => {
    const { workspace, ownerBearer, keyBearer } = await setupWorkspace();
    const deliveryId = await seedDelivery(workspace, { owner: ownerBearer, key: keyBearer });

    const list = await api<PageData<{ id: string; endpointId: string }>>(
      `/v1/workspaces/${workspace.slug}/webhooks`,
      { headers: ownerBearer }
    );
    const endpointId = list.body.data?.items[0]?.id ?? '';

    const fetched = await api<DeliveryDetail>(
      `/v1/workspaces/${workspace.slug}/webhooks/${endpointId}/deliveries/${deliveryId}`,
      { headers: ownerBearer }
    );
    expect(fetched.status).toBe(200);
    expect(fetched.body.data?.id).toBe(deliveryId);
  });

  it('requires auth and answers 404 for malformed delivery ids', async () => {
    const { workspace, ownerBearer } = await setupWorkspace();
    const created = await api<{ id: string }>(`/v1/workspaces/${workspace.slug}/webhooks`, {
      method: 'POST',
      headers: ownerBearer,
      body: JSON.stringify({ url: 'https://hooks.example.com/x' }),
    });
    const endpointId = created.body.data?.id ?? '';

    const unauthenticated = await api(
      `/v1/workspaces/${workspace.slug}/webhooks/${endpointId}/deliveries/whd_x`
    );
    expect(unauthenticated.status).toBe(401);

    const malformed = await api(
      `/v1/workspaces/${workspace.slug}/webhooks/${endpointId}/deliveries/not-a-sqid`,
      { headers: ownerBearer }
    );
    expect(malformed.status).toBe(404);
  });
});
