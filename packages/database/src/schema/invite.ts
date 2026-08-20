import { sql } from 'drizzle-orm';
import { index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { workspace, workspaceMember, workspaceMemberRole } from './workspace';

export const workspaceInvite = pgTable(
  'workspace_invite',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    workspaceId: integer('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: workspaceMemberRole('role').notNull().default('member'),
    token: text('token').notNull(),
    invitedByMemberId: integer('invited_by_member_id').references(() => workspaceMember.id),
    expiresAt: timestamp('expires_at').notNull(),
    acceptedAt: timestamp('accepted_at'),
    acceptedMemberId: integer('accepted_member_id').references(() => workspaceMember.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => [
    uniqueIndex('workspace_invite_token_unique').on(table.token).where(sql`${table.deletedAt} is null`),
    uniqueIndex('workspace_invite_workspace_email_unique')
      .on(table.workspaceId, table.email)
      .where(sql`${table.deletedAt} is null and ${table.acceptedAt} is null`),
    index('workspace_invite_workspace_idx').on(table.workspaceId),
  ]
);

export const inviteTables = { workspaceInvite };
