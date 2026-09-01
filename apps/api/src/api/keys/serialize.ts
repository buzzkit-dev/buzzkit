import type { ApiKey } from './types';

export function maskApiKey(key: ApiKey) {
  return {
    id: key.id,
    name: key.name,
    kind: key.kind,
    tenantId: key.tenantId,
    token: key.kind === 'client' ? key.token : null,
    prefix: key.prefix,
    last4: key.last4,
    scopes: key.scopes,
    lastUsedAt: key.lastUsedAt,
    expiresAt: key.expiresAt,
    revokedAt: key.revokedAt,
    createdAt: key.createdAt,
    updatedAt: key.updatedAt,
  };
}
