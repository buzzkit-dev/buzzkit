import { sql } from 'drizzle-orm';
import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { subscriber } from './subscriber';
import { tenant } from './tenant';

export const topic = pgTable(
  'topic',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    defaultOptedIn: boolean('default_opted_in').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => [
    uniqueIndex('topic_tenant_slug_unique')
      .on(table.tenantId, table.slug)
      .where(sql`${table.deletedAt} is null`),
    index('topic_tenant_idx').on(table.tenantId),
  ]
);

export const subscriberPreference = pgTable(
  'subscriber_preference',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    subscriberId: integer('subscriber_id')
      .notNull()
      .references(() => subscriber.id, { onDelete: 'cascade' }),
    topicId: integer('topic_id')
      .notNull()
      .references(() => topic.id, { onDelete: 'cascade' }),
    optedIn: boolean('opted_in').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('subscriber_preference_unique').on(table.subscriberId, table.topicId),
    index('subscriber_preference_topic_idx').on(table.topicId),
    index('subscriber_preference_tenant_idx').on(table.tenantId),
  ]
);

export const topicTables = { topic, subscriberPreference };
