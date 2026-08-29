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
import { DEFAULT_TTL_SECONDS, DUE_MESSAGES_LIMIT, MAX_PAYLOAD_BYTES } from './constants';
import { enqueueFanout } from './enqueue';
import { completeFanout } from './fanout';
import { dueZones, firstInstant, followsSubscriber, lastInstant, resolveSchedule } from './schedule';
import type { Message, MessageFilters, MessageRun, MessageSchedule, MessageTargets } from './types';

export * from './constants';
export * from './enqueue';
export * from './fanout';
export * from './schedule';
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
    schedule: _schedule,
    run: _run,
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
    schedule?: { at: string; timezone?: string; defaultTimezone?: string };
    idempotencyKey?: string;
    run?: MessageRun;
  } & MessagePayload
): Promise<{ message: Message; created: boolean }> {
  const now = new Date();
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
  const schedule = input.schedule ? resolveSchedule(input.schedule, now) : null;
  const payload = payloadFromInput(input as Record<string, unknown>);
  assertJsonSize(payload, MAX_PAYLOAD_BYTES, 'payload must serialize to 8KB or less', {
    code: 'payload_too_large',
    param: 'data',
  });
  const fingerprint = input.idempotencyKey
    ? await sha256Hex(
        stableStringify({
          targets,
          channel,
          ttlSeconds: input.ttlSeconds ?? DEFAULT_TTL_SECONDS,
          payload,
          schedule,
          run: input.run ?? null,
        })
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
          runId: input.run?.id ?? null,
          runStep: input.run?.step ?? null,
          idempotencyKey: input.idempotencyKey ?? null,
          idempotencyFingerprint: fingerprint,
          ...(schedule
            ? {
                status: 'scheduled' as const,
                schedule,
                scheduledFor: firstInstant(schedule),
                scheduledZones: followsSubscriber(schedule) ? [] : null,
              }
            : {}),
          expiresAt: new Date(
            (schedule ? lastInstant(schedule).getTime() : now.getTime()) + ttlSeconds * 1000
          ),
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

export async function cancelMessage(db: Db, tenantId: number, messageSqid: string): Promise<Message> {
  const message = await findMessage(db, tenantId, messageSqid);
  const now = new Date();
  if (message.status === 'scheduled') {
    const [canceled] = await db
      .update(tables.message)
      .set({ status: 'canceled', canceledAt: now, completedAt: now, fanoutCompletedAt: now })
      .where(and(eq(tables.message.id, message.id), eq(tables.message.status, 'scheduled')))
      .returning();
    if (canceled) return canceled;
  }
  const pendingZones =
    message.schedule !== null &&
    followsSubscriber(message.schedule as MessageSchedule) &&
    message.fanoutCompletedAt === null &&
    message.canceledAt === null;
  if (pendingZones) {
    await db.update(tables.message).set({ canceledAt: now }).where(eq(tables.message.id, message.id));
    await completeFanout(db, message.id);
    return await findMessage(db, tenantId, messageSqid);
  }
  throw new BadRequestError('Only a scheduled message that has not been sent yet can be canceled', {
    code: 'message_not_cancelable',
    param: 'id',
  });
}

export async function listDueMessages(db: Db, now: Date, limit: number): Promise<Message[]> {
  return await db
    .select()
    .from(tables.message)
    .where(
      and(
        sql`${tables.message.schedule} is not null`,
        isNull(tables.message.fanoutCompletedAt),
        isNull(tables.message.canceledAt),
        isNull(tables.message.deletedAt),
        lte(tables.message.scheduledFor, now)
      )
    )
    .orderBy(tables.message.scheduledFor)
    .limit(limit);
}

export async function releaseDueMessages(
  db: Db,
  now = new Date()
): Promise<{ released: number; batches: number }> {
  const due = await listDueMessages(db, now, DUE_MESSAGES_LIMIT);
  let released = 0;
  let batches = 0;
  for (const message of due) {
    const schedule = message.schedule as MessageSchedule;
    if (!followsSubscriber(schedule)) {
      if (message.status !== 'scheduled') continue;
      await db
        .update(tables.message)
        .set({ status: 'queued' })
        .where(and(eq(tables.message.id, message.id), eq(tables.message.status, 'scheduled')));
      await enqueueFanout(message.id);
      released += 1;
      continue;
    }
    const zones = dueZones(schedule, now, (message.scheduledZones as string[] | null) ?? []);
    const final = lastInstant(schedule).getTime() <= now.getTime();
    if (zones.length > 0) {
      if (message.status === 'scheduled') {
        await db
          .update(tables.message)
          .set({ status: 'processing' })
          .where(and(eq(tables.message.id, message.id), eq(tables.message.status, 'scheduled')));
        released += 1;
      }
      await enqueueFanout(message.id, 0, { zones, final });
      batches += 1;
    } else if (final) {
      await completeFanout(db, message.id);
    }
  }
  return { released, batches };
}
