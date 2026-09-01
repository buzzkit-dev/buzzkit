import { env } from 'cloudflare:workers';
import { listReconcilableAuditIds, listStaleDeliveryIds } from '@buzzkit/api/api/webhooks/deliveries';
import { sweep } from './sweep';

const SWEEP_LIMIT = 500;

export async function reconcileWebhooks(): Promise<void> {
  await sweep('webhooks', async (db) => {
    const auditIds = await listReconcilableAuditIds(db, SWEEP_LIMIT);
    for (const auditId of auditIds) {
      await env.WEBHOOKS.send({ kind: 'audit', auditId });
    }

    const deliveryIds = await listStaleDeliveryIds(db, SWEEP_LIMIT);
    for (const deliveryId of deliveryIds) {
      await env.WEBHOOKS.send({ kind: 'deliver', deliveryId });
    }

    return { reenqueuedEvents: auditIds.length, reenqueuedDeliveries: deliveryIds.length };
  });
}
