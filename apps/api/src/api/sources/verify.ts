import { toHex } from '@buzzkit/api/libs/encoding';
import type { Verification } from '@buzzkit/schema/sources';
import { SIGNATURE_TOLERANCE_SECONDS } from '@buzzkit/schema/sources';
import { verifyWebhook } from 'buzzkit/webhooks';

export type Rejection = { reason: string; detail: string };

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1)
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
}

function header(headers: Headers, name: string): string | null {
  return headers.get(name);
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return toHex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)));
}

async function verifyStripe(
  body: string,
  headers: Headers,
  name: string,
  secret: string,
  now: number
): Promise<Rejection | null> {
  const raw = header(headers, name);
  if (!raw) return { reason: 'missing_headers', detail: `No ${name} header` };
  const parts = raw.split(',').map((part) => part.trim().split('='));
  const timestamp = Number(parts.find(([key]) => key === 't')?.[1]);
  const presented = parts.filter(([key]) => key === 'v1').map(([, value]) => value ?? '');
  if (!Number.isInteger(timestamp) || presented.length === 0) {
    return { reason: 'invalid_signature', detail: 'Stripe-Signature is malformed' };
  }
  if (Math.abs(now - timestamp) > SIGNATURE_TOLERANCE_SECONDS) {
    return {
      reason: 'timestamp_out_of_tolerance',
      detail: 'The signature timestamp is older than five minutes',
    };
  }
  const expected = await hmacHex(secret, `${timestamp}.${body}`);
  return presented.some((signature) => constantTimeEqual(signature, expected))
    ? null
    : { reason: 'invalid_signature', detail: 'The signature does not match the secret' };
}

async function verifyStandard(
  body: string,
  headers: Headers,
  names: { id: string; timestamp: string; signature: string },
  secret: string,
  now: number
): Promise<Rejection | null> {
  const remapped = new Headers();
  for (const [ours, theirs] of [
    ['webhook-id', names.id],
    ['webhook-timestamp', names.timestamp],
    ['webhook-signature', names.signature],
  ] as const) {
    const value = header(headers, theirs);
    if (value) remapped.set(ours, value);
  }
  try {
    await verifyWebhook(body, remapped, secret, { now });
    return null;
  } catch (error) {
    const code = (error as { code?: string }).code ?? 'invalid_signature';
    return { reason: code, detail: (error as Error).message };
  }
}

export async function verifyDelivery(
  verification: Verification,
  body: string,
  headers: Headers,
  secret: string,
  now = Math.floor(Date.now() / 1000)
): Promise<Rejection | null> {
  if (verification.scheme === 'stripe') {
    return verifyStripe(body, headers, verification.header ?? 'stripe-signature', secret, now);
  }
  if (verification.scheme === 'standard-webhooks') {
    return verifyStandard(body, headers, verification.headers, secret, now);
  }
  const presented = header(headers, verification.header);
  if (!presented) return { reason: 'missing_headers', detail: `No ${verification.header} header` };
  return constantTimeEqual(presented, secret)
    ? null
    : { reason: 'invalid_signature', detail: `${verification.header} does not match the secret` };
}
