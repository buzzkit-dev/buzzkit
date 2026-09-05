import { assertChannelConnected } from '@buzzkit/api/api/credentials/index';
import { recordSystemEvents, type SystemEvent, subscriberAttributes } from '@buzzkit/api/api/events/index';
import { BadRequestError, ConflictError } from '@buzzkit/api/libs/error';
import { trace } from '@buzzkit/api/libs/telemetry';
import { and, type Db, eq, getTableColumns, isNull, sql, tables } from '@buzzkit/database';
import { SUBSCRIPTION_TOUCH_THROTTLE_MS } from './constants';
import { selectSubscriberById, upsertSubscriber } from './profile';
import type { SubscriptionInput } from './schemas';
import { resolveSubscriptionEventData } from './serialize';
import type { Subscriber, Subscription, SubscriptionChannel, SubscriptionRegistration } from './types';

export function resolveSubscriptionInput(input: SubscriptionInput): {
  channel: SubscriptionChannel;
  platform: Subscription['platform'];
  environment: Subscription['environment'];
  endpoint: string;
} {
  const channel = input.channel ?? (input.token ? 'push' : input.address ? 'email' : 'push');

  if (channel === 'push') {
    if (!input.token || !input.platform) {
      throw new BadRequestError('Push subscriptions require platform and token', {
        param: input.platform ? 'token' : 'platform',
      });
    }
    return {
      channel,
      platform: input.platform,
      environment: input.environment ?? 'production',
      endpoint: input.token,
    };
  }

  if (!input.address) {
    throw new BadRequestError('Email subscriptions require address', { param: 'address' });
  }
  return { channel, platform: null, environment: 'production', endpoint: input.address };
}

function isSubscriptionCurrent(
  existing: Subscription,
  subscriberId: number,
  platform: Subscription['platform'],
  environment: Subscription['environment'],
  seenAt: Date
): boolean {
  return (
    existing.subscriberId === subscriberId &&
    existing.platform === platform &&
    existing.environment === environment &&
    existing.status === 'active' &&
    seenAt.getTime() - existing.lastSeenAt.getTime() < SUBSCRIPTION_TOUCH_THROTTLE_MS
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
    platform: Subscription['platform'];
    environment?: Subscription['environment'];
    endpoint: string;
    verifiedNow?: boolean;
    systemAttributes?: Record<string, unknown>;
    subscriber?: Subscriber;
    rebind?: boolean;
    lastSeenAt?: Date;
    enabled?: boolean;
  }
): Promise<SubscriptionRegistration> {
  await assertChannelConnected(db, tenantId, input.channel, 'channel');

  return await trace('subscriptions.register', async (span) => {
    const existing = await findExistingSubscription(db, tenantId, input.channel, input.endpoint);
    let owner: Subscriber | null = null;
    if (existing) owner = await selectSubscriberById(db, tenantId, existing.subscriberId);

    if (existing && input.rebind === false) {
      const ownedByCaller = input.subscriber
        ? existing.subscriberId === input.subscriber.id
        : owner?.externalId === input.externalId;
      if (!ownedByCaller) {
        throw new ConflictError(
          'This endpoint belongs to another subscriber; a verified identity is required to move it',
          {
            code: 'endpoint_owned',
            param: 'endpoint',
          }
        );
      }
    }

    let subscriber: Subscriber;
    let subscriberCreated = false;
    if (input.subscriber) {
      subscriber = input.subscriber;
    } else {
      const upserted = await upsertSubscriber(db, tenantId, input.externalId, {
        verifiedNow: input.verifiedNow,
        systemAttributes: input.systemAttributes,
      });
      subscriber = upserted.subscriber;
      subscriberCreated = upserted.created;
    }

    const now = new Date();
    const seenAt = input.lastSeenAt ?? now;

    if (
      existing &&
      isSubscriptionCurrent(
        existing,
        subscriber.id,
        input.platform,
        input.environment ?? 'production',
        seenAt
      )
    ) {
      span.set('subscription.written', false);

      return {
        subscription: existing,
        subscriptionCreated: false,
        subscriptionRegistered: false,
        movedFrom: null,
        subscriberCreated,
        subscriber,
      };
    }

    const [row] = await db
      .insert(tables.subscription)
      .values({
        tenantId,
        subscriberId: subscriber.id,
        channel: input.channel,
        platform: input.platform,
        environment: input.environment ?? 'production',
        endpoint: input.endpoint,
        enabled: input.enabled ?? true,
        lastSeenAt: seenAt,
      })
      .onConflictDoUpdate({
        target: [tables.subscription.tenantId, tables.subscription.channel, tables.subscription.endpoint],
        targetWhere: isNull(tables.subscription.deletedAt),
        set: {
          subscriberId: subscriber.id,
          platform: input.platform,
          environment: input.environment ?? 'production',
          status: 'active',
          invalidatedAt: null,
          invalidationReason: null,
          lastSeenAt: sql`greatest(${tables.subscription.lastSeenAt}, ${seenAt.toISOString()}::timestamptz)`,
          updatedAt: now,
        },
      })
      .returning({ ...getTableColumns(tables.subscription), inserted: sql<boolean>`(xmax = 0)` });

    span.set('subscription.written', true);
    const { inserted, ...subscription } = row!;
    const moved = existing !== null && existing.subscriberId !== subscriber.id;
    const subscriptionRegistered =
      inserted ||
      moved ||
      existing!.platform !== subscription.platform ||
      existing!.environment !== subscription.environment ||
      existing!.status !== 'active';

    return {
      subscription,
      subscriptionCreated: inserted,
      subscriptionRegistered,
      movedFrom: moved && owner ? { subscriber: owner, subscription: existing! } : null,
      subscriberCreated,
      subscriber,
    };
  });
}

export async function recordRegistration(
  tenantId: number,
  registration: SubscriptionRegistration,
  preceding: SystemEvent[] = []
): Promise<void> {
  const { subscriber, subscription } = registration;
  const events: SystemEvent[] = [...preceding];
  if (registration.subscriberCreated) {
    events.unshift({
      name: 'subscriber.created',
      data: { externalId: subscriber.externalId, attributes: subscriberAttributes(subscriber) },
    });
  }
  if (registration.subscriptionRegistered) {
    events.push({
      name: 'subscription.registered',
      data: resolveSubscriptionEventData(subscription, subscriber.externalId),
    });
  }
  await recordSystemEvents(tenantId, subscriber, events);

  if (registration.movedFrom) {
    const previous = registration.movedFrom;
    await recordSystemEvents(tenantId, previous.subscriber, [
      {
        name: 'subscription.removed',
        data: resolveSubscriptionEventData(previous.subscription, previous.subscriber.externalId),
      },
    ]);
  }
}

export async function upsertSubscriberProfile(
  db: Db,
  tenantId: number,
  externalId: string,
  input: {
    upsert: Parameters<typeof upsertSubscriber>[3];
    email?: string;
    rebind?: boolean;
    events: (outcome: { subscriber: Subscriber; created: boolean; changed: boolean }) => SystemEvent[];
  }
): Promise<{ subscriber: Subscriber; created: boolean }> {
  if (input.email) await assertChannelConnected(db, tenantId, 'email', 'email');

  const { subscriber, created, changed } = await upsertSubscriber(db, tenantId, externalId, input.upsert);

  let registered: SubscriptionRegistration | null = null;
  if (input.email) {
    registered = await registerSubscription(db, tenantId, {
      subscriber,
      externalId: subscriber.externalId,
      channel: 'email',
      platform: null,
      endpoint: input.email,
      ...(input.rebind !== undefined ? { rebind: input.rebind } : {}),
    });
  }

  const events = input.events({ subscriber, created, changed });

  if (registered) await recordRegistration(tenantId, registered, events);
  else await recordSystemEvents(tenantId, subscriber, events);

  return { subscriber, created };
}
