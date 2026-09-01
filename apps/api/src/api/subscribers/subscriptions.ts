import { recordSystemEvents } from '@buzzkit/api/api/events/index';
import { NotFoundError } from '@buzzkit/api/libs/error';
import { decodeEntityId } from '@buzzkit/api/libs/sqids';
import { trace } from '@buzzkit/api/libs/telemetry';
import { and, asc, type Db, eq, isNull, tables } from '@buzzkit/database';
import { findSubscriberByExternalId } from './profile';
import { resolveSubscriptionEventData } from './serialize';
import type { Subscription, SubscriptionChannel } from './types';

export async function findSubscription(
  db: Db,
  tenantId: number,
  subscriptionSqid: string
): Promise<Subscription> {
  const subscriptionId = decodeEntityId('subscription', subscriptionSqid);
  if (!subscriptionId) {
    throw new NotFoundError('Subscription not found');
  }

  const [subscription] = await trace('subscriptions.find', async () => {
    return await db
      .select()
      .from(tables.subscription)
      .where(
        and(
          eq(tables.subscription.id, subscriptionId),
          eq(tables.subscription.tenantId, tenantId),
          isNull(tables.subscription.deletedAt)
        )
      );
  });

  if (!subscription) {
    throw new NotFoundError('Subscription not found');
  }
  return subscription;
}

export async function findSubscriptionByEndpoint(
  db: Db,
  tenantId: number,
  channel: SubscriptionChannel,
  endpoint: string
): Promise<Subscription> {
  const [subscription] = await trace('subscriptions.findByEndpoint', async () => {
    return await db
      .select()
      .from(tables.subscription)
      .where(
        and(
          eq(tables.subscription.tenantId, tenantId),
          eq(tables.subscription.channel, channel),
          eq(tables.subscription.endpoint, endpoint),
          isNull(tables.subscription.deletedAt)
        )
      );
  });

  if (!subscription) {
    throw new NotFoundError('Subscription not found');
  }
  return subscription;
}

export async function findSubscriptionOwnedBy(
  db: Db,
  tenantId: number,
  externalId: string,
  subscriptionSqid: string
): Promise<Subscription> {
  const subscriber = await findSubscriberByExternalId(db, tenantId, externalId);
  const subscription = await findSubscription(db, tenantId, subscriptionSqid);
  if (subscription.subscriberId !== subscriber.id) {
    throw new NotFoundError('Subscription not found');
  }
  return subscription;
}

export async function listSubscriptions(db: Db, subscriberId: number): Promise<Subscription[]> {
  return await trace('subscriptions.list', async () => {
    return await db
      .select()
      .from(tables.subscription)
      .where(and(eq(tables.subscription.subscriberId, subscriberId), isNull(tables.subscription.deletedAt)))
      .orderBy(asc(tables.subscription.id));
  });
}

export async function listSubscriptionIds(db: Db, subscriberId: number): Promise<number[]> {
  const rows = await trace('subscriptions.listIds', async () => {
    return await db
      .select({ id: tables.subscription.id })
      .from(tables.subscription)
      .where(eq(tables.subscription.subscriberId, subscriberId));
  });
  return rows.map((row) => row.id);
}

export async function updateSubscriptionEnabled(
  db: Db,
  tenantId: number,
  subscription: Subscription,
  owner: { id: number; externalId: string },
  enabled: boolean
): Promise<Subscription> {
  const [updated] = await trace('subscriptions.updateEnabled', async () => {
    return await db
      .update(tables.subscription)
      .set({ enabled })
      .where(eq(tables.subscription.id, subscription.id))
      .returning();
  });

  if (subscription.enabled !== enabled) {
    await recordSystemEvents(tenantId, owner, [
      {
        name: enabled ? 'subscription.unmuted' : 'subscription.muted',
        data: resolveSubscriptionEventData(updated!, owner.externalId),
      },
    ]);
  }
  return updated!;
}

export async function softDeleteSubscription(
  db: Db,
  tenantId: number,
  subscription: Subscription,
  owner: { id: number; externalId: string }
): Promise<Subscription> {
  const [deleted] = await trace('subscriptions.softDelete', async () => {
    return await db
      .update(tables.subscription)
      .set({ deletedAt: new Date() })
      .where(eq(tables.subscription.id, subscription.id))
      .returning();
  });

  await recordSystemEvents(tenantId, owner, [
    { name: 'subscription.removed', data: resolveSubscriptionEventData(subscription, owner.externalId) },
  ]);
  return deleted!;
}
