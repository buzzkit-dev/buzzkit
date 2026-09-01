import type { tables } from '@buzzkit/database';

export type ApiKey = typeof tables.apiKey.$inferSelect;

export type ApiKeyKind = ApiKey['kind'];

export type ResolvedApiKey = {
  key: ApiKey;
  workspace: typeof tables.workspace.$inferSelect;
  tenant: typeof tables.tenant.$inferSelect | null;
};
