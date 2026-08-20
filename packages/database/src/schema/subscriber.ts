import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { channel } from './shared';
import { tenant } from './tenant';

export const subscriptionPlatform = pgEnum('subscription_platform', ['ios', 'android']);
export const subscriptionStatus = pgEnum('subscription_status', ['active', 'invalid']);

export const subscriber = pgTable(
  'subscriber',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    externalId: text('external_id').notNull(),
    attributes: jsonb('attributes').notNull().default({}),
    identityVerifiedAt: timestamp('identity_verified_at'),
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

export const subscription = pgTable(
  'subscription',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    subscriberId: integer('subscriber_id')
      .notNull()
      .references(() => subscriber.id, { onDelete: 'cascade' }),
    channel: channel('channel').notNull(),
    platform: subscriptionPlatform('platform'),
    endpoint: text('endpoint').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    status: subscriptionStatus('status').notNull().default('active'),
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
    uniqueIndex('subscription_tenant_channel_endpoint_unique')
      .on(table.tenantId, table.channel, table.endpoint)
      .where(sql`${table.deletedAt} is null`),
    index('subscription_subscriber_idx').on(table.subscriberId),
    index('subscription_tenant_idx').on(table.tenantId),
    index('subscription_fanout_idx')
      .on(table.tenantId, table.channel, table.id)
      .where(sql`${table.enabled} = true and ${table.status} = 'active' and ${table.deletedAt} is null`),
  ]
);

export const subscriberTables = { subscriber, subscription };
