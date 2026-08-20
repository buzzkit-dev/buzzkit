import { UnauthorizedError } from './error';

export async function computeIdentityHash(externalId: string, identitySecret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(identitySecret) as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(externalId));

  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function verifyIdentity(
  tenant: { requireIdentityVerification: boolean; identitySecret: string | null },
  externalId: string,
  identityHash: string | null | undefined
): Promise<void> {
  if (!tenant.requireIdentityVerification) return;

  if (!tenant.identitySecret || !identityHash) {
    throw new UnauthorizedError('Identity verification required — provide identityHash');
  }

  const expected = await computeIdentityHash(externalId, tenant.identitySecret);

  const provided = identityHash.toLowerCase();
  if (provided.length !== expected.length) {
    throw new UnauthorizedError('Invalid identity hash');
  }

  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  }

  if (mismatch !== 0) {
    throw new UnauthorizedError('Invalid identity hash');
  }
}
