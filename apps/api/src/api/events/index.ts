import type { ApiKey } from '@buzzkit/api/api/keys/index';
import { describeError } from '@buzzkit/api/libs/error';
import { log } from '@buzzkit/api/libs/logger';
import { ActorTypeSchema } from '@buzzkit/api/libs/schemas';
import { decodeSqid, encodeBareId, encodeId, ID_PREFIXES, TARGET_ENTITIES } from '@buzzkit/api/libs/sqids';
import { trace } from '@buzzkit/api/libs/telemetry';
import { deepEqual } from '@buzzkit/api/utils/equality';
import { clampLimit, resolveCursor, toPage } from '@buzzkit/api/utils/pagination';
import {
  and,
  count,
  type Db,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lt,
  lte,
  or,
  sql,
  tables,
} from '@buzzkit/database';
import { t } from 'elysia';
import type { EventName } from './catalog';

export { EVENT_CATALOG, type EventName, isPublicEvent, PUBLIC_EVENTS } from './catalog';

export type EventRow = typeof tables.event.$inferSelect;

type ActorUser = { id: string; email: string };

export type Actor =
  | { type: 'member'; user: ActorUser; memberId?: number }
  | { type: 'key'; apiKey: ApiKey }
  | { type: 'user'; subscriber: { display: string } }
  | { type: 'system' };

export type EventEntry = {
  event: EventName;
  workspaceId?: number | null;
  tenantId?: number;
  target?: { type: string; id: string | number };
  data?: Record<string, unknown>;
};

export type EventFn = (entry: EventEntry) => Promise<void>;

export type EventFilters = {
  q?: string;
  event?: string;
  actorType?: 'member' | 'user' | 'key' | 'system';
  from?: string;
  to?: string;
};

export const EventFiltersSchema = t.Object({
  q: t.Optional(t.String({ maxLength: 200 })),
  event: t.Optional(t.String({ maxLength: 100 })),
  actorType: t.Optional(ActorTypeSchema),
  from: t.Optional(t.String({ format: 'date-time' })),
  to: t.Optional(t.String({ format: 'date-time' })),
});

export function diffForEvent<T extends Record<string, unknown>>(
  before: T,
  after: T,
  ignore: readonly string[] = ['updatedAt']
): { changes: string[]; previousAttributes: Record<string, unknown> } {
  const changes: string[] = [];
  const previous: Record<string, unknown> = {};

  for (const key of Object.keys(after)) {
    if (ignore.includes(key)) continue;

    const a = before[key];
    const b = after[key];
    if (!deepEqual(a instanceof Date ? a.getTime() : a, b instanceof Date ? b.getTime() : b)) {
      changes.push(key);
      previous[key] = a;
    }
  }

  return { changes, previousAttributes: previous };
}

export function actorColumns(actor: Actor) {
  switch (actor.type) {
    case 'member':
      return {
        actorType: 'member' as const,
        actorUserId: actor.user.id,
        actorMemberId: actor.memberId,
        actorDisplay: actor.user.email,
      };
    case 'key':
      return {
        actorType: 'key' as const,
        actorKeyId: actor.apiKey.id,
        actorDisplay: `${actor.apiKey.name} (${actor.apiKey.prefix}…${actor.apiKey.last4})`,
      };
    case 'user':
      return {
        actorType: 'user' as const,
        actorDisplay: actor.subscriber.display,
      };
    case 'system':
      return { actorType: 'system' as const, actorDisplay: 'system' };
  }
}

export function createEventLogger(
  db: Db,
  actor: Actor,
  request: Request | null,
  boundWorkspaceId: number | null
): EventFn {
  const requestMeta = {
    requestId: request?.headers.get('cf-ray') ?? request?.headers.get('x-request-id') ?? null,
    ip: request?.headers.get('cf-connecting-ip') ?? null,
    userAgent: request?.headers.get('user-agent') ?? null,
  };

  return async (entry: EventEntry) => {
    try {
      await trace('event.write', async () =>
        db.insert(tables.event).values({
          workspaceId: entry.workspaceId !== undefined ? entry.workspaceId : boundWorkspaceId,
          tenantId: entry.tenantId,
          event: entry.event,
          ...actorColumns(actor),
          targetType: entry.target?.type,
          targetId:
            entry.target !== undefined
              ? typeof entry.target.id === 'number'
                ? encodeBareId(TARGET_ENTITIES[entry.target.type], entry.target.id)
                : entry.target.id
              : undefined,
          data: entry.data,
          ...requestMeta,
        })
      );
    } catch (error) {
      log.error('[Events] Failed to write event', {
        event: entry.event,
        error: describeError(error),
      });
    }
  };
}

export async function recordSystemEvents(
  db: Db,
  entries: Array<EventEntry & { tenantId: number }>
): Promise<void> {
  if (entries.length === 0) return;
  const tenantIds = [...new Set(entries.map((entry) => entry.tenantId))];
  const tenants = await db
    .select({ id: tables.tenant.id, workspaceId: tables.tenant.workspaceId })
    .from(tables.tenant)
    .where(inArray(tables.tenant.id, tenantIds));
  const workspaceOf = new Map(tenants.map((tenant) => [tenant.id, tenant.workspaceId]));

  try {
    await trace('event.writeMany', { 'events.count': entries.length }, async () =>
      db.insert(tables.event).values(
        entries.map((entry) => ({
          workspaceId: workspaceOf.get(entry.tenantId) ?? null,
          tenantId: entry.tenantId,
          event: entry.event,
          ...actorColumns({ type: 'system' }),
          targetType: entry.target?.type,
          targetId:
            entry.target !== undefined
              ? typeof entry.target.id === 'number'
                ? encodeBareId(TARGET_ENTITIES[entry.target.type], entry.target.id)
                : entry.target.id
              : undefined,
          data: entry.data,
        }))
      )
    );
  } catch (error) {
    log.error('[Events] Failed to write events', {
      count: entries.length,
      error: describeError(error),
    });
  }
}

export function serializeEvent(row: EventRow) {
  const entity = row.targetType ? TARGET_ENTITIES[row.targetType] : undefined;
  return {
    id: row.id,
    event: row.event,
    tenantId: row.tenantId,
    actorType: row.actorType,
    actorDisplay: row.actorDisplay,
    actorMemberId: row.actorMemberId,
    actorKeyId: row.actorKeyId,
    targetType: row.targetType,
    targetId:
      row.targetId && entity && !row.targetId.includes('_')
        ? `${ID_PREFIXES[entity]}_${row.targetId}`
        : row.targetId,
    data: row.data,
    requestId: row.requestId,
    ip: row.ip,
    userAgent: row.userAgent,
    createdAt: row.createdAt,
  };
}

function resolveEventFilters(workspaceId: number, filters: EventFilters) {
  const needle = filters.q?.trim();
  return and(
    eq(tables.event.workspaceId, workspaceId),
    filters.event ? eq(tables.event.event, filters.event) : undefined,
    filters.actorType ? eq(tables.event.actorType, filters.actorType) : undefined,
    filters.from ? gte(tables.event.createdAt, new Date(filters.from)) : undefined,
    filters.to ? lte(tables.event.createdAt, new Date(filters.to)) : undefined,
    needle
      ? or(
          ilike(tables.event.event, `%${needle}%`),
          ilike(tables.event.actorDisplay, `%${needle}%`),
          ilike(tables.event.targetId, `%${needle.replace(/^[a-z]+_/, '')}%`),
          ilike(sql`${tables.event.data}->>'externalId'`, `%${needle}%`)
        )
      : undefined
  );
}

export async function listEvents(
  db: Db,
  workspaceId: number,
  options: { cursor?: string; limit?: number } & EventFilters = {}
) {
  const limit = clampLimit(options.limit);
  const cursorId = resolveCursor(options.cursor, decodeSqid);
  const filters = resolveEventFilters(workspaceId, options);

  const [rows, [counted]] = await Promise.all([
    trace(
      'events.list',
      async () =>
        await db
          .select()
          .from(tables.event)
          .where(and(filters, cursorId !== undefined ? lt(tables.event.id, cursorId) : undefined))
          .orderBy(desc(tables.event.id))
          .limit(limit + 1)
    ),
    trace('events.count', async () => await db.select({ total: count() }).from(tables.event).where(filters)),
  ]);

  return {
    ...toPage(rows.map(serializeEvent), limit, (id) => encodeId('event', id)),
    total: Number(counted?.total ?? 0),
  };
}

export async function listSubscriberEvents(
  db: Db,
  tenantId: number,
  subscriber: { id: number; externalId: string },
  subscriptionIds: number[],
  options: { limit: number; beforeId?: number }
) {
  const about = or(
    and(
      eq(tables.event.targetType, 'subscriber'),
      eq(tables.event.targetId, encodeBareId('subscriber', subscriber.id))
    ),
    subscriptionIds.length > 0
      ? and(
          eq(tables.event.targetType, 'subscription'),
          inArray(
            tables.event.targetId,
            subscriptionIds.map((id) => encodeBareId('subscription', id))
          )
        )
      : undefined,
    sql`${tables.event.data}->>'externalId' = ${subscriber.externalId}`
  );
  const filters = and(eq(tables.event.tenantId, tenantId), about);

  const [rows, [counted]] = await Promise.all([
    trace(
      'events.listForSubscriber',
      async () =>
        await db
          .select()
          .from(tables.event)
          .where(and(filters, options.beforeId ? lt(tables.event.id, options.beforeId) : undefined))
          .orderBy(desc(tables.event.id))
          .limit(options.limit + 1)
    ),
    trace(
      'events.countForSubscriber',
      async () => await db.select({ total: count() }).from(tables.event).where(filters)
    ),
  ]);

  return {
    ...toPage(rows.map(serializeEvent), options.limit, (id) => encodeId('event', id)),
    total: Number(counted?.total ?? 0),
  };
}
