import type { ApiKey } from '@buzzkit/api/api/keys/index';
import { describeError } from '@buzzkit/api/libs/error';
import { log } from '@buzzkit/api/libs/logger';
import { decodeSqid, encodeBareId, encodeId, ID_PREFIXES, TARGET_ENTITIES } from '@buzzkit/api/libs/sqids';
import { trace } from '@buzzkit/api/libs/telemetry';
import { deepEqual } from '@buzzkit/api/utils/equality';
import { clampLimit, resolveCursor, toPage } from '@buzzkit/api/utils/pagination';
import { and, count, type Db, desc, eq, inArray, lt, tables } from '@buzzkit/database';
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

export async function listEvents(
  db: Db,
  workspaceId: number,
  options: {
    cursor?: string;
    limit?: number;
    event?: string;
    actorType?: 'member' | 'user' | 'key' | 'system';
  } = {}
) {
  const limit = clampLimit(options.limit);
  const cursorId = resolveCursor(options.cursor, decodeSqid);

  const filters = and(
    eq(tables.event.workspaceId, workspaceId),
    options.event !== undefined ? eq(tables.event.event, options.event) : undefined,
    options.actorType !== undefined ? eq(tables.event.actorType, options.actorType) : undefined
  );

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
