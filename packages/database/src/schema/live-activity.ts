import { sql } from 'drizzle-orm';
import { check, index, pgEnum, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { bigId, bigRef, createdAt, deletedAt, environment, timestamptz, updatedAt } from './shared';
import { subscriber } from './subscriber';
import { tenant } from './tenant';

export const liveActivityKind = pgEnum('live_activity_kind', ['activity', 'start']);

export const liveActivity = pgTable(
  'live_activity',
  {
    id: bigId(),
    tenantId: bigRef('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    subscriberId: bigRef('subscriber_id')
      .notNull()
      .references(() => subscriber.id, { onDelete: 'cascade' }),
    kind: liveActivityKind('kind').notNull().default('activity'),
    activityId: text('activity_id'),
    attributesType: text('attributes_type').notNull(),
    token: text('token').notNull(),
    environment: environment('environment').notNull().default('production'),
    endedAt: timestamptz('ended_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (table) => [
    uniqueIndex('live_activity_activity_unique')
      .on(table.tenantId, table.subscriberId, table.activityId)
      .where(sql`${table.kind} = 'activity' and ${table.deletedAt} is null`),
    uniqueIndex('live_activity_start_unique')
      .on(table.tenantId, table.subscriberId, table.attributesType)
      .where(sql`${table.kind} = 'start' and ${table.deletedAt} is null`),
    index('live_activity_subscriber_idx').on(table.subscriberId),
    check('live_activity_id_presence', sql`${table.kind} <> 'activity' or ${table.activityId} is not null`),
  ]
);

export const liveActivityTables = { liveActivity };
