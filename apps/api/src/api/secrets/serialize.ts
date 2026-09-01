import type { Secret } from './types';

export function serializeSecret(secret: Secret) {
  return {
    id: secret.id,
    name: secret.name,
    version: secret.version,
    createdAt: secret.createdAt,
    updatedAt: secret.updatedAt,
  };
}
