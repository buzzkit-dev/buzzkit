import { sql } from 'drizzle-orm';
import { boolean, check, index, jsonb, pgEnum, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { bigId, bigRef, channel, createdAt, deletedAt, timestamptz, updatedAt } from './shared';
import { tenant } from './tenant';

export const subscriptionPlatform = pgEnum('subscription_platform', ['ios', 'android']);
export const subscriptionStatus = pgEnum('subscription_status', ['active', 'invalid']);

export const subscriber = pgTable(
  'subscriber',
  {
    id: bigId(),
    tenantId: bigRef('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    externalId: text('external_id').notNull(),
    attributes: jsonb('attributes').notNull().default({}),
    identityVerifiedAt: timestamptz('identity_verified_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (table) => [
    uniqueIndex('subscriber_tenant_external_id_unique')
      .on(table.tenantId, table.externalId)
      .where(sql`${table.deletedAt} is null`),
    index('subscriber_tenant_idx').on(table.tenantId, table.id),
    check('subscriber_attributes_object', sql`jsonb_typeof(${table.attributes}) = 'object'`),
  ]
);

export const subscription = pgTable(
  'subscription',
  {
    id: bigId(),
    tenantId: bigRef('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    subscriberId: bigRef('subscriber_id')
      .notNull()
      .references(() => subscriber.id, { onDelete: 'cascade' }),
    channel: channel('channel').notNull(),
    platform: subscriptionPlatform('platform'),
    endpoint: text('endpoint').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    status: subscriptionStatus('status').notNull().default('active'),
    lastSeenAt: timestamptz('last_seen_at').notNull().defaultNow(),
    invalidatedAt: timestamptz('invalidated_at'),
    invalidationReason: text('invalidation_reason'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (table) => [
    uniqueIndex('subscription_tenant_channel_endpoint_unique')
      .on(table.tenantId, table.channel, table.endpoint)
      .where(sql`${table.deletedAt} is null`),
    index('subscription_subscriber_idx').on(table.subscriberId),
    index('subscription_fanout_idx')
      .on(table.tenantId, table.channel, table.id)
      .where(sql`${table.enabled} = true and ${table.status} = 'active' and ${table.deletedAt} is null`),
    check('subscription_push_platform', sql`${table.channel} <> 'push' or ${table.platform} is not null`),
  ]
);

export const subscriberTables = { subscriber, subscription };
