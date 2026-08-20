import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { tenant } from './tenant';

export const devicePlatform = pgEnum('device_platform', ['ios', 'android']);
export const deviceStatus = pgEnum('device_status', ['active', 'invalid']);

export const subscriber = pgTable(
  'subscriber',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    externalId: text('external_id').notNull(),
    attributes: jsonb('attributes').notNull().default({}),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => [
    uniqueIndex('subscriber_tenant_external_unique')
      .on(table.tenantId, table.externalId)
      .where(sql`${table.deletedAt} is null`),
    index('subscriber_tenant_idx').on(table.tenantId),
  ]
);

export const device = pgTable(
  'device',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    subscriberId: integer('subscriber_id')
      .notNull()
      .references(() => subscriber.id, { onDelete: 'cascade' }),
    platform: devicePlatform('platform').notNull(),
    token: text('token').notNull(),
    status: deviceStatus('status').notNull().default('active'),
    lastSeenAt: timestamp('last_seen_at').notNull().defaultNow(),
    invalidatedAt: timestamp('invalidated_at'),
    invalidationReason: text('invalidation_reason'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => [
    uniqueIndex('device_tenant_token_unique')
      .on(table.tenantId, table.token)
      .where(sql`${table.deletedAt} is null`),
    index('device_subscriber_idx').on(table.subscriberId),
    index('device_tenant_idx').on(table.tenantId),
  ]
);

export const subscriberTables = { subscriber, device };
