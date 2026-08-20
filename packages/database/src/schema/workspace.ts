import { sql } from 'drizzle-orm';
import { index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { user } from './auth';

export const workspaceMemberRole = pgEnum('workspace_member_role', ['member', 'admin', 'owner']);

export const workspace = pgTable(
  'workspace',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    avatarUrl: text('avatar_url'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => [uniqueIndex('workspace_slug_unique').on(table.slug).where(sql`${table.deletedAt} is null`)]
);

export const workspaceMember = pgTable(
  'workspace_member',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    workspaceId: integer('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: workspaceMemberRole('role').notNull().default('member'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => [
    uniqueIndex('workspace_member_workspace_user_unique')
      .on(table.workspaceId, table.userId)
      .where(sql`${table.deletedAt} is null`),
    index('workspace_member_user_idx').on(table.userId),
  ]
);

export const workspaceTables = { workspace, workspaceMember };
