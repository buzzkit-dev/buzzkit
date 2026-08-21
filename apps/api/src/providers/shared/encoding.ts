import { fromBase64, toBase64Url } from '@buzzkit/api/libs/encoding';

export const base64UrlEncode = toBase64Url;

export function pemToPkcs8(pem: string): Uint8Array {
  return fromBase64(
    pem
      .replace(/-----BEGIN PRIVATE KEY-----/, '')
      .replace(/-----END PRIVATE KEY-----/, '')
      .replace(/\\n/g, '')
      .replace(/\s/g, '')
  );
}
