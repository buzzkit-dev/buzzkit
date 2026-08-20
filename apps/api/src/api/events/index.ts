import type { ApiKey } from '@buzzkit/api/api/keys/index';
import { log } from '@buzzkit/api/libs/logger';
import { decodeSqid, ID_PREFIXES, s, TARGET_ENTITIES } from '@buzzkit/api/libs/sqids';
import { trace } from '@buzzkit/api/libs/telemetry';
import { clampLimit, resolveCursor, toPage } from '@buzzkit/api/utils/pagination';
import { and, type Db, desc, eq, lt, tables } from '@buzzkit/database';
import type { EventName } from './catalog';

export { EVENT_CATALOG, type EventName, isPublicEvent, PUBLIC_EVENTS } from './catalog';

export type EventRow = typeof tables.event.$inferSelect;

type ActorUser = { id: string; email: string };

export type Actor =
  | { type: 'member'; user: ActorUser; memberId?: number }
  | { type: 'key'; apiKey: ApiKey }
  | { type: 'user'; subscriber: { id?: number; display: string } }
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
    const same =
      a instanceof Date || b instanceof Date
        ? (a instanceof Date ? a.getTime() : a) === (b instanceof Date ? b.getTime() : b)
        : typeof a === 'object' || typeof b === 'object'
          ? JSON.stringify(a) === JSON.stringify(b)
          : a === b;

    if (!same) {
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
  request: Request,
  boundWorkspaceId: number | null
): EventFn {
  const requestMeta = {
    requestId: request.headers.get('cf-ray') ?? request.headers.get('x-request-id'),
    ip: request.headers.get('cf-connecting-ip'),
    userAgent: request.headers.get('user-agent'),
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
                ? s.encode([entry.target.id])
                : entry.target.id
              : undefined,
          data: entry.data,
          ...requestMeta,
        })
      );
    } catch (error) {
      log.error('[Events] Failed to write event', {
        event: entry.event,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };
}

function serializeEventRows(rows: EventRow[]): (EventRow & { targetId: string | null })[] {
  return rows.map((row) => {
    const entity = row.targetType ? TARGET_ENTITIES[row.targetType] : undefined;
    return {
      ...row,
      targetId:
        row.targetId && entity && !row.targetId.includes('_')
          ? `${ID_PREFIXES[entity]}_${row.targetId}`
          : row.targetId,
    };
  });
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

  const rows = await trace(
    'events.list',
    async () =>
      await db
        .select()
        .from(tables.event)
        .where(
          and(
            eq(tables.event.workspaceId, workspaceId),
            cursorId !== undefined ? lt(tables.event.id, cursorId) : undefined,
            options.event !== undefined ? eq(tables.event.event, options.event) : undefined,
            options.actorType !== undefined ? eq(tables.event.actorType, options.actorType) : undefined
          )
        )
        .orderBy(desc(tables.event.id))
        .limit(limit + 1)
  );

  return toPage(serializeEventRows(rows), limit, (id) => s.encode([id]));
}
