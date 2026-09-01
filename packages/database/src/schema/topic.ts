import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, jsonb, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { bigId, bigRef, channel, createdAt, deletedAt, updatedAt } from './shared';
import { subscriber } from './subscriber';
import { tenant } from './tenant';

export const topicCategory = pgTable(
  'topic_category',
  {
    id: bigId(),
    tenantId: bigRef('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (table) => [
    uniqueIndex('topic_category_tenant_name_unique')
      .on(table.tenantId, sql`lower(${table.name})`)
      .where(sql`${table.deletedAt} is null`),
  ]
);

export const topic = pgTable(
  'topic',
  {
    id: bigId(),
    tenantId: bigRef('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    categoryId: bigRef('category_id').references(() => topicCategory.id, { onDelete: 'set null' }),
    dailyCap: integer('daily_cap'),
    defaultOptedIn: boolean('default_opted_in').notNull().default(true),
    channelDefaults: jsonb('channel_defaults').notNull().default({}),
    channels: channel('channels').array().notNull().default(sql`'{push,email}'::channel[]`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (table) => [
    uniqueIndex('topic_tenant_slug_unique')
      .on(table.tenantId, table.slug)
      .where(sql`${table.deletedAt} is null`),
    check('topic_channel_defaults_object', sql`jsonb_typeof(${table.channelDefaults}) = 'object'`),
    check('topic_channels_not_empty', sql`cardinality(${table.channels}) > 0`),
    index('topic_category_idx').on(table.categoryId),
  ]
);

export const subscriberPreference = pgTable(
  'subscriber_preference',
  {
    id: bigId(),
    tenantId: bigRef('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    subscriberId: bigRef('subscriber_id')
      .notNull()
      .references(() => subscriber.id, { onDelete: 'cascade' }),
    topicId: bigRef('topic_id')
      .notNull()
      .references(() => topic.id, { onDelete: 'cascade' }),
    channel: channel('channel').notNull(),
    optedIn: boolean('opted_in').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('subscriber_preference_subscriber_topic_channel_unique').on(
      table.subscriberId,
      table.topicId,
      table.channel
    ),
  ]
);

export const topicTables = { topic, topicCategory, subscriberPreference };
