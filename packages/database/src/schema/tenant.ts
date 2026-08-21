import { sql } from 'drizzle-orm';
import { boolean, check, index, jsonb, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { bigId, bigRef, createdAt, deletedAt, updatedAt } from './shared';
import { workspace } from './workspace';

export const tenant = pgTable(
  'tenant',
  {
    id: bigId(),
    workspaceId: bigRef('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    identitySecret: text('identity_secret'),
    settings: jsonb('settings').notNull().default({}),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (table) => [
    uniqueIndex('tenant_workspace_slug_unique')
      .on(table.workspaceId, table.slug)
      .where(sql`${table.deletedAt} is null`),
    uniqueIndex('tenant_workspace_default_unique')
      .on(table.workspaceId)
      .where(sql`${table.deletedAt} is null and ${table.isDefault} = true`),
    index('tenant_workspace_idx').on(table.workspaceId, table.id),
    check('tenant_settings_object', sql`jsonb_typeof(${table.settings}) = 'object'`),
    check('tenant_metadata_object', sql`jsonb_typeof(${table.metadata}) = 'object'`),
  ]
);

export const tenantTables = { tenant };
