import { BadRequestError, NotFoundError } from '@buzzkit/api/libs/error';
import { decodeEntityId } from '@buzzkit/api/libs/sqids';
import { trace } from '@buzzkit/api/libs/telemetry';
import { deepEqual } from '@buzzkit/api/utils/equality';
import { and, asc, type Db, eq, getTableColumns, gt, isNull, sql, tables } from '@buzzkit/database';
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

export const SUBSCRIPTION_TOUCH_THROTTLE_MS = 5 * 60 * 1000;

export const IDENTITY_REVERIFY_THROTTLE_MS = 5 * 60 * 1000;

type SubscriberInput = { attributes?: Record<string, unknown>; verifiedNow?: boolean };

function isSubscriberCurrent(existing: Subscriber, input: SubscriberInput, now: Date): boolean {
  if (input.attributes !== undefined && !deepEqual(existing.attributes, input.attributes)) return false;
  if (
    input.verifiedNow &&
    (!existing.identityVerifiedAt ||
      now.getTime() - existing.identityVerifiedAt.getTime() > IDENTITY_REVERIFY_THROTTLE_MS)
  ) {
    return false;
  }
  return true;
}

async function findExistingSubscriber(
  db: Db,
  tenantId: number,
  externalId: string
): Promise<Subscriber | null> {
  const [subscriber] = await db
    .select()
    .from(tables.subscriber)
    .where(
      and(
        eq(tables.subscriber.tenantId, tenantId),
        eq(tables.subscriber.externalId, externalId),
        isNull(tables.subscriber.deletedAt)
      )
    );
  return subscriber ?? null;
}

export async function upsertSubscriber(
  db: Db,
  tenantId: number,
  externalId: string,
  input: SubscriberInput = {}
): Promise<{ subscriber: Subscriber; created: boolean; changed: boolean }> {
  assertAttributesSize(input.attributes);

  return await trace('subscribers.upsert', async (t) => {
    const now = new Date();
    const existing = await findExistingSubscriber(db, tenantId, externalId);

    if (existing && isSubscriberCurrent(existing, input, now)) {
      t.set('subscriber.written', false);
      return { subscriber: existing, created: false, changed: false };
    }

    const [row] = await db
      .insert(tables.subscriber)
      .values({
        tenantId,
        externalId,
        attributes: input.attributes ?? {},
        ...(input.verifiedNow ? { identityVerifiedAt: now } : {}),
      })
      .onConflictDoUpdate({
        target: [tables.subscriber.tenantId, tables.subscriber.externalId],
        targetWhere: isNull(tables.subscriber.deletedAt),
        set: {
          ...(input.attributes !== undefined ? { attributes: input.attributes } : {}),
          ...(input.verifiedNow ? { identityVerifiedAt: now } : {}),
          updatedAt: now,
        },
      })
      .returning({ ...getTableColumns(tables.subscriber), inserted: sql<boolean>`(xmax = 0)` });

    t.set('subscriber.written', true);
    const { inserted, ...subscriber } = row!;
    return { subscriber, created: inserted, changed: true };
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

function isSubscriptionCurrent(
  existing: Subscription,
  subscriberId: number,
  platform: 'ios' | 'android' | null,
  now: Date
): boolean {
  return (
    existing.subscriberId === subscriberId &&
    existing.platform === platform &&
    existing.status === 'active' &&
    now.getTime() - existing.lastSeenAt.getTime() < SUBSCRIPTION_TOUCH_THROTTLE_MS
  );
}

async function findExistingSubscription(
  db: Db,
  tenantId: number,
  channel: SubscriptionChannel,
  endpoint: string
): Promise<Subscription | null> {
  const [subscription] = await db
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
  return subscription ?? null;
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
    subscriber?: Subscriber;
  }
): Promise<{
  subscription: Subscription;
  subscriptionCreated: boolean;
  subscriberCreated: boolean;
  subscriber: Subscriber;
}> {
  return await trace('subscriptions.register', async (t) => {
    const { subscriber, created: subscriberCreated } = input.subscriber
      ? { subscriber: input.subscriber, created: false }
      : await upsertSubscriber(db, tenantId, input.externalId, { verifiedNow: input.verifiedNow });

    const now = new Date();
    const existing = await findExistingSubscription(db, tenantId, input.channel, input.endpoint);

    if (existing && isSubscriptionCurrent(existing, subscriber.id, input.platform, now)) {
      t.set('subscription.written', false);
      return { subscription: existing, subscriptionCreated: false, subscriberCreated, subscriber };
    }

    const [row] = await db
      .insert(tables.subscription)
      .values({
        tenantId,
        subscriberId: subscriber.id,
        channel: input.channel,
        platform: input.platform,
        endpoint: input.endpoint,
        lastSeenAt: now,
      })
      .onConflictDoUpdate({
        target: [tables.subscription.tenantId, tables.subscription.channel, tables.subscription.endpoint],
        targetWhere: isNull(tables.subscription.deletedAt),
        set: {
          subscriberId: subscriber.id,
          platform: input.platform,
          status: 'active',
          invalidatedAt: null,
          invalidationReason: null,
          lastSeenAt: now,
          updatedAt: now,
        },
      })
      .returning({ ...getTableColumns(tables.subscription), inserted: sql<boolean>`(xmax = 0)` });

    t.set('subscription.written', true);
    const { inserted, ...subscription } = row!;
    return { subscription, subscriptionCreated: inserted, subscriberCreated, subscriber };
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
