import { base64UrlEncode, pemToPkcs8 } from './encoding';

type Algorithm = {
  alg: 'ES256' | 'RS256';
  importParams: Parameters<SubtleCrypto['importKey']>[2];
  signParams: Parameters<SubtleCrypto['sign']>[0];
};

const ALGORITHMS = {
  ES256: {
    alg: 'ES256',
    importParams: { name: 'ECDSA', namedCurve: 'P-256' },
    signParams: { name: 'ECDSA', hash: 'SHA-256' },
  },
  RS256: {
    alg: 'RS256',
    importParams: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    signParams: { name: 'RSASSA-PKCS1-v1_5' },
  },
} as const satisfies Record<string, Algorithm>;

export async function signJwt(params: {
  algorithm: keyof typeof ALGORITHMS;
  privateKeyPem: string;
  header?: Record<string, unknown>;
  claims: Record<string, unknown>;
}): Promise<string> {
  const algorithm = ALGORITHMS[params.algorithm];
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(params.privateKeyPem) as BufferSource,
    algorithm.importParams,
    false,
    ['sign']
  );

  const header = base64UrlEncode(JSON.stringify({ alg: algorithm.alg, typ: 'JWT', ...params.header }));
  const claims = base64UrlEncode(JSON.stringify(params.claims));
  const signingInput = `${header}.${claims}`;

  const signature = await crypto.subtle.sign(
    algorithm.signParams,
    key,
    new TextEncoder().encode(signingInput)
  );

  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
}
