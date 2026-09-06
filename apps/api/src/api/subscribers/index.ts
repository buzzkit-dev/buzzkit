import { countRows } from '@buzzkit/api/libs/database';
import { decodeEntityId, encodeId } from '@buzzkit/api/libs/sqids';
import { trace } from '@buzzkit/api/libs/telemetry';
import { clampLimit, type Page, resolveCursor, toPageBy } from '@buzzkit/api/utils/pagination';
import {
  and,
  type Db,
  desc,
  eq,
  getTableColumns,
  ilike,
  inArray,
  isNull,
  lt,
  or,
  sql,
  tables,
} from '@buzzkit/database';
import { serializeSubscriberListItem } from './serialize';
import type { SubscriberListItem } from './types';

export * from './aliases';
export * from './attributes';
export * from './constants';
export * from './merge';
export * from './profile';
export * from './registration';
export * from './schemas';
export * from './serialize';
export * from './subscriptions';
export type * from './types';

function searchClause(search: string) {
  const prefix = `${search.replace(/[%_\\]/g, '\\$&')}%`;
  const wordStart = `(^|[^[:alnum:]])${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`;

  return or(
    ilike(tables.subscriber.externalId, prefix),
    sql`${tables.subscriber.attributes} ->> 'name' ~* ${wordStart}`
  );
}

async function listSubscriberRows(
  db: Db,
  tenantId: number,
  options: { limit: number; beforeId?: number; ids?: number[]; search?: string }
): Promise<SubscriberListItem[]> {
  const live = sql`${tables.subscription.subscriberId} = ${tables.subscriber.id} and ${tables.subscription.deletedAt} is null`;
  const rows = await trace('subscribers.list', async () => {
    return await db
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
          options.ids ? inArray(tables.subscriber.id, options.ids) : undefined,
          options.search ? searchClause(options.search) : undefined
        )
      )
      .orderBy(desc(tables.subscriber.id))
      .limit(options.limit + 1);
  });

  return rows.map((row) => {
    return {
      ...row,
      lastSeenAt: row.lastSeenAt ? new Date(row.lastSeenAt) : null,
      channels: row.channels ?? [],
      platforms: row.platforms ?? [],
    };
  });
}

export async function listSubscribers(
  db: Db,
  tenantId: number,
  options: { cursor?: string; limit?: number; search?: string } = {}
): Promise<
  Page<Omit<ReturnType<typeof serializeSubscriberListItem>, 'id'> & { id: string }> & { total: number }
> {
  const limit = clampLimit(options.limit);
  const beforeId = resolveCursor(options.cursor, (id) => decodeEntityId('subscriber', id));

  const [rows, total] = await Promise.all([
    listSubscriberRows(db, tenantId, { limit, beforeId, search: options.search }),
    countSubscribers(db, tenantId),
  ]);

  const items = rows.map((row) => {
    return { ...serializeSubscriberListItem(row), id: encodeId('subscriber', row.id) };
  });

  return { ...toPageBy(items, limit, (item) => item.id), total };
}

export async function listSubscribersByIds(
  db: Db,
  tenantId: number,
  ids: number[]
): Promise<SubscriberListItem[]> {
  return await listSubscriberRows(db, tenantId, { limit: ids.length, ids });
}

export async function countSubscribers(db: Db, tenantId: number): Promise<number> {
  return await trace('subscribers.count', async () => {
    return await countRows(
      db,
      tables.subscriber,
      and(eq(tables.subscriber.tenantId, tenantId), isNull(tables.subscriber.deletedAt))
    );
  });
}
