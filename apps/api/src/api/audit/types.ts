import type { ApiKey } from '@buzzkit/api/api/keys/index';
import type { tables } from '@buzzkit/database';
import type { AuditEventName } from './catalog';

export type AuditRow = typeof tables.event.$inferSelect;

export type ActorUser = { id: string; email: string };

export type Actor =
  | { type: 'member'; user: ActorUser; memberId?: number }
  | { type: 'key'; apiKey: ApiKey }
  | { type: 'system' };

export type AuditEntry = {
  event: AuditEventName;
  workspaceId?: number | null;
  tenantId?: number;
  target?: { type: string; id: string | number };
  data?: Record<string, unknown>;
};

export type AuditFn = (entry: AuditEntry) => Promise<void>;

export type AuditFilters = {
  q?: string;
  event?: string;
  actorType?: 'member' | 'user' | 'key' | 'system';
  from?: string;
  to?: string;
};
