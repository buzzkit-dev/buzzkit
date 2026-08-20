import { sql } from 'drizzle-orm';
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { workspace } from './workspace';

export const tenant = pgTable(
  'tenant',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    workspaceId: integer('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    identitySecret: text('identity_secret'),
    settings: jsonb('settings').notNull().default({}),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => [
    uniqueIndex('tenant_workspace_slug_unique')
      .on(table.workspaceId, table.slug)
      .where(sql`${table.deletedAt} is null`),
    uniqueIndex('tenant_workspace_default_unique')
      .on(table.workspaceId)
      .where(sql`${table.deletedAt} is null and ${table.isDefault} = true`),
    index('tenant_workspace_idx').on(table.workspaceId),
  ]
);

export const tenantTables = { tenant };
