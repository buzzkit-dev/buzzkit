import { WEBHOOK_SECRET_BYTES, WEBHOOK_SECRET_PREFIX } from './constants';
import { fromBase64, toBase64 } from './encoding';
import { WebhookVerificationError } from './errors';

export function generateWebhookSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(WEBHOOK_SECRET_BYTES));
  return `${WEBHOOK_SECRET_PREFIX}${toBase64(bytes)}`;
}

export async function importWebhookSecret(secret: string): Promise<CryptoKey> {
  if (!secret.startsWith(WEBHOOK_SECRET_PREFIX)) {
    throw new WebhookVerificationError('Webhook secrets start with whsec_', 'invalid_secret');
  }
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = fromBase64(secret.slice(WEBHOOK_SECRET_PREFIX.length));
  } catch {
    throw new WebhookVerificationError('Webhook secret is not base64', 'invalid_secret');
  }
  return await crypto.subtle.importKey('raw', bytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}
