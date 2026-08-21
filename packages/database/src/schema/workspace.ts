import { sql } from 'drizzle-orm';
import { index, pgEnum, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { user } from './auth';
import { bigId, bigRef, createdAt, deletedAt, updatedAt } from './shared';

export const workspaceMemberRole = pgEnum('workspace_member_role', ['member', 'admin', 'owner']);

export const workspace = pgTable(
  'workspace',
  {
    id: bigId(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    avatarUrl: text('avatar_url'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (table) => [uniqueIndex('workspace_slug_unique').on(table.slug).where(sql`${table.deletedAt} is null`)]
);

export const workspaceMember = pgTable(
  'workspace_member',
  {
    id: bigId(),
    workspaceId: bigRef('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: workspaceMemberRole('role').notNull().default('member'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (table) => [
    uniqueIndex('workspace_member_workspace_user_unique')
      .on(table.workspaceId, table.userId)
      .where(sql`${table.deletedAt} is null`),
    index('workspace_member_user_idx').on(table.userId),
  ]
);

export const workspaceTables = { workspace, workspaceMember };
