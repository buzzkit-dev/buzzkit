import { providerFetch } from '../shared/http';
import { signJwt } from '../shared/jwt';
import type { DeliveryErrorCode } from '../types';
import type { FcmServiceAccount } from './account';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export const TOKEN_TTL_MARGIN_SECONDS = 300;

export class TokenError extends Error {
  constructor(
    public code: DeliveryErrorCode,
    message: string
  ) {
    super(message);
  }
}

export function tokenCacheKey(input: { credentialId: number; credentialUpdatedAt: number }): string {
  return `fcm:token:${input.credentialId}:${input.credentialUpdatedAt}`;
}

type AccessToken =
  | { ok: true; accessToken: string; expiresIn: number }
  | { ok: false; code: DeliveryErrorCode; reason: string };

export async function requestAccessToken(account: FcmServiceAccount): Promise<AccessToken> {
  let assertion: string;
  try {
    const now = Math.floor(Date.now() / 1000);
    assertion = await signJwt({
      algorithm: 'RS256',
      privateKeyPem: account.private_key,
      claims: {
        iss: account.client_email,
        scope: 'https://www.googleapis.com/auth/firebase.messaging',
        aud: TOKEN_URL,
        iat: now,
        exp: now + 3600,
      },
    });
  } catch {
    return {
      ok: false,
      code: 'invalid_credential',
      reason: 'The service account private key is not a valid RSA PKCS#8 key',
    };
  }

  const result = await providerFetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });

  if (!result.ok) {
    return { ok: false, code: result.code, reason: result.reason };
  }

  const body = (result.captured.body ?? {}) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (result.response.ok && body.access_token) {
    return { ok: true, accessToken: body.access_token, expiresIn: body.expires_in ?? 3600 };
  }

  return {
    ok: false,
    code:
      result.response.status === 429
        ? 'rate_limited'
        : result.response.status >= 500
          ? 'provider_unavailable'
          : 'invalid_credential',
    reason: body.error_description ?? body.error ?? `token_endpoint_${result.response.status}`,
  };
}
