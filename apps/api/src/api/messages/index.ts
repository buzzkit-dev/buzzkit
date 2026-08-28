import { assertChannelConnected } from '@buzzkit/api/api/credentials/index';
import { compileSegment, findSegmentBySlug } from '@buzzkit/api/api/segments/index';
import { resolveTenantSettings, type Tenant } from '@buzzkit/api/api/tenants/index';
import { CHANNELS, type Channel, findTopicBySlug } from '@buzzkit/api/api/topics/index';
import { sha256Hex } from '@buzzkit/api/libs/crypto';
import { BadRequestError, ConflictError, NotFoundError } from '@buzzkit/api/libs/error';
import { decodeEntityId } from '@buzzkit/api/libs/sqids';
import { trace } from '@buzzkit/api/libs/telemetry';
import type { MessagePayload } from '@buzzkit/api/providers/index';
import { assertJsonSize, stableStringify } from '@buzzkit/api/utils/json';
import {
  and,
  count,
  type Db,
  desc,
  eq,
  gte,
  ilike,
  isNull,
  lt,
  lte,
  or,
  sql,
  tables,
} from '@buzzkit/database';
import type { Expression } from 'buzzkit/expressions';
import { DEFAULT_TTL_SECONDS, MAX_PAYLOAD_BYTES } from './constants';
import type { Message, MessageFilters, MessageTargets } from './types';

export * from './constants';
export * from './enqueue';
export * from './fanout';
export * from './schemas';
export * from './send';
export { serializeMessage } from './serialize';
export type * from './types';

function resolveMessageFilters(tenantId: number, filters: MessageFilters) {
  const needle = filters.q?.trim();
  return and(
    eq(tables.message.tenantId, tenantId),
    isNull(tables.message.deletedAt),
    filters.status ? eq(tables.message.status, filters.status) : undefined,
    filters.channel ? eq(tables.message.channel, filters.channel) : undefined,
    filters.topic ? eq(tables.message.topic, filters.topic) : undefined,
    filters.from ? gte(tables.message.createdAt, filters.from) : undefined,
    filters.to ? lte(tables.message.createdAt, filters.to) : undefined,
    needle
      ? or(
          ilike(sql`${tables.message.payload}->>'title'`, `%${needle}%`),
          ilike(sql`${tables.message.payload}->>'body'`, `%${needle}%`),
          ilike(tables.message.topic, `%${needle}%`),
          ilike(sql`${tables.message.targets}::text`, `%${needle}%`)
        )
      : undefined
  );
}

export async function countMessages(db: Db, tenantId: number, filters: MessageFilters = {}): Promise<number> {
  const [row] = await trace(
    'messages.count',
    async () =>
      await db.select({ total: count() }).from(tables.message).where(resolveMessageFilters(tenantId, filters))
  );
  return Number(row?.total ?? 0);
}

export async function listMessages(
  db: Db,
  tenantId: number,
  options: { limit: number; beforeId?: number } & MessageFilters
): Promise<Message[]> {
  return await trace(
    'messages.list',
    async () =>
      await db
        .select()
        .from(tables.message)
        .where(
          and(
            resolveMessageFilters(tenantId, options),
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

function payloadFromInput(input: Record<string, unknown>): MessagePayload {
  const {
    to: _to,
    topic: _topic,
    channel: _channel,
    idempotencyKey: _key,
    ttlSeconds: _ttl,
    segment: _segment,
    where: _where,
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
    segment?: string;
    where?: Expression;
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
  await assertChannelConnected(db, tenant.id, channel, 'channel');

  const to =
    input.to === undefined ? undefined : Array.isArray(input.to) ? [...new Set(input.to)] : [input.to];
  if (!to && !input.topic && !input.segment && !input.where) {
    throw new BadRequestError('Provide `to` (external ids), `segment`, `where`, and/or `topic`', {
      code: 'targets_missing',
      param: 'to',
    });
  }
  const audiences = [to && 'to', input.segment && 'segment', input.where && 'where'].filter(Boolean);
  if (audiences.length > 1) {
    throw new BadRequestError(`Provide only one of ${audiences.map((key) => `\`${key}\``).join(', ')}`, {
      code: 'targets_conflict',
      param: audiences[1] as string,
    });
  }
  if (input.where) compileSegment(tenant.id, input.where, 'where');

  if (input.title === undefined && input.body === undefined && input.data === undefined) {
    throw new BadRequestError('Provide at least a title, body, or data', {
      code: 'payload_missing',
      param: 'body',
    });
  }

  const topic = input.topic ? await findTopicBySlug(db, tenant.id, input.topic) : null;
  if (topic && !topic.channels.includes(channel)) {
    throw new BadRequestError(`Topic '${topic.slug}' is not offered on the '${channel}' channel`, {
      code: 'channel_not_offered',
      param: 'topic',
    });
  }

  const segment = input.segment ? await findSegmentBySlug(db, tenant.id, input.segment) : null;
  const targets: MessageTargets = {
    ...(to ? { to } : {}),
    ...(input.topic ? { topic: input.topic } : {}),
    ...(segment ? { segment: segment.slug, segmentVersionId: segment.version.id } : {}),
    ...(input.where ? { where: input.where } : {}),
  };
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
