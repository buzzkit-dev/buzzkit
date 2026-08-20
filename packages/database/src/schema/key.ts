import { index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { user } from './auth';
import { tenant } from './tenant';
import { workspace } from './workspace';

export const apiKey = pgTable(
  'api_key',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    workspaceId: integer('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    tenantId: integer('tenant_id').references(() => tenant.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: text('kind', { enum: ['workspace', 'tenant'] })
      .notNull()
      .default('workspace'),
    keyHash: text('key_hash').notNull(),
    prefix: text('prefix').notNull(),
    last4: text('last4').notNull(),
    scopes: text('scopes').array().notNull(),
    lastUsedAt: timestamp('last_used_at'),
    expiresAt: timestamp('expires_at'),
    revokedAt: timestamp('revoked_at'),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => user.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => [
    uniqueIndex('api_key_hash_unique').on(table.keyHash),
    index('api_key_workspace_idx').on(table.workspaceId),
    index('api_key_tenant_idx').on(table.tenantId),
  ]
);

export const apiKeyTables = { apiKey };
