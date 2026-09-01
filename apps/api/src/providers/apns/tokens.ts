import { signJwt } from '../shared/jwt';

export const JWT_TTL_SECONDS = 50 * 60;

export function jwtCacheKey(input: { credentialId: number; credentialUpdatedAt: number }): string {
  return `apns:jwt:${input.credentialId}:${input.credentialUpdatedAt}`;
}

export function createApnsJwt(params: { p8: string; teamId: string; keyId: string }): Promise<string> {
  return signJwt({
    algorithm: 'ES256',
    privateKeyPem: params.p8,
    header: { kid: params.keyId },
    claims: { iss: params.teamId, iat: Math.floor(Date.now() / 1000) },
  });
}
