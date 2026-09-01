import { resolveTenantSettings } from '@buzzkit/api/api/tenants/index';
import { toHex } from './encoding';
import { BadRequestError, UnauthorizedError } from './error';

export async function computeIdentityHash(externalId: string, identitySecret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(identitySecret) as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(externalId));
  return toHex(signature);
}

export function resolveClientIdentity(headers: Record<string, string | undefined>): {
  externalId: string;
  identityHash: string | undefined;
} {
  const externalId = headers['buzzkit-subscriber'];
  if (!externalId) {
    throw new BadRequestError('Missing buzzkit-subscriber header', { code: 'subscriber_header_missing' });
  }
  return { externalId, identityHash: headers['buzzkit-identity'] };
}

type IdentityTenant = { settings: unknown; identitySecret: string | null };

export async function verifyClientIdentity(
  tenant: IdentityTenant,
  headers: Record<string, string | undefined>
): Promise<string> {
  const { externalId, identityHash } = resolveClientIdentity(headers);
  await verifyIdentity(tenant, externalId, identityHash);
  return externalId;
}

export async function verifyIdentity(
  tenant: IdentityTenant,
  externalId: string,
  identityHash: string | null | undefined
): Promise<boolean> {
  if (!identityHash) {
    if (resolveTenantSettings(tenant.settings).identity.requireVerification) {
      throw new UnauthorizedError('Identity verification required — provide identityHash', {
        code: 'identity_required',
        param: 'identityHash',
      });
    }
    return false;
  }

  if (!tenant.identitySecret) {
    throw new UnauthorizedError('Identity verification is not configured for this tenant', {
      code: 'identity_not_configured',
    });
  }

  const expected = await computeIdentityHash(externalId, tenant.identitySecret);

  const provided = identityHash.toLowerCase();
  if (provided.length !== expected.length) {
    throw new UnauthorizedError('Invalid identity hash', {
      code: 'invalid_identity_hash',
      param: 'identityHash',
    });
  }

  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  }

  if (mismatch !== 0) {
    throw new UnauthorizedError('Invalid identity hash', {
      code: 'invalid_identity_hash',
      param: 'identityHash',
    });
  }

  return true;
}
