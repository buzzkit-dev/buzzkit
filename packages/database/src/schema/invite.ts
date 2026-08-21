import { sql } from 'drizzle-orm';
import { pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { bigId, bigRef, createdAt, deletedAt, timestamptz, updatedAt } from './shared';
import { workspace, workspaceMember, workspaceMemberRole } from './workspace';

export const workspaceInvite = pgTable(
  'workspace_invite',
  {
    id: bigId(),
    workspaceId: bigRef('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: workspaceMemberRole('role').notNull().default('member'),
    token: text('token').notNull(),
    invitedByMemberId: bigRef('invited_by_member_id').references(() => workspaceMember.id, {
      onDelete: 'set null',
    }),
    expiresAt: timestamptz('expires_at').notNull(),
    acceptedAt: timestamptz('accepted_at'),
    acceptedMemberId: bigRef('accepted_member_id').references(() => workspaceMember.id, {
      onDelete: 'set null',
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (table) => [
    uniqueIndex('workspace_invite_token_unique').on(table.token).where(sql`${table.deletedAt} is null`),
    uniqueIndex('workspace_invite_workspace_email_unique')
      .on(table.workspaceId, table.email)
      .where(sql`${table.deletedAt} is null and ${table.acceptedAt} is null`),
  ]
);

export const inviteTables = { workspaceInvite };
