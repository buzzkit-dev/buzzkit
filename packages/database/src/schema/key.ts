import { sql } from 'drizzle-orm';
import { check, index, pgEnum, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { user } from './auth';
import { bigId, bigRef, createdAt, deletedAt, timestamptz, updatedAt } from './shared';
import { tenant } from './tenant';
import { workspace } from './workspace';

export const apiKeyKind = pgEnum('api_key_kind', ['workspace', 'tenant', 'client']);

export const apiKey = pgTable(
  'api_key',
  {
    id: bigId(),
    workspaceId: bigRef('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    tenantId: bigRef('tenant_id').references(() => tenant.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: apiKeyKind('kind').notNull().default('workspace'),
    keyHash: text('key_hash').notNull(),
    token: text('token'),
    prefix: text('prefix').notNull(),
    last4: text('last4').notNull(),
    scopes: text('scopes').array().notNull(),
    lastUsedAt: timestamptz('last_used_at'),
    expiresAt: timestamptz('expires_at'),
    revokedAt: timestamptz('revoked_at'),
    createdByUserId: text('created_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (table) => [
    uniqueIndex('api_key_key_hash_unique').on(table.keyHash),
    index('api_key_workspace_idx').on(table.workspaceId),
    index('api_key_tenant_idx').on(table.tenantId),
    check('api_key_kind_tenant', sql`(${table.kind} = 'workspace') = (${table.tenantId} is null)`),
  ]
);

export const apiKeyTables = { apiKey };
