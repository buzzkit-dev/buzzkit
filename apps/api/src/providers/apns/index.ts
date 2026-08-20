/**
 * APNs building blocks (Phase 0 spike, grows into the real provider in Phase 4).
 *
 * APNs only speaks HTTP/2. Workers' fetch negotiates HTTP/2 at the Cloudflare
 * edge in production; local workerd on macOS is known to be flaky here
 * (cloudflare/workerd#4841) — the probe below tells us which world we're in.
 */

const HOSTS = {
  production: 'https://api.push.apple.com',
  sandbox: 'https://api.sandbox.push.apple.com',
} as const;

export type ApnsEnvironment = keyof typeof HOSTS;

function base64UrlEncode(data: Uint8Array | string): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToPkcs8(p8: string): Uint8Array {
  const base64 = p8
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Provider token for APNs: ES256 JWT over the .p8 key. Apple accepts tokens up
 * to 1h old and throttles regeneration — Phase 4 caches these in KV (~50min).
 */
export async function createApnsJwt(params: { p8: string; teamId: string; keyId: string }): Promise<string> {
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(params.p8) as BufferSource,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  const header = base64UrlEncode(JSON.stringify({ alg: 'ES256', kid: params.keyId }));
  const claims = base64UrlEncode(JSON.stringify({ iss: params.teamId, iat: Math.floor(Date.now() / 1000) }));
  const signingInput = `${header}.${claims}`;

  // WebCrypto ECDSA emits raw r||s (64 bytes) — exactly the JOSE ES256 format
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(signingInput)
  );

  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
}

export type ApnsResult = {
  ok: boolean;
  status: number;
  apnsId: string | null;
  reason: string | null;
};

export async function sendApns(params: {
  jwt: string;
  deviceToken: string;
  bundleId: string;
  environment: ApnsEnvironment;
  payload: Record<string, unknown>;
  pushType?: string;
  priority?: number;
}): Promise<ApnsResult> {
  const response = await fetch(`${HOSTS[params.environment]}/3/device/${params.deviceToken}`, {
    method: 'POST',
    headers: {
      authorization: `bearer ${params.jwt}`,
      'apns-topic': params.bundleId,
      'apns-push-type': params.pushType ?? 'alert',
      'apns-priority': String(params.priority ?? 10),
      'content-type': 'application/json',
    },
    body: JSON.stringify(params.payload),
  });

  let reason: string | null = null;
  if (!response.ok) {
    try {
      const body = (await response.json()) as { reason?: string };
      reason = body.reason ?? null;
    } catch {
      reason = null;
    }
  }

  return {
    ok: response.ok,
    status: response.status,
    apnsId: response.headers.get('apns-id'),
    reason,
  };
}

export type ApnsProbeResult = {
  http2: boolean;
  status: number | null;
  reason: string | null;
  error: string | null;
};

/**
 * Unauthenticated reachability probe: APNs kills non-HTTP/2 connections at the
 * transport level, so ANY HTTP status back (403 MissingProviderToken expected)
 * proves the runtime negotiated HTTP/2 end-to-end.
 */
export async function probeApns(environment: ApnsEnvironment = 'sandbox'): Promise<ApnsProbeResult> {
  try {
    const response = await fetch(`${HOSTS[environment]}/3/device/${'0'.repeat(64)}`, {
      method: 'POST',
      headers: {
        'apns-topic': 'dev.buzzkit.probe',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ aps: { alert: 'probe' } }),
    });

    let reason: string | null = null;
    try {
      const body = (await response.json()) as { reason?: string };
      reason = body.reason ?? null;
    } catch {
      reason = null;
    }

    return { http2: true, status: response.status, reason, error: null };
  } catch (error) {
    return {
      http2: false,
      status: null,
      reason: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
