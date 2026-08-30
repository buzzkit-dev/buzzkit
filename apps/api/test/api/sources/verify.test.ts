import { verifyDelivery } from '@buzzkit/api/api/sources/verify';
import { toHex } from '@buzzkit/api/libs/encoding';
import { GENERIC_SECRET_HEADER, SOURCE_PRESETS } from '@buzzkit/schema/sources';
import { signWebhook } from 'buzzkit/webhooks';
import { describe, expect, it } from 'vitest';

const body = JSON.stringify({ id: 'evt_1', type: 'invoice.paid' });
const now = 1_756_400_000;

async function stripeSignature(secret: string, timestamp: number, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`));
  return `t=${timestamp},v1=${toHex(digest)}`;
}

describe('verifyDelivery', () => {
  describe('stripe', () => {
    const verification = SOURCE_PRESETS.stripe.verification;

    it('accepts a signature computed over the timestamp and the raw body', async () => {
      const headers = new Headers({ 'stripe-signature': await stripeSignature('whsec_a', now - 10, body) });
      expect(await verifyDelivery(verification, body, headers, 'whsec_a', now)).toBeNull();
    });

    it('accepts any of several v1 signatures during a secret rotation', async () => {
      const stale = (await stripeSignature('whsec_old', now, body)).split(',')[1];
      const fresh = (await stripeSignature('whsec_new', now, body)).split(',')[1];
      const headers = new Headers({ 'stripe-signature': `t=${now},${stale},${fresh}` });
      expect(await verifyDelivery(verification, body, headers, 'whsec_new', now)).toBeNull();
    });

    it('rejects a wrong secret, a tampered body, a stale timestamp and a missing header', async () => {
      const signed = await stripeSignature('whsec_a', now, body);
      const wrong = await verifyDelivery(
        verification,
        body,
        new Headers({ 'stripe-signature': signed }),
        'whsec_b',
        now
      );
      expect(wrong?.reason).toBe('invalid_signature');
      const tampered = await verifyDelivery(
        verification,
        `${body} `,
        new Headers({ 'stripe-signature': signed }),
        'whsec_a',
        now
      );
      expect(tampered?.reason).toBe('invalid_signature');
      const old = await stripeSignature('whsec_a', now - 301, body);
      const stale = await verifyDelivery(
        verification,
        body,
        new Headers({ 'stripe-signature': old }),
        'whsec_a',
        now
      );
      expect(stale?.reason).toBe('timestamp_out_of_tolerance');
      const missing = await verifyDelivery(verification, body, new Headers(), 'whsec_a', now);
      expect(missing?.reason).toBe('missing_headers');
      const malformed = await verifyDelivery(
        verification,
        body,
        new Headers({ 'stripe-signature': 'nope' }),
        'whsec_a',
        now
      );
      expect(malformed?.reason).toBe('invalid_signature');
    });
  });

  describe('standard webhooks (superwall)', () => {
    const verification = SOURCE_PRESETS.superwall.verification;
    const secret = 'whsec_c2VjcmV0X3NlY3JldF9zZWNyZXQ=';

    async function svixHeaders(
      id: string,
      timestamp: number,
      payload: string,
      key = secret
    ): Promise<Headers> {
      return new Headers({
        'svix-id': id,
        'svix-timestamp': String(timestamp),
        'svix-signature': await signWebhook(key, id, timestamp, payload),
      });
    }

    it('accepts svix headers signed with the shared secret', async () => {
      const headers = await svixHeaders('msg_1', now, body);
      expect(await verifyDelivery(verification, body, headers, secret, now)).toBeNull();
    });

    it('rejects a different secret and a stale timestamp', async () => {
      const wrong = await verifyDelivery(
        verification,
        body,
        await svixHeaders('msg_1', now, body, 'whsec_b3RoZXI='),
        secret,
        now
      );
      expect(wrong?.reason).toBe('invalid_signature');
      const stale = await verifyDelivery(
        verification,
        body,
        await svixHeaders('msg_1', now - 400, body),
        secret,
        now
      );
      expect(stale?.reason).toBe('timestamp_out_of_tolerance');
      const missing = await verifyDelivery(verification, body, new Headers(), secret, now);
      expect(missing?.reason).toBe('missing_headers');
    });
  });

  describe('revenuecat (timestamped HMAC under its own header)', () => {
    const verification = SOURCE_PRESETS.revenuecat.verification;

    it('accepts the X-RevenueCat-Webhook-Signature header and ignores the Stripe one', async () => {
      const signed = await stripeSignature('rc_secret', now, body);
      const ok = await verifyDelivery(
        verification,
        body,
        new Headers({ 'x-revenuecat-webhook-signature': signed }),
        'rc_secret',
        now
      );
      expect(ok).toBeNull();
      const wrongHeader = await verifyDelivery(
        verification,
        body,
        new Headers({ 'stripe-signature': signed }),
        'rc_secret',
        now
      );
      expect(wrongHeader?.reason).toBe('missing_headers');
    });
  });

  describe('custom header', () => {
    const verification = SOURCE_PRESETS.custom.verification;

    it('compares the shared secret header in constant time', async () => {
      const ok = await verifyDelivery(
        verification,
        body,
        new Headers({ [GENERIC_SECRET_HEADER]: 's3cret' }),
        's3cret',
        now
      );
      expect(ok).toBeNull();
      const wrong = await verifyDelivery(
        verification,
        body,
        new Headers({ [GENERIC_SECRET_HEADER]: 's3cre' }),
        's3cret',
        now
      );
      expect(wrong?.reason).toBe('invalid_signature');
      const missing = await verifyDelivery(verification, body, new Headers(), 's3cret', now);
      expect(missing?.reason).toBe('missing_headers');
    });
  });
});
