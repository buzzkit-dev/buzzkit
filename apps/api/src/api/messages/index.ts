import { env } from 'cloudflare:workers';
import { decryptCredentialSecret } from '@buzzkit/api/api/credentials/index';
import {
  type AttemptOutcome,
  applyAttemptResults,
  claimDeliveryAttempts,
  type Delivery,
  type DeliveryJob,
  failDeliveriesImmediately,
  finalizeMessageIfComplete,
} from '@buzzkit/api/api/deliveries/index';
import { SEND_CONCURRENCY, STALLED_FANOUT_MINUTES } from '@buzzkit/api/api/deliveries/policy';
import { recordSystemEvents } from '@buzzkit/api/api/events/index';
import { ExternalIdSchema, type Subscriber, type Subscription } from '@buzzkit/api/api/subscribers/index';
import { resolveTenantSettings, type Tenant } from '@buzzkit/api/api/tenants/index';
import {
  CHANNELS,
  type Channel,
  findTopicBySlug,
  type Topic,
  TopicSlugSchema,
  topicDefault,
} from '@buzzkit/api/api/topics/index';
import { sha256Hex } from '@buzzkit/api/libs/crypto';
import { BadRequestError, ConflictError, NotFoundError } from '@buzzkit/api/libs/error';
import { ChannelSchema, UrlSchema } from '@buzzkit/api/libs/schemas';
import { decodeEntityId } from '@buzzkit/api/libs/sqids';
import { trace } from '@buzzkit/api/libs/telemetry';
import {
  type MessagePayload,
  PROVIDERS,
  type ProviderEnvironment,
  type ProviderName,
  PUSH_PROVIDER_BY_PLATFORM,
} from '@buzzkit/api/providers/index';
import type { TokenMemo } from '@buzzkit/api/providers/shared/cache';
import { assertJsonSize, stableStringify } from '@buzzkit/api/utils/json';
import { and, asc, type Db, desc, eq, gt, inArray, isNull, lt, ne, sql, tables } from '@buzzkit/database';
import { t } from 'elysia';

export type Message = typeof tables.message.$inferSelect;

export type MessageTargets = { to?: string[]; topic?: string };

export const MAX_DIRECT_TARGETS = 1000;
export const MAX_PAYLOAD_BYTES = 8 * 1024;
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
  imageUrl: t.Optional(UrlSchema),
  data: t.Optional(t.Record(t.String(), t.Any())),
  collapseId: t.Optional(t.String({ maxLength: 64 })),
  priority: t.Optional(t.Union([t.Literal('high'), t.Literal('normal')])),
  apns: t.Optional(
    t.Object({
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
    channel: t.Optional(ChannelSchema),
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
      pending: Math.max(0, message.total - message.sent - message.failed - message.invalid),
      sent: message.sent,
      delivered: message.delivered,
      bounced: message.bounced,
      failed: message.failed,
      invalid: message.invalid,
    },
    idempotencyKey: message.idempotencyKey,
    expiresAt: message.expiresAt,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
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
    throw new BadRequestError(`Unknown channel '${channel}'`, { code: 'channel_unknown', param: 'channel' });
  }
  if (channel !== 'push') {
    throw new BadRequestError(`Sending on the '${channel}' channel is not supported yet`, {
      code: 'channel_unsupported',
      param: 'channel',
    });
  }

  const settings = resolveTenantSettings(tenant.settings);
  if (!settings.channels[channel].enabled) {
    throw new BadRequestError(`The '${channel}' channel is disabled for this tenant`, {
      code: 'channel_disabled',
      param: 'channel',
    });
  }

  const to =
    input.to === undefined ? undefined : Array.isArray(input.to) ? [...new Set(input.to)] : [input.to];
  if (!to && !input.topic) {
    throw new BadRequestError('Provide `to` (external ids) and/or `topic`', {
      code: 'targets_missing',
      param: 'to',
    });
  }

  if (input.title === undefined && input.body === undefined && input.data === undefined) {
    throw new BadRequestError('Provide at least a title, body, or data', {
      code: 'payload_missing',
      param: 'body',
    });
  }

  const topic = input.topic ? await findTopicBySlug(db, tenant.id, input.topic) : null;

  const targets: MessageTargets = { ...(to ? { to } : {}), ...(input.topic ? { topic: input.topic } : {}) };
  const payload = payloadFromInput(input as Record<string, unknown>);
  assertJsonSize(payload, MAX_PAYLOAD_BYTES, 'payload must serialize to 8KB or less', {
    code: 'payload_too_large',
    param: 'data',
  });
  const fingerprint = input.idempotencyKey
    ? await sha256Hex(
        stableStringify({ targets, channel, ttlSeconds: input.ttlSeconds ?? DEFAULT_TTL_SECONDS, payload })
      )
    : null;
  const ttlSeconds = input.ttlSeconds ?? DEFAULT_TTL_SECONDS;

  const [message] = await trace(
    'messages.create',
    async () =>
      await db
        .insert(tables.message)
        .values({
          tenantId: tenant.id,
          channel,
          topic: topic?.slug ?? null,
          topicId: topic?.id ?? null,
          targets,
          payload,
          idempotencyKey: input.idempotencyKey ?? null,
          idempotencyFingerprint: fingerprint,
          expiresAt: new Date(Date.now() + ttlSeconds * 1000),
        })
        .onConflictDoNothing({
          target: [tables.message.tenantId, tables.message.idempotencyKey],
          where: sql`${tables.message.idempotencyKey} is not null and ${tables.message.deletedAt} is null`,
        })
        .returning()
  );

  if (message) return { message, created: true };

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

  if (!existing) {
    throw new ConflictError('This idempotency key is being processed by another request', {
      code: 'idempotency_key_in_use',
      param: 'idempotencyKey',
    });
  }

  if (existing.idempotencyFingerprint !== fingerprint) {
    throw new ConflictError('This idempotency key was already used with a different request', {
      code: 'idempotency_key_reused',
      param: 'idempotencyKey',
    });
  }

  return { message: existing, created: false };
}

export async function enqueueFanout(messageId: number, afterId = 0): Promise<void> {
  await env.DELIVERIES.send({ type: 'fanout', messageId, afterId } satisfies DeliveryQueueMessage);
}

export async function enqueueDeliveries(jobs: Array<DeliveryJob & { delaySeconds?: number }>): Promise<void> {
  for (let i = 0; i < jobs.length; i += QUEUE_BATCH_SIZE) {
    const batch = jobs.slice(i, i + QUEUE_BATCH_SIZE);
    await env.DELIVERIES.sendBatch(
      batch.map(({ delaySeconds, ...job }) => ({
        body: { type: 'deliver', ...job } satisfies DeliveryQueueMessage,
        ...(delaySeconds ? { delaySeconds } : {}),
      }))
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
    throw new NotFoundError('Message not found');
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

async function resolveTargetPage(
  db: Db,
  message: Message,
  topic: Topic | null,
  afterId: number
): Promise<Array<{ subscriptionId: number; subscriberId: number; platform: Subscription['platform'] }>> {
  const targets = message.targets as MessageTargets;
  const channel = message.channel as Channel;

  const conditions = [
    eq(tables.subscription.tenantId, message.tenantId),
    eq(tables.subscriber.tenantId, message.tenantId),
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
    const channelDefault = topicDefault(topic, channel);
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
  const topic =
    targets.topic && message.topicId
      ? ((
          await db
            .select()
            .from(tables.topic)
            .where(
              and(
                eq(tables.topic.id, message.topicId),
                eq(tables.topic.tenantId, message.tenantId),
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
  environment: ProviderEnvironment,
  memo?: CredentialMemo
): Promise<ResolvedCredential | null> {
  const memoKey = `${tenantId}:${provider}:${environment}`;
  const memoized = memo?.get(memoKey);
  if (memoized) return memoized;

  const pending = findCredentialForProvider(db, tenantId, provider, environment);
  memo?.set(memoKey, pending);
  return pending;
}

async function findCredentialForProvider(
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

  const credential = rows.find((row) => row.environment === preferredEnvironment);
  if (!credential) return null;

  return {
    id: credential.id,
    keyVersion: credential.keyVersion,
    environment: credential.environment,
    details: credential.details as Record<string, string>,
    secret: await decryptCredentialSecret(credential),
  };
}

export type ProcessedDelivery = {
  job: DeliveryJob;
  messageId: number | null;
  outcome: 'skipped' | 'sent' | 'retrying' | 'failed' | 'invalid';
  retryDelaySeconds: number | null;
};

type ProcessableRow = {
  delivery: Pick<
    Delivery,
    'id' | 'tenantId' | 'messageId' | 'subscriberId' | 'subscriptionId' | 'status' | 'attempts' | 'provider'
  >;
  message: Pick<Message, 'id' | 'payload' | 'expiresAt'>;
  subscription: Pick<
    Subscription,
    'id' | 'endpoint' | 'enabled' | 'status' | 'deletedAt' | 'channel' | 'environment'
  >;
  subscriber: Pick<Subscriber, 'externalId' | 'deletedAt'>;
};

async function listDeliveriesForProcessing(db: Db, ids: number[]): Promise<ProcessableRow[]> {
  if (ids.length === 0) return [];
  return await db
    .select({
      delivery: {
        id: tables.delivery.id,
        tenantId: tables.delivery.tenantId,
        messageId: tables.delivery.messageId,
        subscriberId: tables.delivery.subscriberId,
        subscriptionId: tables.delivery.subscriptionId,
        status: tables.delivery.status,
        attempts: tables.delivery.attempts,
        provider: tables.delivery.provider,
      },
      message: {
        id: tables.message.id,
        payload: tables.message.payload,
        expiresAt: tables.message.expiresAt,
      },
      subscription: {
        id: tables.subscription.id,
        endpoint: tables.subscription.endpoint,
        enabled: tables.subscription.enabled,
        status: tables.subscription.status,
        deletedAt: tables.subscription.deletedAt,
        channel: tables.subscription.channel,
        environment: tables.subscription.environment,
      },
      subscriber: { externalId: tables.subscriber.externalId, deletedAt: tables.subscriber.deletedAt },
    })
    .from(tables.delivery)
    .innerJoin(tables.message, eq(tables.message.id, tables.delivery.messageId))
    .innerJoin(tables.subscription, eq(tables.subscription.id, tables.delivery.subscriptionId))
    .innerJoin(tables.subscriber, eq(tables.subscriber.id, tables.delivery.subscriberId))
    .where(inArray(tables.delivery.id, ids));
}

export async function processDeliveryBatch(
  db: Db,
  jobs: DeliveryJob[],
  memo: CredentialMemo,
  tokens: TokenMemo
): Promise<ProcessedDelivery[]> {
  return await trace('deliveries.processBatch', { 'deliveries.count': jobs.length }, async (t) => {
    const rows = new Map(
      (
        await listDeliveriesForProcessing(
          db,
          jobs.map((job) => job.deliveryId)
        )
      ).map((row) => [row.delivery.id, row])
    );
    const processed: ProcessedDelivery[] = [];
    const unsubscribed: ProcessableRow[] = [];
    const expired: ProcessableRow[] = [];
    const candidates: Array<{ job: DeliveryJob; row: ProcessableRow }> = [];
    const now = Date.now();

    for (const job of jobs) {
      const row = rows.get(job.deliveryId);
      if (
        !row ||
        (row.delivery.status !== 'pending' && row.delivery.status !== 'retrying') ||
        row.delivery.attempts + 1 !== job.attempt
      ) {
        processed.push({
          job,
          messageId: row?.message.id ?? null,
          outcome: 'skipped',
          retryDelaySeconds: null,
        });
        continue;
      }
      if (
        !row.subscription.enabled ||
        row.subscription.status !== 'active' ||
        row.subscription.deletedAt ||
        row.subscriber.deletedAt
      ) {
        unsubscribed.push(row);
        processed.push({ job, messageId: row.message.id, outcome: 'failed', retryDelaySeconds: null });
        continue;
      }
      if (row.message.expiresAt.getTime() < now) {
        expired.push(row);
        processed.push({ job, messageId: row.message.id, outcome: 'failed', retryDelaySeconds: null });
        continue;
      }
      candidates.push({ job, row });
    }

    await failDeliveriesImmediately(
      db,
      unsubscribed.map((row) => row.delivery.id),
      'unsubscribed',
      'Subscription is muted, removed, or invalid'
    );
    await failDeliveriesImmediately(
      db,
      expired.map((row) => row.delivery.id),
      'expired',
      'Message expired before delivery'
    );

    const startedAt = new Date();
    const claimed = await claimDeliveryAttempts(
      db,
      candidates.map(({ job }) => job),
      startedAt
    );
    const sending = candidates.filter(({ job }) => claimed.has(job.deliveryId));
    for (const { job, row } of candidates) {
      if (!claimed.has(job.deliveryId)) {
        processed.push({ job, messageId: row.message.id, outcome: 'skipped', retryDelaySeconds: null });
      }
    }

    const outcomes: AttemptOutcome[] = [];
    await runWithConcurrency(sending, SEND_CONCURRENCY, async ({ job, row }) => {
      const provider = row.delivery.provider;
      const payload = row.message.payload as MessagePayload;
      const credential = await resolveCredential(
        db,
        row.delivery.tenantId,
        provider,
        row.subscription.environment,
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
              endpoint: row.subscription.endpoint,
              payload,
              expiresAt: row.message.expiresAt,
              tokens,
            })
          )
        : ({
            ok: false,
            code: 'no_credential',
            reason: `No ${row.subscription.environment} credential configured for ${provider}`,
            request: null,
            response: null,
            latencyMs: 0,
          } as const);
      outcomes.push({
        deliveryId: row.delivery.id,
        tenantId: row.delivery.tenantId,
        messageId: row.message.id,
        subscriptionId: row.subscription.id,
        attempt: job.attempt,
        provider,
        startedAt,
        result,
      });
    });

    const applications = await applyAttemptResults(db, outcomes);
    const applied = new Map(applications.map((application) => [application.deliveryId, application]));

    for (const outcome of outcomes) {
      const application = applied.get(outcome.deliveryId);
      const job = { deliveryId: outcome.deliveryId, attempt: outcome.attempt };
      if (!application) {
        processed.push({ job, messageId: outcome.messageId, outcome: 'skipped', retryDelaySeconds: null });
        continue;
      }
      processed.push({
        job,
        messageId: outcome.messageId,
        outcome:
          application.counterDelta ?? (application.retryDelaySeconds !== null ? 'retrying' : 'skipped'),
        retryDelaySeconds: application.retryDelaySeconds,
      });
    }

    await recordSystemEvents(
      db,
      applications
        .filter((application) => application.invalidatedSubscription)
        .map((application) => {
          const row = rows.get(application.deliveryId)!;
          const outcome = outcomes.find((candidate) => candidate.deliveryId === application.deliveryId)!;
          return {
            event: 'subscription.invalidated' as const,
            tenantId: row.delivery.tenantId,
            target: { type: 'subscription', id: row.subscription.id },
            data: {
              externalId: row.subscriber.externalId,
              channel: row.subscription.channel,
              reason: outcome.result.ok ? null : outcome.result.reason,
            },
          };
        })
    );

    for (const outcome of ['sent', 'retrying', 'failed', 'invalid', 'skipped'] as const) {
      t.set(`deliveries.${outcome}`, processed.filter((entry) => entry.outcome === outcome).length);
    }
    return processed;
  });
}

export async function listStalledFanouts(
  db: Db,
  limit: number
): Promise<Array<{ id: number; cursor: number }>> {
  const cutoff = new Date(Date.now() - STALLED_FANOUT_MINUTES * 60 * 1000);
  return await db
    .select({ id: tables.message.id, cursor: tables.message.fanoutCursor })
    .from(tables.message)
    .where(
      and(
        inArray(tables.message.status, ['queued', 'processing']),
        isNull(tables.message.fanoutCompletedAt),
        lt(tables.message.updatedAt, cutoff)
      )
    )
    .orderBy(asc(tables.message.updatedAt))
    .limit(limit);
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<void>
): Promise<void> {
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index++];
      if (item) await task(item);
    }
  });
  await Promise.all(workers);
}
