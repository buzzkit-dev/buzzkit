const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

export type FcmServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

export function parseServiceAccount(input: unknown): FcmServiceAccount | null {
  const value = typeof input === 'string' ? safeJsonParse(input) : input;
  if (!value || typeof value !== 'object') return null;

  const record = value as Record<string, unknown>;
  if (
    typeof record.project_id !== 'string' ||
    typeof record.client_email !== 'string' ||
    typeof record.private_key !== 'string'
  ) {
    return null;
  }

  return {
    project_id: record.project_id,
    client_email: record.client_email,
    private_key: record.private_key,
  };
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function base64UrlEncode(data: Uint8Array | string): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToPkcs8(pem: string): Uint8Array {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\\n/g, '')
    .replace(/\s/g, '');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function createFcmAssertion(account: FcmServiceAccount): Promise<string> {
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(account.private_key) as BufferSource,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64UrlEncode(
    JSON.stringify({
      iss: account.client_email,
      scope: FCM_SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    })
  );
  const signingInput = `${header}.${claims}`;

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput)
  );

  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
}

export type FcmTokenResult =
  | { ok: true; accessToken: string; expiresIn: number }
  | { ok: false; reason: string; transportError: boolean };

export async function requestFcmAccessToken(account: FcmServiceAccount): Promise<FcmTokenResult> {
  let assertion: string;
  try {
    assertion = await createFcmAssertion(account);
  } catch {
    return { ok: false, reason: 'invalid_private_key', transportError: false };
  }

  try {
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });

    const body = (await response.json().catch(() => ({}))) as {
      access_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };

    if (response.ok && body.access_token) {
      return { ok: true, accessToken: body.access_token, expiresIn: body.expires_in ?? 3600 };
    }

    return {
      ok: false,
      reason: body.error_description ?? body.error ?? `token_endpoint_${response.status}`,
      transportError: false,
    };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
      transportError: true,
    };
  }
}
