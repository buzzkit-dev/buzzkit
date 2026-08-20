import { BadRequestError, NotFoundError } from '@buzzkit/api/libs/error';
import { decodeEntityId } from '@buzzkit/api/libs/sqids';
import { trace } from '@buzzkit/api/libs/telemetry';
import { and, asc, type Db, eq, gt, isNull, tables } from '@buzzkit/database';
import { t } from 'elysia';

export type Subscriber = typeof tables.subscriber.$inferSelect;
export type Subscription = typeof tables.subscription.$inferSelect;
export type SubscriptionChannel = Subscription['channel'];

export const ExternalIdSchema = t.String({ minLength: 1, maxLength: 256 });

export const PushTokenSchema = t.String({ minLength: 8, maxLength: 4096 });

export const EmailAddressSchema = t.String({ format: 'email', maxLength: 254 });

export const AttributesSchema = t.Record(t.String(), t.Any());

export const MAX_ATTRIBUTES_BYTES = 64 * 1024;

export function assertAttributesSize(attributes: Record<string, unknown> | undefined): void {
  if (attributes === undefined) return;
  if (new TextEncoder().encode(JSON.stringify(attributes)).byteLength > MAX_ATTRIBUTES_BYTES) {
    throw new BadRequestError('attributes must serialize to 64KB or less');
  }
}

export const SubscriptionInputSchema = t.Object({
  channel: t.Optional(t.Union([t.Literal('push'), t.Literal('email')])),
  platform: t.Optional(t.Union([t.Literal('ios'), t.Literal('android')])),
  token: t.Optional(PushTokenSchema),
  address: t.Optional(EmailAddressSchema),
});

export type SubscriptionInput = {
  channel?: 'push' | 'email';
  platform?: 'ios' | 'android';
  token?: string;
  address?: string;
};

export function resolveSubscriptionInput(input: SubscriptionInput): {
  channel: SubscriptionChannel;
  platform: 'ios' | 'android' | null;
  endpoint: string;
} {
  const channel = input.channel ?? (input.token ? 'push' : input.address ? 'email' : 'push');

  if (channel === 'push') {
    if (!input.token || !input.platform) {
      throw new BadRequestError('Push subscriptions require platform and token');
    }
    return { channel, platform: input.platform, endpoint: input.token };
  }

  if (!input.address) {
    throw new BadRequestError('Email subscriptions require address');
  }
  return { channel, platform: null, endpoint: input.address };
}

export function serializeSubscriber(subscriber: Subscriber) {
  return {
    id: subscriber.id,
    externalId: subscriber.externalId,
    attributes: subscriber.attributes,
    verified: subscriber.identityVerifiedAt !== null,
    identityVerifiedAt: subscriber.identityVerifiedAt,
    createdAt: subscriber.createdAt,
    updatedAt: subscriber.updatedAt,
  };
}

export function serializeSubscription(subscription: Subscription) {
  return {
    id: subscription.id,
    subscriberId: subscription.subscriberId,
    channel: subscription.channel,
    platform: subscription.platform,
    endpoint: subscription.endpoint,
    enabled: subscription.enabled,
    status: subscription.status,
    lastSeenAt: subscription.lastSeenAt,
    createdAt: subscription.createdAt,
  };
}

export async function upsertSubscriber(
  db: Db,
  tenantId: number,
  externalId: string,
  input: { attributes?: Record<string, unknown>; verifiedNow?: boolean } = {}
): Promise<{ subscriber: Subscriber; created: boolean }> {
  assertAttributesSize(input.attributes);

  return await trace('subscribers.upsert', async () => {
    const [existing] = await db
      .select()
      .from(tables.subscriber)
      .where(
        and(
          eq(tables.subscriber.tenantId, tenantId),
          eq(tables.subscriber.externalId, externalId),
          isNull(tables.subscriber.deletedAt)
        )
      );

    const verifiedPatch = input.verifiedNow ? { identityVerifiedAt: new Date() } : {};

    if (existing) {
      if (input.attributes === undefined && !input.verifiedNow) {
        return { subscriber: existing, created: false };
      }

      const [updated] = await db
        .update(tables.subscriber)
        .set({
          ...(input.attributes !== undefined ? { attributes: input.attributes } : {}),
          ...verifiedPatch,
        })
        .where(eq(tables.subscriber.id, existing.id))
        .returning();

      return { subscriber: updated!, created: false };
    }

    const [created] = await db
      .insert(tables.subscriber)
      .values({ tenantId, externalId, attributes: input.attributes ?? {}, ...verifiedPatch })
      .returning();

    return { subscriber: created!, created: true };
  });
}

export async function findSubscriberByExternalId(
  db: Db,
  tenantId: number,
  externalId: string
): Promise<Subscriber> {
  const [subscriber] = await trace(
    'subscribers.findByExternalId',
    async () =>
      await db
        .select()
        .from(tables.subscriber)
        .where(
          and(
            eq(tables.subscriber.tenantId, tenantId),
            eq(tables.subscriber.externalId, externalId),
            isNull(tables.subscriber.deletedAt)
          )
        )
  );

  if (!subscriber) {
    throw new NotFoundError('Subscriber not found');
  }

  return subscriber;
}

export async function listSubscribers(
  db: Db,
  tenantId: number,
  options: { limit: number; afterId?: number }
): Promise<Subscriber[]> {
  return await trace(
    'subscribers.list',
    async () =>
      await db
        .select()
        .from(tables.subscriber)
        .where(
          and(
            eq(tables.subscriber.tenantId, tenantId),
            isNull(tables.subscriber.deletedAt),
            options.afterId ? gt(tables.subscriber.id, options.afterId) : undefined
          )
        )
        .orderBy(asc(tables.subscriber.id))
        .limit(options.limit + 1)
  );
}

export async function softDeleteSubscriber(db: Db, subscriber: Subscriber): Promise<Subscriber> {
  return await trace('subscribers.softDelete', async () =>
    db.transaction(async (tx) => {
      const [deleted] = await tx
        .update(tables.subscriber)
        .set({ deletedAt: new Date() })
        .where(eq(tables.subscriber.id, subscriber.id))
        .returning();

      await tx
        .update(tables.subscription)
        .set({ deletedAt: new Date() })
        .where(
          and(eq(tables.subscription.subscriberId, subscriber.id), isNull(tables.subscription.deletedAt))
        );

      return deleted!;
    })
  );
}

export async function registerSubscription(
  db: Db,
  tenantId: number,
  input: {
    externalId: string;
    channel: SubscriptionChannel;
    platform: 'ios' | 'android' | null;
    endpoint: string;
    verifiedNow?: boolean;
  }
): Promise<{
  subscription: Subscription;
  subscriptionCreated: boolean;
  subscriberCreated: boolean;
  subscriber: Subscriber;
}> {
  return await trace('subscriptions.register', async () => {
    const { subscriber, created: subscriberCreated } = await upsertSubscriber(
      db,
      tenantId,
      input.externalId,
      { verifiedNow: input.verifiedNow }
    );

    const [existing] = await db
      .select()
      .from(tables.subscription)
      .where(
        and(
          eq(tables.subscription.tenantId, tenantId),
          eq(tables.subscription.channel, input.channel),
          eq(tables.subscription.endpoint, input.endpoint),
          isNull(tables.subscription.deletedAt)
        )
      );

    if (existing) {
      const [updated] = await db
        .update(tables.subscription)
        .set({
          subscriberId: subscriber.id,
          platform: input.platform,
          status: 'active',
          lastSeenAt: new Date(),
          invalidatedAt: null,
          invalidationReason: null,
        })
        .where(eq(tables.subscription.id, existing.id))
        .returning();

      return { subscription: updated!, subscriptionCreated: false, subscriberCreated, subscriber };
    }

    const [created] = await db
      .insert(tables.subscription)
      .values({
        tenantId,
        subscriberId: subscriber.id,
        channel: input.channel,
        platform: input.platform,
        endpoint: input.endpoint,
      })
      .returning();

    return { subscription: created!, subscriptionCreated: true, subscriberCreated, subscriber };
  });
}

export async function listSubscriptions(db: Db, subscriberId: number): Promise<Subscription[]> {
  return await trace(
    'subscriptions.list',
    async () =>
      await db
        .select()
        .from(tables.subscription)
        .where(and(eq(tables.subscription.subscriberId, subscriberId), isNull(tables.subscription.deletedAt)))
        .orderBy(asc(tables.subscription.id))
  );
}

export async function findSubscription(
  db: Db,
  tenantId: number,
  subscriptionSqid: string
): Promise<Subscription> {
  const subscriptionId = decodeEntityId('subscription', subscriptionSqid);

  if (!subscriptionId) {
    throw new BadRequestError('Invalid subscription identifier');
  }

  const [subscription] = await trace(
    'subscriptions.find',
    async () =>
      await db
        .select()
        .from(tables.subscription)
        .where(
          and(
            eq(tables.subscription.id, subscriptionId),
            eq(tables.subscription.tenantId, tenantId),
            isNull(tables.subscription.deletedAt)
          )
        )
  );

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
  const [subscription] = await trace(
    'subscriptions.findByEndpoint',
    async () =>
      await db
        .select()
        .from(tables.subscription)
        .where(
          and(
            eq(tables.subscription.tenantId, tenantId),
            eq(tables.subscription.channel, channel),
            eq(tables.subscription.endpoint, endpoint),
            isNull(tables.subscription.deletedAt)
          )
        )
  );

  if (!subscription) {
    throw new NotFoundError('Subscription not found');
  }

  return subscription;
}

export async function setSubscriptionEnabled(
  db: Db,
  subscriptionId: number,
  enabled: boolean
): Promise<Subscription> {
  const [updated] = await trace(
    'subscriptions.setEnabled',
    async () =>
      await db
        .update(tables.subscription)
        .set({ enabled })
        .where(eq(tables.subscription.id, subscriptionId))
        .returning()
  );

  return updated!;
}

export async function softDeleteSubscription(db: Db, subscriptionId: number): Promise<Subscription> {
  const [deleted] = await trace(
    'subscriptions.softDelete',
    async () =>
      await db
        .update(tables.subscription)
        .set({ deletedAt: new Date() })
        .where(eq(tables.subscription.id, subscriptionId))
        .returning()
  );

  return deleted!;
}
