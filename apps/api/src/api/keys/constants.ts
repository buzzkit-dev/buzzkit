import type { ApiKeyKind } from './types';

export const WORKSPACE_KEY_PREFIX = 'bk_ws_';

export const TENANT_KEY_PREFIX = 'bk_tn_';

export const CLIENT_KEY_PREFIX = 'bk_pk_';

export const KIND_PREFIXES: Record<ApiKeyKind, string> = {
  workspace: WORKSPACE_KEY_PREFIX,
  tenant: TENANT_KEY_PREFIX,
  client: CLIENT_KEY_PREFIX,
};

export const KEY_CACHE_TTL_SECONDS = 60;
