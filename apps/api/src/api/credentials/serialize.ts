import type { Credential } from './types';

export function serializeCredential(credential: Credential) {
  return {
    id: credential.id,
    channel: credential.channel,
    provider: credential.provider,
    environment: credential.environment,
    details: credential.details,
    status: credential.status,
    validatedAt: credential.validatedAt,
    lastError: credential.lastError,
    createdAt: credential.createdAt,
    updatedAt: credential.updatedAt,
  };
}
