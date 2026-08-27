import { describe, expect, it } from 'vitest';
import { api } from '../../../../utils/api';
import { db, desc, eq, tables } from '../../../../utils/db';
import { setupWorkspace, uniq } from '../../../../utils/setup';

describe('an unreachable receiver', () => {
  it('records one attempt per scheduled retry and never storms, even though workerd raises the failure as uncaught', async () => {
    const { owner, workspace } = await setupWorkspace({ bare: true });
    const url = `https://hooks.${uniq()}.acme-internal.dev/buzzkit`;
    const created = await api<{ id: string }>(`/v1/workspaces/${workspace.slug}/webhooks`, {
      method: 'POST',
      headers: owner.bearer,
      body: JSON.stringify({ url, events: ['tenant.created'] }),
    });
    expect(created.status).toBe(201);
    await api('/v1/tenants', {
      method: 'POST',
      headers: { ...owner.bearer, 'buzzkit-workspace': workspace.slug },
      body: JSON.stringify({ name: 'Acme', slug: `acme-${uniq()}` }),
    });

    await new Promise((resolve) => setTimeout(resolve, 20_000));

    const [endpoint] = await db
      .select({ id: tables.webhookEndpoint.id })
      .from(tables.webhookEndpoint)
      .where(eq(tables.webhookEndpoint.url, url))
      .orderBy(desc(tables.webhookEndpoint.id))
      .limit(1);
    const attempts = await db
      .select({ attempt: tables.webhookAttempt.attempt, error: tables.webhookAttempt.error })
      .from(tables.webhookAttempt)
      .innerJoin(tables.webhookDelivery, eq(tables.webhookDelivery.id, tables.webhookAttempt.deliveryId))
      .where(eq(tables.webhookDelivery.endpointId, endpoint!.id))
      .orderBy(tables.webhookAttempt.id);

    expect(attempts.length).toBeGreaterThanOrEqual(2);
    expect(attempts.length).toBeLessThanOrEqual(10);
    expect(attempts.map((entry) => entry.attempt)).toEqual(attempts.map((_, index) => index + 1));
    expect(attempts[0]!.error).toBe('Could not connect to the endpoint');
  }, 60_000);
});
