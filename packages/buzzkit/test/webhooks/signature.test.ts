import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  generateWebhookSecret,
  signWebhook,
  verifyWebhook,
  WEBHOOK_SECRET_PREFIX,
  WEBHOOK_SIGNATURE_VERSION,
  WEBHOOK_TOLERANCE_SECONDS,
  WebhookVerificationError,
} from '../../src/webhooks/index';

const secret = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw';
const otherSecret = 'whsec_C2FkZmFzZGZhc2RmYXNkZmFzZGZhc2Rm';
const id = 'whe_abcdefghijklmnopqr';
const timestamp = 1_787_000_000;
const body = '{"id":"whe_abcdefghijklmnopqr","type":"tenant.created"}';

async function headersFor(signingSecret = secret, overrides: Partial<Record<string, string>> = {}) {
  return {
    'webhook-id': id,
    'webhook-timestamp': String(timestamp),
    'webhook-signature': await signWebhook(signingSecret, id, timestamp, body),
    ...overrides,
  };
}

async function expectRejected(run: () => Promise<unknown>, code: WebhookVerificationError['code']) {
  let thrown: unknown;
  try {
    await run();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(WebhookVerificationError);
  const error = thrown as WebhookVerificationError;
  expect(error.code).toBe(code);
  expect(error.name).toBe('WebhookVerificationError');
  expect(error.message.length).toBeGreaterThan(0);
}

describe('constants', () => {
  it('pins the wire format', () => {
    expect(WEBHOOK_SIGNATURE_VERSION).toBe('v1');
    expect(WEBHOOK_SECRET_PREFIX).toBe('whsec_');
    expect(WEBHOOK_TOLERANCE_SECONDS).toBe(300);
  });
});

describe('generateWebhookSecret', () => {
  it('produces a prefixed base64 secret of 24 random bytes', () => {
    const generated = generateWebhookSecret();
    expect(generated).toMatch(/^whsec_[A-Za-z0-9+/]{32}$/);
    expect(Buffer.from(generated.slice(WEBHOOK_SECRET_PREFIX.length), 'base64')).toHaveLength(24);
  });

  it('never repeats', () => {
    const generated = new Set(Array.from({ length: 200 }, () => generateWebhookSecret()));
    expect(generated.size).toBe(200);
  });

  it('is accepted by the signer', async () => {
    const generated = generateWebhookSecret();
    const signature = await signWebhook(generated, id, timestamp, body);
    expect(await verifyWebhook(body, await headersFor(generated), generated, { now: timestamp })).toEqual({
      id,
      timestamp,
    });
    expect(signature).toMatch(/^v1,/);
  });
});

describe('signWebhook', () => {
  it('is deterministic for the same inputs', async () => {
    expect(await signWebhook(secret, id, timestamp, body)).toBe(
      await signWebhook(secret, id, timestamp, body)
    );
  });

  it('prefixes the version and encodes the HMAC as base64', async () => {
    const signature = await signWebhook(secret, id, timestamp, body);
    expect(signature).toMatch(/^v1,[A-Za-z0-9+/]{43}=$/);
    expect(Buffer.from(signature.slice(3), 'base64')).toHaveLength(32);
  });

  it('is an HMAC-SHA256 of id.timestamp.body keyed by the decoded secret', async () => {
    const expected = createHmac('sha256', Buffer.from(secret.slice(WEBHOOK_SECRET_PREFIX.length), 'base64'))
      .update(`${id}.${timestamp}.${body}`)
      .digest('base64');
    expect(await signWebhook(secret, id, timestamp, body)).toBe(`v1,${expected}`);
  });

  it('changes with every input', async () => {
    const baseline = await signWebhook(secret, id, timestamp, body);
    expect(await signWebhook(otherSecret, id, timestamp, body)).not.toBe(baseline);
    expect(await signWebhook(secret, 'whe_other', timestamp, body)).not.toBe(baseline);
    expect(await signWebhook(secret, id, timestamp + 1, body)).not.toBe(baseline);
    expect(await signWebhook(secret, id, timestamp, `${body} `)).not.toBe(baseline);
    expect(await signWebhook(secret, id, timestamp, '')).not.toBe(baseline);
  });

  it('rejects a secret without the prefix', async () => {
    await expectRejected(
      async () => signWebhook('MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw', id, timestamp, body),
      'invalid_secret'
    );
    await expectRejected(async () => signWebhook('', id, timestamp, body), 'invalid_secret');
    await expectRejected(
      async () => signWebhook('WHSEC_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw', id, timestamp, body),
      'invalid_secret'
    );
  });

  it('rejects a secret that is not base64', async () => {
    await expectRejected(async () => signWebhook('whsec_not base64!', id, timestamp, body), 'invalid_secret');
    await expectRejected(async () => signWebhook('whsec_%%%', id, timestamp, body), 'invalid_secret');
  });
});

describe('verifyWebhook', () => {
  it('round-trips with a Headers instance', async () => {
    const headers = new Headers(await headersFor());
    expect(await verifyWebhook(body, headers, secret, { now: timestamp })).toEqual({ id, timestamp });
  });

  it('reads header names case-insensitively from a Headers instance', async () => {
    const signed = await headersFor();
    const headers = new Headers({
      'Webhook-Id': signed['webhook-id'],
      'WEBHOOK-TIMESTAMP': signed['webhook-timestamp'],
      'Webhook-Signature': signed['webhook-signature'],
    });
    expect(await verifyWebhook(body, headers, secret, { now: timestamp })).toEqual({ id, timestamp });
  });

  it('round-trips with a plain lowercase header object', async () => {
    expect(await verifyWebhook(body, await headersFor(), secret, { now: timestamp })).toEqual({
      id,
      timestamp,
    });
  });

  it('reads header names case-insensitively from a plain object', async () => {
    const signed = await headersFor();
    expect(
      await verifyWebhook(
        body,
        {
          'Webhook-Id': signed['webhook-id'],
          'WEBHOOK-TIMESTAMP': signed['webhook-timestamp'],
          'webhook-Signature': signed['webhook-signature'],
        },
        secret,
        { now: timestamp }
      )
    ).toEqual({ id, timestamp });
  });

  it('ignores unrelated and near-miss keys in a plain object', async () => {
    const signed = await headersFor();
    expect(
      await verifyWebhook(
        body,
        {
          ...signed,
          'x-webhook-id': 'whe_other',
          'webhook-id-x': 'whe_other',
          'content-type': 'application/json',
        },
        secret,
        { now: timestamp }
      )
    ).toEqual({ id, timestamp });
    await expectRejected(
      async () =>
        verifyWebhook(
          body,
          {
            'x-webhook-id': id,
            webhook_timestamp: String(timestamp),
            'webhook-signature': signed['webhook-signature'],
          },
          secret,
          { now: timestamp }
        ),
      'missing_headers'
    );
  });

  it('treats a non-string plain-object value as missing', async () => {
    const signed = await headersFor();
    await expectRejected(
      async () =>
        verifyWebhook(body, { ...signed, 'webhook-timestamp': timestamp as unknown as string }, secret, {
          now: timestamp,
        }),
      'missing_headers'
    );
  });

  it('uses the current clock when now is omitted', async () => {
    const current = Math.floor(Date.now() / 1000);
    const headers = {
      'webhook-id': id,
      'webhook-timestamp': String(current),
      'webhook-signature': await signWebhook(secret, id, current, body),
    };
    expect(await verifyWebhook(body, headers, secret)).toEqual({ id, timestamp: current });
  });

  it('accepts a signature list where only a later entry matches', async () => {
    const good = await signWebhook(secret, id, timestamp, body);
    const bad = await signWebhook(otherSecret, id, timestamp, body);
    expect(
      await verifyWebhook(body, await headersFor(secret, { 'webhook-signature': `${bad} ${good}` }), secret, {
        now: timestamp,
      })
    ).toEqual({ id, timestamp });
    expect(
      await verifyWebhook(
        body,
        await headersFor(secret, { 'webhook-signature': `${bad}  ${good} ` }),
        secret,
        {
          now: timestamp,
        }
      )
    ).toEqual({ id, timestamp });
  });

  it('ignores signatures of other versions', async () => {
    const good = await signWebhook(secret, id, timestamp, body);
    expect(
      await verifyWebhook(
        body,
        await headersFor(secret, { 'webhook-signature': `v0,${good.slice(3)} ${good}` }),
        secret,
        { now: timestamp }
      )
    ).toEqual({ id, timestamp });
    await expectRejected(
      async () =>
        verifyWebhook(
          body,
          await headersFor(secret, { 'webhook-signature': `v0,${good.slice(3)}` }),
          secret,
          {
            now: timestamp,
          }
        ),
      'invalid_signature'
    );
    await expectRejected(
      async () =>
        verifyWebhook(body, await headersFor(secret, { 'webhook-signature': good.slice(3) }), secret, {
          now: timestamp,
        }),
      'invalid_signature'
    );
  });

  it('accepts an array of secrets where a later one matches', async () => {
    expect(
      await verifyWebhook(body, await headersFor(secret), [otherSecret, secret], { now: timestamp })
    ).toEqual({
      id,
      timestamp,
    });
    expect(
      await verifyWebhook(body, await headersFor(secret), [secret, otherSecret], { now: timestamp })
    ).toEqual({
      id,
      timestamp,
    });
  });

  it('rejects when no secret in the array matches', async () => {
    const third = generateWebhookSecret();
    await expectRejected(
      async () => verifyWebhook(body, await headersFor(secret), [otherSecret, third], { now: timestamp }),
      'invalid_signature'
    );
    await expectRejected(
      async () => verifyWebhook(body, await headersFor(secret), [], { now: timestamp }),
      'invalid_signature'
    );
  });

  it('rejects missing headers', async () => {
    const signed = await headersFor();
    for (const name of ['webhook-id', 'webhook-timestamp', 'webhook-signature'] as const) {
      const { [name]: _, ...rest } = signed;
      await expectRejected(
        async () => verifyWebhook(body, rest, secret, { now: timestamp }),
        'missing_headers'
      );
      await expectRejected(
        async () => verifyWebhook(body, { ...signed, [name]: '' }, secret, { now: timestamp }),
        'missing_headers'
      );
      await expectRejected(
        async () => verifyWebhook(body, { ...signed, [name]: null }, secret, { now: timestamp }),
        'missing_headers'
      );
      await expectRejected(
        async () => verifyWebhook(body, { ...signed, [name]: undefined }, secret, { now: timestamp }),
        'missing_headers'
      );
    }
    await expectRejected(async () => verifyWebhook(body, {}, secret, { now: timestamp }), 'missing_headers');
    await expectRejected(
      async () => verifyWebhook(body, new Headers(), secret, { now: timestamp }),
      'missing_headers'
    );
  });

  it('rejects a malformed secret', async () => {
    await expectRejected(
      async () =>
        verifyWebhook(body, await headersFor(), 'MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw', { now: timestamp }),
      'invalid_secret'
    );
    await expectRejected(
      async () => verifyWebhook(body, await headersFor(), 'whsec_***', { now: timestamp }),
      'invalid_secret'
    );
    await expectRejected(
      async () => verifyWebhook(body, await headersFor(), ['whsec_***', secret], { now: timestamp }),
      'invalid_secret'
    );
  });

  it('checks the headers before the secret', async () => {
    await expectRejected(
      async () => verifyWebhook(body, {}, 'garbage', { now: timestamp }),
      'missing_headers'
    );
  });

  it('accepts timestamps up to the tolerance in both directions', async () => {
    const headers = await headersFor();
    for (const now of [
      timestamp,
      timestamp + WEBHOOK_TOLERANCE_SECONDS,
      timestamp - WEBHOOK_TOLERANCE_SECONDS,
      timestamp + 1,
      timestamp - 1,
    ]) {
      expect(await verifyWebhook(body, headers, secret, { now }), String(now)).toEqual({ id, timestamp });
    }
  });

  it('rejects timestamps beyond the tolerance in both directions', async () => {
    const headers = await headersFor();
    await expectRejected(
      async () => verifyWebhook(body, headers, secret, { now: timestamp + WEBHOOK_TOLERANCE_SECONDS + 1 }),
      'timestamp_out_of_tolerance'
    );
    await expectRejected(
      async () => verifyWebhook(body, headers, secret, { now: timestamp - WEBHOOK_TOLERANCE_SECONDS - 1 }),
      'timestamp_out_of_tolerance'
    );
    await expectRejected(
      async () => verifyWebhook(body, headers, secret, { now: timestamp + 24 * 60 * 60 }),
      'timestamp_out_of_tolerance'
    );
  });

  it('honours a custom tolerance', async () => {
    const headers = await headersFor();
    expect(await verifyWebhook(body, headers, secret, { now: timestamp + 10, toleranceSeconds: 10 })).toEqual(
      {
        id,
        timestamp,
      }
    );
    await expectRejected(
      async () => verifyWebhook(body, headers, secret, { now: timestamp + 11, toleranceSeconds: 10 }),
      'timestamp_out_of_tolerance'
    );
    await expectRejected(
      async () => verifyWebhook(body, headers, secret, { now: timestamp - 11, toleranceSeconds: 10 }),
      'timestamp_out_of_tolerance'
    );
    expect(await verifyWebhook(body, headers, secret, { now: timestamp, toleranceSeconds: 0 })).toEqual({
      id,
      timestamp,
    });
    await expectRejected(
      async () => verifyWebhook(body, headers, secret, { now: timestamp + 1, toleranceSeconds: 0 }),
      'timestamp_out_of_tolerance'
    );
    expect(
      await verifyWebhook(body, headers, secret, { now: timestamp + 3600, toleranceSeconds: 7200 })
    ).toEqual({ id, timestamp });
  });

  it('rejects a non-integer timestamp', async () => {
    for (const value of ['12.5', 'abc', `${timestamp}.0001`, '1e3x', 'Infinity', 'NaN', ' ']) {
      await expectRejected(
        async () =>
          verifyWebhook(body, await headersFor(secret, { 'webhook-timestamp': value }), secret, {
            now: timestamp,
          }),
        'timestamp_out_of_tolerance'
      );
    }
  });

  it('checks the timestamp before the signature', async () => {
    await expectRejected(
      async () =>
        verifyWebhook(body, await headersFor(secret, { 'webhook-signature': 'v1,nonsense' }), secret, {
          now: timestamp + WEBHOOK_TOLERANCE_SECONDS + 1,
        }),
      'timestamp_out_of_tolerance'
    );
  });

  it('rejects a tampered body', async () => {
    const headers = await headersFor();
    await expectRejected(
      async () => verifyWebhook(`${body} `, headers, secret, { now: timestamp }),
      'invalid_signature'
    );
    await expectRejected(
      async () =>
        verifyWebhook(body.replace('tenant.created', 'tenant.deleted'), headers, secret, { now: timestamp }),
      'invalid_signature'
    );
    await expectRejected(
      async () => verifyWebhook('', headers, secret, { now: timestamp }),
      'invalid_signature'
    );
  });

  it('rejects a signature made with another secret', async () => {
    await expectRejected(
      async () => verifyWebhook(body, await headersFor(otherSecret), secret, { now: timestamp }),
      'invalid_signature'
    );
  });

  it('rejects a signature made for another id', async () => {
    const forOtherId = await signWebhook(secret, 'whe_other', timestamp, body);
    await expectRejected(
      async () =>
        verifyWebhook(body, await headersFor(secret, { 'webhook-signature': forOtherId }), secret, {
          now: timestamp,
        }),
      'invalid_signature'
    );
    await expectRejected(
      async () =>
        verifyWebhook(body, await headersFor(secret, { 'webhook-id': 'whe_other' }), secret, {
          now: timestamp,
        }),
      'invalid_signature'
    );
  });

  it('rejects a signature made for another timestamp', async () => {
    const shifted = await signWebhook(secret, id, timestamp + 1, body);
    await expectRejected(
      async () =>
        verifyWebhook(body, await headersFor(secret, { 'webhook-signature': shifted }), secret, {
          now: timestamp,
        }),
      'invalid_signature'
    );
    await expectRejected(
      async () =>
        verifyWebhook(
          body,
          await headersFor(secret, { 'webhook-timestamp': String(timestamp + 1) }),
          secret,
          {
            now: timestamp,
          }
        ),
      'invalid_signature'
    );
  });

  it('rejects malformed and truncated signatures', async () => {
    const good = await signWebhook(secret, id, timestamp, body);
    for (const signature of [
      'v1,',
      'v1,short',
      good.slice(0, -1),
      `${good}=`,
      good.toLowerCase(),
      'v1',
      ',',
    ]) {
      await expectRejected(
        async () =>
          verifyWebhook(body, await headersFor(secret, { 'webhook-signature': signature }), secret, {
            now: timestamp,
          }),
        'invalid_signature'
      );
    }
  });

  it('returns the id and the numeric timestamp it verified', async () => {
    const result = await verifyWebhook(body, await headersFor(), secret, { now: timestamp });
    expect(result).toEqual({ id, timestamp });
    expect(typeof result.timestamp).toBe('number');
    expect(Object.keys(result).sort()).toEqual(['id', 'timestamp']);
  });
});
