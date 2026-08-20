import { env } from 'cloudflare:workers';
import { decryptCredentialSecret } from '@buzzkit/api/api/credentials/index';
import {
  type AttemptApplication,
  applyAttemptResult,
  type Delivery,
  failDeliveriesImmediately,
  finalizeMessageIfComplete,
  systemEvent,
} from '@buzzkit/api/api/deliveries/index';
import { ExternalIdSchema } from '@buzzkit/api/api/subscribers/index';
import { resolveTenantSettings, type Tenant } from '@buzzkit/api/api/tenants/index';
import {
  CHANNELS,
  type Channel,
  findTopicBySlug,
  type Topic,
  TopicSlugSchema,
} from '@buzzkit/api/api/topics/index';
import { BadRequestError, NotFoundError } from '@buzzkit/api/libs/error';
import { decodeEntityId } from '@buzzkit/api/libs/sqids';
import { trace } from '@buzzkit/api/libs/telemetry';
import {
  type MessagePayload,
  PROVIDERS,
  type ProviderEnvironment,
  type ProviderName,
  PUSH_PROVIDER_BY_PLATFORM,
} from '@buzzkit/api/providers/index';
import { and, asc, type Db, desc, eq, gt, inArray, isNull, lt, ne, sql, tables } from '@buzzkit/database';
import { t } from 'elysia';

export type Message = typeof tables.message.$inferSelect;

export type MessageTargets = { to?: string[]; topic?: string };

export const MAX_DIRECT_TARGETS = 1000;
export const FANOUT_PAGE_SIZE = 500;
export const QUEUE_BATCH_SIZE = 100;
export const DEFAULT_TTL_SECONDS = 24 * 60 * 60;
export const MAX_TTL_SECONDS = 28 * 24 * 60 * 60;

export type DeliveryQueueMessage =
  | { type: 'fanout'; messageId: number; afterId: number }
  | { type: 'deliver'; deliveryId: number; attempt: number };

export const MessagePayloadSchema = t.Object({
  title: t.Optional(t.String({ maxLength: 500 })),
  body: t.Optional(t.String({ maxLength: 4000 })),
  subtitle: t.Optional(t.String({ maxLength: 500 })),
  badge: t.Optional(t.Integer({ minimum: 0 })),
  sound: t.Optional(t.String({ maxLength: 100 })),
  imageUrl: t.Optional(t.String({ format: 'uri', maxLength: 2048 })),
  data: t.Optional(t.Record(t.String(), t.Any())),
  collapseId: t.Optional(t.String({ maxLength: 64 })),
  priority: t.Optional(t.Union([t.Literal('high'), t.Literal('normal')])),
  apns: t.Optional(
    t.Object({
      environment: t.Optional(t.Union([t.Literal('production'), t.Literal('sandbox')])),
      payload: t.Optional(t.Record(t.String(), t.Any())),
    })
  ),
  fcm: t.Optional(
    t.Object({
      android: t.Optional(t.Record(t.String(), t.Any())),
      payload: t.Optional(t.Record(t.String(), t.Any())),
    })
  ),
});

export const CreateMessageSchema = t.Composite([
  t.Object({
    to: t.Optional(
      t.Union([ExternalIdSchema, t.Array(ExternalIdSchema, { minItems: 1, maxItems: MAX_DIRECT_TARGETS })])
    ),
    topic: t.Optional(TopicSlugSchema),
    channel: t.Optional(t.Union([t.Literal('push'), t.Literal('email')])),
    ttlSeconds: t.Optional(t.Integer({ minimum: 60, maximum: MAX_TTL_SECONDS })),
    idempotencyKey: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
  }),
  MessagePayloadSchema,
]);

export function serializeMessage(message: Message) {
  return {
    id: message.id,
    channel: message.channel,
    topic: message.topic,
    targets: message.targets,
    payload: message.payload,
    status: message.status,
    counts: {
      total: message.total,
      sent: message.sent,
      delivered: message.delivered,
      bounced: message.bounced,
      failed: message.failed,
      invalid: message.invalid,
    },
    idempotencyKey: message.idempotencyKey,
    expiresAt: message.expiresAt,
    createdAt: message.createdAt,
    completedAt: message.completedAt,
  };
}

function payloadFromInput(input: Record<string, unknown>): MessagePayload {
  const {
    to: _to,
    topic: _topic,
    channel: _channel,
    idempotencyKey: _key,
    ttlSeconds: _ttl,
    ...payload
  } = input;
  return payload as MessagePayload;
}

export async function createMessage(
  db: Db,
  tenant: Tenant,
  input: {
    to?: string | string[];
    topic?: string;
    channel?: Channel;
    ttlSeconds?: number;
    idempotencyKey?: string;
  } & MessagePayload
): Promise<{ message: Message; created: boolean }> {
  const channel: Channel = input.channel ?? 'push';
  if (!CHANNELS.includes(channel)) {
    throw new BadRequestError(`Unknown channel '${channel}'`);
  }
  if (channel !== 'push') {
    throw new BadRequestError(`Sending on the '${channel}' channel is not supported yet`);
  }

  const settings = resolveTenantSettings(tenant.settings);
  if (!settings.channels[channel].enabled) {
    throw new BadRequestError(`The '${channel}' channel is disabled for this tenant`);
  }

  const to =
    input.to === undefined ? undefined : Array.isArray(input.to) ? [...new Set(input.to)] : [input.to];
  if (!to && !input.topic) {
    throw new BadRequestError('Provide `to` (external ids) and/or `topic`');
  }

  if (input.title === undefined && input.body === undefined && input.data === undefined) {
    throw new BadRequestError('Provide at least a title, body, or data');
  }

  if (input.topic) {
    await findTopicBySlug(db, tenant.id, input.topic);
  }

  if (input.idempotencyKey) {
    const [existing] = await trace(
      'messages.findByIdempotencyKey',
      async () =>
        await db
          .select()
          .from(tables.message)
          .where(
            and(
              eq(tables.message.tenantId, tenant.id),
              eq(tables.message.idempotencyKey, input.idempotencyKey!),
              isNull(tables.message.deletedAt)
            )
          )
    );
    if (existing) {
      return { message: existing, created: false };
    }
  }

  const targets: MessageTargets = { ...(to ? { to } : {}), ...(input.topic ? { topic: input.topic } : {}) };
  const ttlSeconds = input.ttlSeconds ?? DEFAULT_TTL_SECONDS;

  const [message] = await trace(
    'messages.create',
    async () =>
      await db
        .insert(tables.message)
        .values({
          tenantId: tenant.id,
          channel,
          topic: input.topic ?? null,
          targets,
          payload: payloadFromInput(input as Record<string, unknown>),
          idempotencyKey: input.idempotencyKey ?? null,
          expiresAt: new Date(Date.now() + ttlSeconds * 1000),
        })
        .returning()
  );

  return { message: message!, created: true };
}

export async function enqueueFanout(messageId: number, afterId = 0): Promise<void> {
  await env.DELIVERIES.send({ type: 'fanout', messageId, afterId } satisfies DeliveryQueueMessage);
}

export async function enqueueDeliveries(jobs: Array<{ deliveryId: number; attempt: number }>): Promise<void> {
  for (let i = 0; i < jobs.length; i += QUEUE_BATCH_SIZE) {
    const batch = jobs.slice(i, i + QUEUE_BATCH_SIZE);
    await env.DELIVERIES.sendBatch(
      batch.map((job) => ({ body: { type: 'deliver', ...job } satisfies DeliveryQueueMessage }))
    );
  }
}

export async function listMessages(
  db: Db,
  tenantId: number,
  options: { limit: number; beforeId?: number }
): Promise<Message[]> {
  return await trace(
    'messages.list',
    async () =>
      await db
        .select()
        .from(tables.message)
        .where(
          and(
            eq(tables.message.tenantId, tenantId),
            isNull(tables.message.deletedAt),
            options.beforeId ? lt(tables.message.id, options.beforeId) : undefined
          )
        )
        .orderBy(desc(tables.message.id))
        .limit(options.limit + 1)
  );
}

export async function findMessage(db: Db, tenantId: number, messageSqid: string): Promise<Message> {
  const messageId = decodeEntityId('message', messageSqid);

  if (!messageId) {
    throw new BadRequestError('Invalid message identifier');
  }

  const [message] = await trace(
    'messages.find',
    async () =>
      await db
        .select()
        .from(tables.message)
        .where(
          and(
            eq(tables.message.id, messageId),
            eq(tables.message.tenantId, tenantId),
            isNull(tables.message.deletedAt)
          )
        )
  );

  if (!message) {
    throw new NotFoundError('Message not found');
  }

  return message;
}

function topicChannelDefault(topic: Topic, channel: Channel): boolean {
  const overrides = topic.channelDefaults as Partial<Record<Channel, boolean>>;
  return overrides[channel] ?? topic.defaultOptedIn;
}

async function resolveTargetPage(
  db: Db,
  message: Message,
  topic: Topic | null,
  afterId: number
): Promise<Array<{ subscriptionId: number; subscriberId: number; platform: 'ios' | 'android' | null }>> {
  const targets = message.targets as MessageTargets;
  const channel = message.channel as Channel;

  const conditions = [
    eq(tables.subscription.tenantId, message.tenantId),
    eq(tables.subscription.channel, channel),
    eq(tables.subscription.enabled, true),
    eq(tables.subscription.status, 'active'),
    isNull(tables.subscription.deletedAt),
    isNull(tables.subscriber.deletedAt),
    gt(tables.subscription.id, afterId),
  ];

  if (targets.to) {
    conditions.push(inArray(tables.subscriber.externalId, targets.to));
  }

  let query = db
    .select({
      subscriptionId: tables.subscription.id,
      subscriberId: tables.subscriber.id,
      platform: tables.subscription.platform,
    })
    .from(tables.subscription)
    .innerJoin(tables.subscriber, eq(tables.subscriber.id, tables.subscription.subscriberId))
    .$dynamic();

  if (topic) {
    const channelDefault = topicChannelDefault(topic, channel);
    query = query.leftJoin(
      tables.subscriberPreference,
      and(
        eq(tables.subscriberPreference.subscriberId, tables.subscriber.id),
        eq(tables.subscriberPreference.topicId, topic.id),
        eq(tables.subscriberPreference.channel, channel)
      )
    );
    conditions.push(sql`coalesce(${tables.subscriberPreference.optedIn}, ${channelDefault}) = true`);
  }

  return await query
    .where(and(...conditions))
    .orderBy(asc(tables.subscription.id))
    .limit(FANOUT_PAGE_SIZE);
}

async function providerHasCredential(db: Db, tenantId: number, provider: ProviderName): Promise<boolean> {
  const [row] = await db
    .select({ id: tables.credential.id })
    .from(tables.credential)
    .where(
      and(
        eq(tables.credential.tenantId, tenantId),
        eq(tables.credential.provider, provider),
        ne(tables.credential.status, 'invalid'),
        isNull(tables.credential.deletedAt)
      )
    )
    .limit(1);
  return row !== undefined;
}

async function completeFanout(db: Db, messageId: number): Promise<void> {
  await db
    .update(tables.message)
    .set({ fanoutCompletedAt: new Date() })
    .where(and(eq(tables.message.id, messageId), isNull(tables.message.fanoutCompletedAt)));
  await finalizeMessageIfComplete(db, messageId);
}

export async function fanoutPage(db: Db, messageId: number, afterId: number): Promise<void> {
  return await trace('messages.fanoutPage', async (t) => {
    t.set('message.id', messageId);
    t.set('fanout.afterId', afterId);
    return fanoutPageInner(db, messageId, afterId);
  });
}

async function fanoutPageInner(db: Db, messageId: number, afterId: number): Promise<void> {
  const [message] = await db.select().from(tables.message).where(eq(tables.message.id, messageId));
  if (!message || message.fanoutCompletedAt) return;
  if (afterId < message.fanoutCursor) return;

  if (message.status === 'queued') {
    await db.update(tables.message).set({ status: 'processing' }).where(eq(tables.message.id, message.id));
  }

  const targets = message.targets as MessageTargets;
  const topic = targets.topic
    ? ((
        await db
          .select()
          .from(tables.topic)
          .where(
            and(
              eq(tables.topic.tenantId, message.tenantId),
              eq(tables.topic.slug, targets.topic),
              isNull(tables.topic.deletedAt)
            )
          )
      )[0] ?? null)
    : null;

  if (targets.topic && !topic) {
    await completeFanout(db, message.id);
    return;
  }

  const page = await resolveTargetPage(db, message, topic, afterId);

  if (page.length === 0) {
    await completeFanout(db, message.id);
    return;
  }

  const availability = new Map<ProviderName, boolean>();
  const rows = [];
  for (const target of page) {
    const provider: ProviderName = target.platform ? PUSH_PROVIDER_BY_PLATFORM[target.platform] : 'apns';
    if (!availability.has(provider)) {
      availability.set(provider, await providerHasCredential(db, message.tenantId, provider));
    }
    rows.push({
      tenantId: message.tenantId,
      messageId: message.id,
      subscriberId: target.subscriberId,
      subscriptionId: target.subscriptionId,
      channel: message.channel,
      provider,
      status: 'pending' as const,
    });
  }

  const inserted = await db
    .insert(tables.delivery)
    .values(rows)
    .onConflictDoNothing({ target: [tables.delivery.messageId, tables.delivery.subscriptionId] })
    .returning({ id: tables.delivery.id, provider: tables.delivery.provider });

  const withoutCredential = inserted.filter((row) => !availability.get(row.provider as ProviderName));
  const failed = await failDeliveriesImmediately(
    db,
    withoutCredential.map((row) => row.id),
    'no_credential',
    'No credential configured for this provider'
  );

  const lastId = page[page.length - 1]!.subscriptionId;
  await db
    .update(tables.message)
    .set({
      total: sql`${tables.message.total} + ${inserted.length}`,
      failed: sql`${tables.message.failed} + ${failed}`,
      fanoutCursor: lastId,
    })
    .where(eq(tables.message.id, message.id));

  await enqueueDeliveries(
    inserted
      .filter((row) => availability.get(row.provider as ProviderName))
      .map((row) => ({ deliveryId: row.id, attempt: 1 }))
  );

  if (page.length < FANOUT_PAGE_SIZE) {
    await completeFanout(db, message.id);
    return;
  }

  await enqueueFanout(message.id, lastId);
}

type ResolvedCredential = {
  id: number;
  keyVersion: number;
  environment: ProviderEnvironment;
  details: Record<string, string>;
  secret: string;
};

export type CredentialMemo = Map<string, Promise<ResolvedCredential | null>>;

export function createCredentialMemo(): CredentialMemo {
  return new Map();
}

async function resolveCredential(
  db: Db,
  tenantId: number,
  provider: ProviderName,
  preferredEnvironment: ProviderEnvironment,
  memo?: CredentialMemo
): Promise<ResolvedCredential | null> {
  const memoKey = `${tenantId}:${provider}:${preferredEnvironment}`;
  const memoized = memo?.get(memoKey);
  if (memoized) return memoized;

  const pending = loadCredential(db, tenantId, provider, preferredEnvironment);
  memo?.set(memoKey, pending);
  return pending;
}

async function loadCredential(
  db: Db,
  tenantId: number,
  provider: ProviderName,
  preferredEnvironment: ProviderEnvironment
): Promise<ResolvedCredential | null> {
  const rows = await db
    .select()
    .from(tables.credential)
    .where(
      and(
        eq(tables.credential.tenantId, tenantId),
        eq(tables.credential.provider, provider),
        ne(tables.credential.status, 'invalid'),
        isNull(tables.credential.deletedAt)
      )
    );

  const credential = rows.find((row) => row.environment === preferredEnvironment) ?? rows[0];
  if (!credential) return null;

  return {
    id: credential.id,
    keyVersion: credential.keyVersion,
    environment: credential.environment,
    details: credential.details as Record<string, string>,
    secret: await decryptCredentialSecret(credential),
  };
}

export type DeliveryProcessingResult = {
  messageId: number;
  application: AttemptApplication | null;
};

export async function processDelivery(
  db: Db,
  deliveryId: number,
  expectedAttempt: number,
  memo?: CredentialMemo
): Promise<DeliveryProcessingResult | null> {
  return await trace('deliveries.process', async (t) => {
    t.set('delivery.id', deliveryId);
    t.set('delivery.attempt', expectedAttempt);
    return processDeliveryInner(db, deliveryId, expectedAttempt, memo);
  });
}

async function processDeliveryInner(
  db: Db,
  deliveryId: number,
  expectedAttempt: number,
  memo?: CredentialMemo
): Promise<DeliveryProcessingResult | null> {
  const [row] = await db
    .select({
      delivery: tables.delivery,
      message: tables.message,
      subscription: tables.subscription,
      subscriber: tables.subscriber,
    })
    .from(tables.delivery)
    .innerJoin(tables.message, eq(tables.message.id, tables.delivery.messageId))
    .innerJoin(tables.subscription, eq(tables.subscription.id, tables.delivery.subscriptionId))
    .innerJoin(tables.subscriber, eq(tables.subscriber.id, tables.delivery.subscriberId))
    .where(eq(tables.delivery.id, deliveryId));

  if (!row) return null;
  const { delivery, message, subscription, subscriber } = row;

  if (delivery.status !== 'pending' && delivery.status !== 'retrying') return null;
  if (delivery.attempts + 1 !== expectedAttempt) return null;

  if (message.expiresAt && message.expiresAt.getTime() < Date.now()) {
    await failDeliveriesImmediately(db, [delivery.id], 'expired', 'Message expired before delivery');
    return {
      messageId: message.id,
      application: { counterDelta: 'failed', retryDelaySeconds: null, invalidatedSubscriptionId: null },
    };
  }

  const provider = delivery.provider as ProviderName;
  const payload = message.payload as MessagePayload;
  const startedAt = new Date();

  const credential = await resolveCredential(
    db,
    delivery.tenantId,
    provider,
    payload.apns?.environment ?? 'production',
    memo
  );

  const result = credential
    ? await trace(`deliver.${provider}`, async () =>
        PROVIDERS[provider].send({
          credentialId: credential.id,
          keyVersion: credential.keyVersion,
          secret: credential.secret,
          details: credential.details,
          environment: credential.environment,
          endpoint: subscription.endpoint,
          payload,
          expiresAt: message.expiresAt,
        })
      )
    : ({
        ok: false,
        code: 'no_credential',
        reason: 'No credential configured for this provider',
        request: null,
        response: null,
        latencyMs: 0,
      } as const);

  const application = await applyAttemptResult(db, { delivery, provider, startedAt }, result);

  if (application?.invalidatedSubscriptionId) {
    await systemEvent(
      db,
      delivery.tenantId
    )({
      event: 'subscription.invalidated',
      tenantId: delivery.tenantId,
      target: { type: 'subscription', id: subscription.id },
      data: {
        externalId: subscriber.externalId,
        channel: subscription.channel,
        reason: result.ok ? null : result.reason,
      },
    });
  }

  return { messageId: message.id, application };
}

export type { Delivery };
