import { WEBHOOK_SIGNATURE_VERSION, WEBHOOK_TOLERANCE_SECONDS } from './constants';
import { constantTimeEqual, toBase64 } from './encoding';
import { WebhookVerificationError } from './errors';
import { importWebhookSecret } from './secret';
import type { HeaderSource, VerifiedWebhook, VerifyOptions } from './types';

export async function signWebhook(
  secret: string,
  id: string,
  timestampSeconds: number,
  body: string
): Promise<string> {
  const key = await importWebhookSecret(secret);
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${id}.${timestampSeconds}.${body}`)
  );
  return `${WEBHOOK_SIGNATURE_VERSION},${toBase64(new Uint8Array(signature))}`;
}

export async function verifyWebhook(
  body: string,
  headers: HeaderSource,
  secret: string | string[],
  options: VerifyOptions = {}
): Promise<VerifiedWebhook> {
  const id = readHeader(headers, 'webhook-id');
  const timestampHeader = readHeader(headers, 'webhook-timestamp');
  const signatureHeader = readHeader(headers, 'webhook-signature');
  if (!id || !timestampHeader || !signatureHeader) {
    throw new WebhookVerificationError('Missing webhook headers', 'missing_headers');
  }

  const timestamp = Number(timestampHeader);
  const now = options.now ?? Math.floor(Date.now() / 1000);
  const tolerance = options.toleranceSeconds ?? WEBHOOK_TOLERANCE_SECONDS;
  if (!Number.isInteger(timestamp) || Math.abs(now - timestamp) > tolerance) {
    throw new WebhookVerificationError(
      'Webhook timestamp is outside the tolerance',
      'timestamp_out_of_tolerance'
    );
  }

  const prefix = `${WEBHOOK_SIGNATURE_VERSION},`;
  const presented = signatureHeader
    .split(' ')
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith(prefix))
    .map((entry) => entry.slice(prefix.length));

  for (const candidate of Array.isArray(secret) ? secret : [secret]) {
    const expected = (await signWebhook(candidate, id, timestamp, body)).slice(prefix.length);
    if (presented.some((signature) => constantTimeEqual(signature, expected))) {
      return { id, timestamp };
    }
  }
  throw new WebhookVerificationError('Webhook signature does not match', 'invalid_signature');
}

function readHeader(headers: HeaderSource, name: string): string | null {
  if (headers instanceof Headers) return headers.get(name);
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name);
  const value = key === undefined ? undefined : headers[key];
  return typeof value === 'string' ? value : null;
}
