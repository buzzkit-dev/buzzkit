import type { Actor, AuditFn } from '@buzzkit/api/api/audit/index';
import type { ApiKey } from '@buzzkit/api/api/keys/index';
import type { WorkspaceMember } from '@buzzkit/api/api/members/index';
import type { Tenant } from '@buzzkit/api/api/tenants/index';
import type { Workspace } from '@buzzkit/api/api/workspaces/index';
import type { InferSelectModel, tables } from '@buzzkit/database';
import type { SCOPE_CATALOG, Scope } from '../scopes';

export type User = InferSelectModel<typeof tables.auth.user>;

export type Session = InferSelectModel<typeof tables.auth.session>;

export type CachedSession = {
  user: User;
  session: Session;
};

export type WorkspaceScope = {
  [K in Scope]: (typeof SCOPE_CATALOG)[K]['context'] extends 'workspace' ? K : never;
}[Scope];

export type TenantScope = {
  [K in Scope]: (typeof SCOPE_CATALOG)[K]['context'] extends 'tenant' ? K : never;
}[Scope];

export type AccountAction = 'read' | 'write';

export type WorkspaceAuth = {
  user: User | null;
  session: Session | null;
  workspace: Workspace;
  membership: WorkspaceMember | null;
  apiKey: ApiKey | null;
  scopes: readonly string[];
  actor: Actor;
  audit: AuditFn;
};

export type TenantAuth = WorkspaceAuth & { tenant: Tenant };
