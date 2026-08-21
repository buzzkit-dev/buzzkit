import { buildFcmMessage } from '@buzzkit/api/providers/fcm/index';
import { base64UrlEncode, pemToPkcs8 } from '@buzzkit/api/providers/shared/encoding';
import { signJwt } from '@buzzkit/api/providers/shared/jwt';
import { describe, expect, it } from 'vitest';
import { generateP8, generateServiceAccount } from '../../utils/providerKeys';

const decode = (segment: string) =>
  JSON.parse(Buffer.from(segment.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));

async function publicKeyFrom(pem: string, algorithm: 'ES256' | 'RS256') {
  const params =
    algorithm === 'ES256'
      ? { name: 'ECDSA', namedCurve: 'P-256' }
      : { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
  const privateKey = await crypto.subtle.importKey('pkcs8', pemToPkcs8(pem) as BufferSource, params, true, [
    'sign',
  ]);
  const {
    d: _d,
    p: _p,
    q: _q,
    dp: _dp,
    dq: _dq,
    qi: _qi,
    ...jwk
  } = await crypto.subtle.exportKey('jwk', privateKey);
  return crypto.subtle.importKey('jwk', { ...jwk, key_ops: ['verify'] }, params, false, ['verify']);
}

describe('signJwt', () => {
  it('produces a verifiable ES256 token with the requested header and claims', async () => {
    const pem = await generateP8();
    const token = await signJwt({
      algorithm: 'ES256',
      privateKeyPem: pem,
      header: { kid: 'KEY1234567' },
      claims: { iss: 'TEAM123456', iat: 1700000000 },
    });
    const [header, claims, signature] = token.split('.') as [string, string, string];
    expect(decode(header)).toEqual({ alg: 'ES256', typ: 'JWT', kid: 'KEY1234567' });
    expect(decode(claims)).toEqual({ iss: 'TEAM123456', iat: 1700000000 });
    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      await publicKeyFrom(pem, 'ES256'),
      Buffer.from(signature.replace(/-/g, '+').replace(/_/g, '/'), 'base64'),
      new TextEncoder().encode(`${header}.${claims}`)
    );
    expect(ok).toBe(true);
  });

  it('produces a verifiable RS256 token for Google service accounts, with escaped newlines tolerated', async () => {
    const account = await generateServiceAccount('proj');
    const escaped = account.private_key.replace(/\n/g, '\\n');
    const token = await signJwt({
      algorithm: 'RS256',
      privateKeyPem: escaped,
      claims: { iss: account.client_email, scope: 'x', aud: 'y', iat: 1, exp: 2 },
    });
    const [header, claims, signature] = token.split('.') as [string, string, string];
    expect(decode(header)).toEqual({ alg: 'RS256', typ: 'JWT' });
    const ok = await crypto.subtle.verify(
      { name: 'RSASSA-PKCS1-v1_5' },
      await publicKeyFrom(account.private_key, 'RS256'),
      Buffer.from(signature.replace(/-/g, '+').replace(/_/g, '/'), 'base64'),
      new TextEncoder().encode(`${header}.${claims}`)
    );
    expect(ok).toBe(true);
  });

  it('base64url never emits padding or URL-unsafe characters', () => {
    for (const bytes of [
      new Uint8Array([251, 255]),
      new Uint8Array([0]),
      new Uint8Array([62, 63, 62, 63, 1]),
    ]) {
      expect(base64UrlEncode(bytes)).toMatch(/^[A-Za-z0-9_-]+$/);
    }
    expect(base64UrlEncode('hi')).toBe('aGk');
  });
});

describe('buildFcmMessage', () => {
  it('stringifies data values, carries ttl from expiresAt, and maps priority and collapse keys', () => {
    const expiresAt = new Date(Date.now() + 90_000);
    const message = buildFcmMessage(
      'device-token',
      {
        title: 'T',
        body: 'B',
        data: { n: 1, s: 'x', nested: { a: 1 } },
        collapseId: 'c',
        priority: 'normal',
        sound: 'ping',
      },
      expiresAt
    ) as { message: Record<string, unknown> };
    expect(message.message.token).toBe('device-token');
    expect(message.message.notification).toEqual({ title: 'T', body: 'B' });
    expect(message.message.data).toEqual({ n: '1', s: 'x', nested: '{"a":1}' });
    const android = message.message.android as Record<string, unknown>;
    expect(android.priority).toBe('NORMAL');
    expect(android.collapse_key).toBe('c');
    expect(String(android.ttl)).toMatch(/^\d+s$/);
  });
});
