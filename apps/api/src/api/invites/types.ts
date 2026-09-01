import type { tables } from '@buzzkit/database';

export type WorkspaceInvite = typeof tables.workspaceInvite.$inferSelect;

export type WorkspaceMemberRow = typeof tables.workspaceMember.$inferSelect;
