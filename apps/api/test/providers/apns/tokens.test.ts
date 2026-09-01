import { createApnsJwt } from '@buzzkit/api/providers/apns/index';
import { jwtCacheKey } from '@buzzkit/api/providers/apns/tokens';
import { describe, expect, it } from 'vitest';
import { generateP8 } from '../../utils/providerKeys';

function decodeSegment(segment: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(segment, 'base64url').toString());
}

describe('createApnsJwt', () => {
  it('signs an ES256 JWT carrying the key id and team', async () => {
    const p8 = await generateP8();
    const jwt = await createApnsJwt({ p8, teamId: 'TEAM123456', keyId: 'KEYID12345' });
    const [header, claims, signature] = jwt.split('.');

    expect(decodeSegment(header!)).toMatchObject({ alg: 'ES256', kid: 'KEYID12345' });
    const parsed = decodeSegment(claims!);
    expect(parsed.iss).toBe('TEAM123456');
    expect(parsed.iat as number).toBeGreaterThan(Math.floor(Date.now() / 1000) - 60);
    expect(Buffer.from(signature!, 'base64url').length).toBe(64);
  });

  it('rejects a key that is not P-256 PKCS#8', async () => {
    await expect(createApnsJwt({ p8: 'not-a-key', teamId: 'T', keyId: 'K' })).rejects.toThrow();
  });
});

describe('jwtCacheKey', () => {
  it('scopes the cache entry to the credential and its version', () => {
    expect(jwtCacheKey({ credentialId: 7, credentialUpdatedAt: 1234 })).toBe('apns:jwt:7:1234');
  });
});
