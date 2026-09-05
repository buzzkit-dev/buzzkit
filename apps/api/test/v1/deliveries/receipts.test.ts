import { beforeAll, describe, expect, it } from 'vitest';
import { api } from '../../utils/api';
import { db, eq, tables } from '../../utils/db';
import { encodeMessageId } from '../../utils/ids';
import { createClientKey, setupWorkspace, uniq } from '../../utils/setup';

type Headers = Record<string, string>;

let headers: Headers;
let clientHeaders: Headers;

async function subscribe(externalId: string, token?: string) {
  await api('/v1/subscriptions', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      externalId,
      channel: 'push',
      platform: 'ios',
      environment: 'sandbox',
      token: token ?? 'a'.repeat(64),
    }),
  });
  const [row] = await db
    .select({
      tenantId: tables.subscription.tenantId,
      subscriberId: tables.subscription.subscriberId,
      subscriptionId: tables.subscription.id,
    })
    .from(tables.subscription)
    .innerJoin(tables.subscriber, eq(tables.subscriber.id, tables.subscription.subscriberId))
    .where(eq(tables.subscriber.externalId, externalId));
  return row!;
}

async function seedSentDelivery(externalId: string) {
  const target = await subscribe(externalId);
  const [message] = await db
    .insert(tables.message)
    .values({
      tenantId: target.tenantId,
      channel: 'push',
      status: 'completed',
      targets: { to: [externalId] },
      payload: { title: 'Hello', body: 'World' },
      total: 1,
      sent: 1,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    })
    .returning({ id: tables.message.id });

  const [delivery] = await db
    .insert(tables.delivery)
    .values({
      tenantId: target.tenantId,
      messageId: message!.id,
      subscriberId: target.subscriberId,
      subscriptionId: target.subscriptionId,
      channel: 'push',
      provider: 'apns',
      status: 'sent',
      attempts: 1,
      sentAt: new Date(),
    })
    .returning({ id: tables.delivery.id });

  return { messageSqid: encodeMessageId(message!.id), deliveryId: delivery!.id };
}

async function deliveryRow(id: number) {
  const [row] = await db.select().from(tables.delivery).where(eq(tables.delivery.id, id));
  return row!;
}

async function track(externalId: string, data: Record<string, unknown>) {
  return await api('/v1/client/events', {
    method: 'POST',
    headers: clientHeaders,
    body: JSON.stringify({
      externalId,
      source: 'ios',
      events: [{ name: '$notification.delivered', data }],
    }),
  });
}

beforeAll(async () => {
  const workspace = await setupWorkspace();
  headers = { ...workspace.keyBearer, 'Content-Type': 'application/json' };
  const clientKey = await createClientKey(workspace.owner.token, workspace.workspace.slug, 'default');
  clientHeaders = { Authorization: `Bearer ${clientKey.secret}`, 'Content-Type': 'application/json' };
});

describe('$notification.delivered promotes the delivery', () => {
  it('marks a sent delivery delivered when the device reports it', async () => {
    const externalId = `receipt-${uniq()}`;
    const { messageSqid, deliveryId } = await seedSentDelivery(externalId);

    await track(externalId, { messageId: messageSqid });

    const row = await deliveryRow(deliveryId);
    expect(row.status).toBe('delivered');
    expect(row.settledAt).not.toBeNull();

    const { body } = await api<{ counts: { delivered: number; sent: number } }>(
      `/v1/messages/${messageSqid}`,
      { headers }
    );
    expect(body.data?.counts.delivered).toBe(1);
  });

  it('is idempotent and ignores an unknown message id', async () => {
    const externalId = `receipt-${uniq()}`;
    const { messageSqid, deliveryId } = await seedSentDelivery(externalId);

    await track(externalId, { messageId: messageSqid });
    await track(externalId, { messageId: messageSqid });
    const unknown = await track(externalId, { messageId: 'msg_nope' });
    expect(unknown.status).toBe(202);

    expect((await deliveryRow(deliveryId)).status).toBe('delivered');

    const { body } = await api<{ counts: { delivered: number } }>(`/v1/messages/${messageSqid}`, {
      headers,
    });
    expect(body.data?.counts.delivered).toBe(1);
  });

  it('leaves another subscriber delivery on the same message alone', async () => {
    const mine = `receipt-${uniq()}`;
    const other = `receipt-${uniq()}`;
    const { messageSqid, deliveryId } = await seedSentDelivery(mine);
    const target = await subscribe(other, 'b'.repeat(64));
    const [untouched] = await db
      .insert(tables.delivery)
      .values({
        tenantId: target.tenantId,
        messageId: (await deliveryRow(deliveryId)).messageId,
        subscriberId: target.subscriberId,
        subscriptionId: target.subscriptionId,
        channel: 'push',
        provider: 'apns',
        status: 'sent',
        attempts: 1,
        sentAt: new Date(),
      })
      .returning({ id: tables.delivery.id });

    await track(mine, { messageId: messageSqid });

    expect((await deliveryRow(deliveryId)).status).toBe('delivered');
    expect((await deliveryRow(untouched!.id)).status).toBe('sent');
  });
});
