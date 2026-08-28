import { assertChannelConnected } from '@buzzkit/api/api/credentials/index';
import { recordSystemEvents, type SystemEvent, subscriberAttributes } from '@buzzkit/api/api/events/index';
import { BadRequestError, ConflictError, NotFoundError } from '@buzzkit/api/libs/error';
import {
  ChannelSchema,
  EmailSchema,
  EnvironmentSchema,
  IdentityHashSchema,
  PlatformSchema,
} from '@buzzkit/api/libs/schemas';
import { decodeEntityId } from '@buzzkit/api/libs/sqids';
import { trace } from '@buzzkit/api/libs/telemetry';
import { deepEqual } from '@buzzkit/api/utils/equality';
import { assertJsonSize } from '@buzzkit/api/utils/json';
import {
  and,
  asc,
  count,
  type Db,
  desc,
  eq,
  getTableColumns,
  inArray,
  isNull,
  lt,
  sql,
  tables,
} from '@buzzkit/database';
import { t } from 'elysia';

export type Subscriber = typeof tables.subscriber.$inferSelect;
export type Subscription = typeof tables.subscription.$inferSelect;
export type SubscriptionChannel = Subscription['channel'];

export const ExternalIdSchema = t.String({ minLength: 1, maxLength: 256 });

export const PushTokenSchema = t.String({ minLength: 8, maxLength: 1024 });

export const EmailAddressSchema = EmailSchema;

export const AttributesSchema = t.Record(t.String(), t.Any());

export const ClientIdentitySchema = t.Object({
  externalId: ExternalIdSchema,
  identityHash: t.Optional(IdentityHashSchema),
});

export const MAX_ATTRIBUTES_BYTES = 64 * 1024;

export function assertAttributesSize(attributes: Record<string, unknown> | undefined): void {
  assertJsonSize(attributes, MAX_ATTRIBUTES_BYTES, 'attributes must serialize to 64KB or less', {
    code: 'attributes_too_large',
    param: 'attributes',
  });
}

export const SubscriptionInputSchema = t.Object({
  channel: t.Optional(ChannelSchema),
  platform: t.Optional(PlatformSchema),
  environment: t.Optional(EnvironmentSchema),
  token: t.Optional(PushTokenSchema),
  address: t.Optional(EmailAddressSchema),
});

export type SubscriptionInput = typeof SubscriptionInputSchema.static;

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

export function resolveSubscriptionEventData(
  subscription: Pick<Subscription, 'channel' | 'platform' | 'endpoint' | 'enabled'>,
  externalId: string
) {
  return {
    externalId,
    channel: subscription.channel,
    platform: subscription.platform,
    endpoint: subscription.endpoint,
    enabled: subscription.enabled,
  };
}

export function serializeSubscription(subscription: Subscription) {
  return {
    id: subscription.id,
    subscriberId: subscription.subscriberId,
    channel: subscription.channel,
    platform: subscription.platform,
    environment: subscription.environment,
    endpoint: subscription.endpoint,
    enabled: subscription.enabled,
    status: subscription.status,
    lastSeenAt: subscription.lastSeenAt,
    createdAt: subscription.createdAt,
    updatedAt: subscription.updatedAt,
  };
}

export const SUBSCRIPTION_TOUCH_THROTTLE_MS = 5 * 60 * 1000;

export const IDENTITY_REVERIFY_THROTTLE_MS = 5 * 60 * 1000;

export const SYSTEM_ATTRIBUTE_PREFIX = '$';

export function assertNoSystemAttributes(attributes: Record<string, unknown> | undefined): void {
  if (!attributes) return;
  for (const key of Object.keys(attributes)) {
    if (key.startsWith(SYSTEM_ATTRIBUTE_PREFIX)) {
      throw new BadRequestError(`'${key}' is a system attribute and cannot be set through the API`, {
        code: 'system_attribute',
        param: 'attributes',
      });
    }
  }
}

export function resolveSystemAttributes(request: Request): Record<string, string> {
  const cf = (request as Request & { cf?: IncomingRequestCfProperties }).cf;
  const attributes: Record<string, string> = {};
  const country = cf?.country ?? request.headers.get('cf-ipcountry');
  if (country && country !== 'XX' && country !== 'T1') attributes.$country = country;
  if (cf?.city) attributes.$city = cf.city;
  if (cf?.region) attributes.$region = cf.region;
  if (cf?.timezone) attributes.$timezone = cf.timezone;
  const language = request.headers.get('accept-language')?.split(',')[0]?.trim();
  if (language && language !== '*') attributes.$language = language;
  return attributes;
}

function splitAttributes(attributes: Record<string, unknown>) {
  const custom: Record<string, unknown> = {};
  const system: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attributes)) {
    (key.startsWith(SYSTEM_ATTRIBUTE_PREFIX) ? system : custom)[key] = value;
  }
  return { custom, system };
}

type SubscriberInput = {
  attributes?: Record<string, unknown>;
  systemAttributes?: Record<string, unknown>;
  verifiedNow?: boolean;
};

function resolveAttributes(
  existing: Subscriber | null,
  input: SubscriberInput
): Record<string, unknown> | undefined {
  if (input.attributes === undefined && input.systemAttributes === undefined) return undefined;
  const current = splitAttributes((existing?.attributes ?? {}) as Record<string, unknown>);
  return {
    ...(input.attributes ?? current.custom),
    ...current.system,
    ...(input.systemAttributes ?? {}),
  };
}

function isSubscriberCurrent(existing: Subscriber, input: SubscriberInput, now: Date): boolean {
  const attributes = resolveAttributes(existing, input);
  if (attributes !== undefined && !deepEqual(existing.attributes, attributes)) return false;
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

    const attributes = resolveAttributes(existing, input);
    const [row] = await db
      .insert(tables.subscriber)
      .values({
        tenantId,
        externalId,
        attributes: attributes ?? {},
        ...(input.verifiedNow ? { identityVerifiedAt: now } : {}),
      })
      .onConflictDoUpdate({
        target: [tables.subscriber.tenantId, tables.subscriber.externalId],
        targetWhere: isNull(tables.subscriber.deletedAt),
        set: {
          ...(attributes !== undefined ? { attributes } : {}),
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

export async function findSubscriberById(db: Db, tenantId: number, id: number): Promise<Subscriber> {
  const [subscriber] = await trace(
    'subscribers.findById',
    async () =>
      await db
        .select()
        .from(tables.subscriber)
        .where(
          and(
            eq(tables.subscriber.tenantId, tenantId),
            eq(tables.subscriber.id, id),
            isNull(tables.subscriber.deletedAt)
          )
        )
  );

  if (!subscriber) {
    throw new NotFoundError('Subscriber not found');
  }

  return subscriber;
}

export type SubscriberListItem = Subscriber & {
  lastSeenAt: Date | null;
  channels: string[];
  platforms: string[];
};

export function serializeSubscriberListItem(item: SubscriberListItem) {
  return {
    ...serializeSubscriber(item),
    lastSeenAt: item.lastSeenAt,
    channels: item.channels,
    platforms: item.platforms,
  };
}

export async function listSubscribers(
  db: Db,
  tenantId: number,
  options: { limit: number; beforeId?: number; ids?: number[] }
): Promise<SubscriberListItem[]> {
  const live = sql`${tables.subscription.subscriberId} = ${tables.subscriber.id} and ${tables.subscription.deletedAt} is null`;
  const rows = await trace(
    'subscribers.list',
    async () =>
      await db
        .select({
          ...getTableColumns(tables.subscriber),
          lastSeenAt: sql<
            string | null
          >`(select max(${tables.subscription.lastSeenAt}) from ${tables.subscription} where ${live})`,
          channels: sql<
            string[] | null
          >`(select json_agg(distinct ${tables.subscription.channel}) from ${tables.subscription} where ${live})`,
          platforms: sql<
            string[] | null
          >`(select json_agg(distinct ${tables.subscription.platform}) from ${tables.subscription} where ${live} and ${tables.subscription.platform} is not null)`,
        })
        .from(tables.subscriber)
        .where(
          and(
            eq(tables.subscriber.tenantId, tenantId),
            isNull(tables.subscriber.deletedAt),
            options.beforeId ? lt(tables.subscriber.id, options.beforeId) : undefined,
            options.ids ? inArray(tables.subscriber.id, options.ids) : undefined
          )
        )
        .orderBy(desc(tables.subscriber.id))
        .limit(options.limit + 1)
  );

  return rows.map((row) => ({
    ...row,
    lastSeenAt: row.lastSeenAt ? new Date(row.lastSeenAt) : null,
    channels: row.channels ?? [],
    platforms: row.platforms ?? [],
  }));
}

export async function countSubscribers(db: Db, tenantId: number): Promise<number> {
  const [row] = await trace(
    'subscribers.count',
    async () =>
      await db
        .select({ total: count() })
        .from(tables.subscriber)
        .where(and(eq(tables.subscriber.tenantId, tenantId), isNull(tables.subscriber.deletedAt)))
  );
  return Number(row?.total ?? 0);
}

export async function softDeleteSubscriber(
  db: Db,
  subscriber: Subscriber
): Promise<{ subscriber: Subscriber; subscriptions: Subscription[] }> {
  return await trace('subscribers.softDelete', async () =>
    db.transaction(async (tx) => {
      const [deleted] = await tx
        .update(tables.subscriber)
        .set({ deletedAt: new Date() })
        .where(eq(tables.subscriber.id, subscriber.id))
        .returning();

      const subscriptions = await tx
        .update(tables.subscription)
        .set({ deletedAt: new Date() })
        .where(
          and(eq(tables.subscription.subscriberId, subscriber.id), isNull(tables.subscription.deletedAt))
        )
        .returning();

      return { subscriber: deleted!, subscriptions };
    })
  );
}

async function selectSubscriberById(db: Db, tenantId: number, id: number): Promise<Subscriber | null> {
  const [subscriber] = await db
    .select()
    .from(tables.subscriber)
    .where(and(eq(tables.subscriber.tenantId, tenantId), eq(tables.subscriber.id, id)));
  return subscriber ?? null;
}

function isSubscriptionCurrent(
  existing: Subscription,
  subscriberId: number,
  platform: Subscription['platform'],
  environment: Subscription['environment'],
  now: Date
): boolean {
  return (
    existing.subscriberId === subscriberId &&
    existing.platform === platform &&
    existing.environment === environment &&
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

export type SubscriptionRegistration = {
  subscription: Subscription;
  subscriptionCreated: boolean;
  subscriptionRegistered: boolean;
  movedFrom: { subscriber: Subscriber; subscription: Subscription } | null;
  subscriberCreated: boolean;
  subscriber: Subscriber;
};

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
  }
): Promise<SubscriptionRegistration> {
  await assertChannelConnected(db, tenantId, input.channel, 'channel');
  return await trace('subscriptions.register', async (t) => {
    const existing = await findExistingSubscription(db, tenantId, input.channel, input.endpoint);
    const owner = existing ? await selectSubscriberById(db, tenantId, existing.subscriberId) : null;

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

    const { subscriber, created: subscriberCreated } = input.subscriber
      ? { subscriber: input.subscriber, created: false }
      : await upsertSubscriber(db, tenantId, input.externalId, {
          verifiedNow: input.verifiedNow,
          systemAttributes: input.systemAttributes,
        });

    const now = new Date();

    if (
      existing &&
      isSubscriptionCurrent(existing, subscriber.id, input.platform, input.environment ?? 'production', now)
    ) {
      t.set('subscription.written', false);
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
        lastSeenAt: now,
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
          lastSeenAt: now,
          updatedAt: now,
        },
      })
      .returning({ ...getTableColumns(tables.subscription), inserted: sql<boolean>`(xmax = 0)` });

    t.set('subscription.written', true);
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

export async function listSubscriptionIds(db: Db, subscriberId: number): Promise<number[]> {
  const rows = await trace(
    'subscriptions.listIds',
    async () =>
      await db
        .select({ id: tables.subscription.id })
        .from(tables.subscription)
        .where(eq(tables.subscription.subscriberId, subscriberId))
  );
  return rows.map((row) => row.id);
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
    throw new NotFoundError('Subscription not found');
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

export async function updateSubscriptionEnabled(
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
