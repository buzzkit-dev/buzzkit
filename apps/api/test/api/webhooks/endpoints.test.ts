import { env } from 'cloudflare:workers';
import {
  assertValidEndpointUrl,
  secretOverlapActive,
  serializeEndpoint,
  serializeWebhookAttempt,
  serializeWebhookDelivery,
  serializeWebhookEvent,
  signingSecrets,
  type WebhookAttempt,
  type WebhookDelivery,
  WebhookDeliveryStatusSchema,
  type WebhookEndpoint,
  type WebhookEvent,
  WebhookEventsSchema,
} from '@buzzkit/api/api/webhooks/index';
import { BadRequestError } from '@buzzkit/api/libs/error';
import { encodeId } from '@buzzkit/api/libs/sqids';
import { TypeCompiler } from 'elysia/type-system';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const now = new Date('2026-08-27T12:00:00.000Z');
const at = new Date('2026-08-20T10:00:00.000Z');
const future = new Date(now.getTime() + 60 * 60 * 1000);
const past = new Date(now.getTime() - 60 * 60 * 1000);

function endpoint(overrides: Partial<WebhookEndpoint> = {}): WebhookEndpoint {
  return {
    id: 41,
    workspaceId: 7,
    tenantId: null,
    url: 'https://hooks.example.com/buzzkit',
    description: null,
    events: [],
    secret: 'whsec_current',
    previousSecret: null,
    previousSecretExpiresAt: null,
    disabledAt: null,
    disabledReason: null,
    failingSince: null,
    createdByUserId: 'user_1',
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
    ...overrides,
  };
}

function expectInvalidUrl(url: string) {
  let thrown: unknown;
  try {
    assertValidEndpointUrl(url);
  } catch (caught) {
    thrown = caught;
  }
  expect(thrown, url).toBeInstanceOf(BadRequestError);
  const error = thrown as InstanceType<typeof BadRequestError>;
  expect(error.code).toBe('invalid_url');
  expect(error.param).toBe('url');
  expect(error.status).toBe(400);
}

function expectValidUrl(url: string) {
  expect(() => assertValidEndpointUrl(url), url).not.toThrow();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
});

afterEach(() => {
  vi.useRealTimers();
  delete (env as unknown as Record<string, unknown>).ENVIRONMENT;
});

describe('serializeEndpoint', () => {
  it('exposes the public shape without the secret', () => {
    expect(serializeEndpoint(endpoint({ events: ['tenant.*', '$app.opened'], description: 'CRM' }))).toEqual({
      id: encodeId('webhook', 41),
      tenantId: null,
      url: 'https://hooks.example.com/buzzkit',
      description: 'CRM',
      events: ['tenant.*', '$app.opened'],
      enabled: true,
      disabledAt: null,
      disabledReason: null,
      failingSince: null,
      createdAt: at,
      updatedAt: at,
    });
  });

  it('prefixes the ids', () => {
    const serialized = serializeEndpoint(endpoint({ tenantId: 5 }));
    expect(serialized.id).toMatch(/^whk_[A-Za-z0-9]{18,}$/);
    expect(serialized.tenantId).toBe(encodeId('tenant', 5));
    expect(serialized.tenantId).toMatch(/^tnt_/);
  });

  it('never leaks internal columns', () => {
    const serialized = serializeEndpoint(
      endpoint({ previousSecret: 'whsec_old', previousSecretExpiresAt: future })
    );
    for (const key of [
      'secret',
      'previousSecret',
      'previousSecretExpiresAt',
      'workspaceId',
      'createdByUserId',
      'deletedAt',
    ]) {
      expect(serialized, key).not.toHaveProperty(key);
    }
  });

  it('derives enabled from disabledAt', () => {
    const disabled = serializeEndpoint(
      endpoint({ disabledAt: at, disabledReason: 'failing for three days', failingSince: past })
    );
    expect(disabled.enabled).toBe(false);
    expect(disabled.disabledAt).toBe(at);
    expect(disabled.disabledReason).toBe('failing for three days');
    expect(disabled.failingSince).toBe(past);
    expect(serializeEndpoint(endpoint({ disabledAt: null })).enabled).toBe(true);
  });

  it('includes the secret only when asked', () => {
    const serialized = serializeEndpoint(endpoint(), { secret: true });
    expect(serialized).toMatchObject({
      secret: 'whsec_current',
      previousSecret: null,
      previousSecretExpiresAt: null,
    });
    expect(serializeEndpoint(endpoint(), { secret: false })).not.toHaveProperty('secret');
  });

  it('includes the previous secret while the overlap is active', () => {
    const serialized = serializeEndpoint(
      endpoint({ previousSecret: 'whsec_old', previousSecretExpiresAt: future }),
      { secret: true }
    );
    expect(serialized).toMatchObject({
      secret: 'whsec_current',
      previousSecret: 'whsec_old',
      previousSecretExpiresAt: future,
    });
  });

  it('hides the previous secret once the overlap expired', () => {
    const serialized = serializeEndpoint(
      endpoint({ previousSecret: 'whsec_old', previousSecretExpiresAt: past }),
      { secret: true }
    );
    expect(serialized).toMatchObject({
      secret: 'whsec_current',
      previousSecret: null,
      previousSecretExpiresAt: null,
    });
  });

  it('hides a previous secret that has no expiry', () => {
    const serialized = serializeEndpoint(
      endpoint({ previousSecret: 'whsec_old', previousSecretExpiresAt: null }),
      { secret: true }
    );
    expect(serialized).toMatchObject({ previousSecret: null, previousSecretExpiresAt: null });
  });
});

describe('secretOverlapActive', () => {
  it('is inactive without a previous secret', () => {
    expect(secretOverlapActive({ previousSecret: null, previousSecretExpiresAt: null })).toBe(false);
    expect(secretOverlapActive({ previousSecret: null, previousSecretExpiresAt: future })).toBe(false);
  });

  it('is inactive without an expiry', () => {
    expect(secretOverlapActive({ previousSecret: 'whsec_old', previousSecretExpiresAt: null })).toBe(false);
  });

  it('is active strictly before the expiry', () => {
    expect(secretOverlapActive({ previousSecret: 'whsec_old', previousSecretExpiresAt: future })).toBe(true);
    expect(
      secretOverlapActive({
        previousSecret: 'whsec_old',
        previousSecretExpiresAt: new Date(now.getTime() + 1),
      })
    ).toBe(true);
    expect(secretOverlapActive({ previousSecret: 'whsec_old', previousSecretExpiresAt: now })).toBe(false);
    expect(secretOverlapActive({ previousSecret: 'whsec_old', previousSecretExpiresAt: past })).toBe(false);
  });

  it('follows the clock', () => {
    const row = { previousSecret: 'whsec_old', previousSecretExpiresAt: future };
    expect(secretOverlapActive(row)).toBe(true);
    vi.setSystemTime(new Date(future.getTime() + 1));
    expect(secretOverlapActive(row)).toBe(false);
  });
});

describe('signingSecrets', () => {
  it('signs with the current secret only outside an overlap', () => {
    expect(signingSecrets(endpoint())).toEqual(['whsec_current']);
    expect(signingSecrets(endpoint({ previousSecret: 'whsec_old', previousSecretExpiresAt: null }))).toEqual([
      'whsec_current',
    ]);
  });

  it('signs with the current secret first and the previous one second during the overlap', () => {
    expect(
      signingSecrets(endpoint({ previousSecret: 'whsec_old', previousSecretExpiresAt: future }))
    ).toEqual(['whsec_current', 'whsec_old']);
  });

  it('drops the previous secret after the overlap', () => {
    expect(signingSecrets(endpoint({ previousSecret: 'whsec_old', previousSecretExpiresAt: past }))).toEqual([
      'whsec_current',
    ]);
  });
});

describe('assertValidEndpointUrl', () => {
  describe('outside production', () => {
    it('accepts https and http', () => {
      expectValidUrl('https://hooks.example.com/buzzkit');
      expectValidUrl('http://hooks.example.com/buzzkit');
      expectValidUrl('http://localhost:3000/hooks');
      expectValidUrl('http://127.0.0.1:8080/hooks');
      expectValidUrl('https://10.0.0.1/hooks');
      expectValidUrl('https://hooks.example.com:8443/path?query=1#fragment');
      expectValidUrl('HTTPS://HOOKS.EXAMPLE.COM');
    });

    it('accepts the same in the test environment', () => {
      Object.assign(env, { ENVIRONMENT: 'test' });
      expectValidUrl('http://localhost:8791/hooks');
      expectValidUrl('http://127.0.0.1:8791/hooks');
    });

    it('refuses other schemes', () => {
      expectInvalidUrl('ftp://hooks.example.com/buzzkit');
      expectInvalidUrl('ws://hooks.example.com/buzzkit');
      expectInvalidUrl('wss://hooks.example.com/buzzkit');
      expectInvalidUrl('file:///etc/passwd');
      expectInvalidUrl('javascript:alert(1)');
      expectInvalidUrl('mailto:hooks@example.com');
      expectInvalidUrl('data:text/plain,hello');
    });

    it('refuses credentials in the URL', () => {
      expectInvalidUrl('https://user:secret@hooks.example.com/buzzkit');
      expectInvalidUrl('https://user@hooks.example.com/buzzkit');
      expectInvalidUrl('https://:secret@hooks.example.com/buzzkit');
      expectInvalidUrl('http://user:secret@localhost:3000/hooks');
    });

    it('refuses garbage', () => {
      expectInvalidUrl('');
      expectInvalidUrl('hooks.example.com');
      expectInvalidUrl('hooks.example.com/buzzkit');
      expectInvalidUrl('//hooks.example.com/buzzkit');
      expectInvalidUrl('not a url');
      expectInvalidUrl('https://');
      expectInvalidUrl('https:// hooks.example.com');
    });
  });

  describe('in production', () => {
    beforeEach(() => {
      Object.assign(env, { ENVIRONMENT: 'production' });
    });

    it('accepts public https endpoints', () => {
      expectValidUrl('https://hooks.example.com');
      expectValidUrl('https://hooks.example.com/buzzkit');
      expectValidUrl('https://hooks.example.com:8443/buzzkit?token=abc');
      expectValidUrl('https://8.8.8.8/hooks');
      expectValidUrl('https://11.0.0.1/hooks');
      expectValidUrl('https://172.15.0.1/hooks');
      expectValidUrl('https://172.32.0.1/hooks');
      expectValidUrl('https://192.169.0.1/hooks');
      expectValidUrl('https://169.253.0.1/hooks');
      expectValidUrl('https://localhost.example.com/hooks');
      expectValidUrl('https://internal-hooks.example.com/hooks');
      expectValidUrl('https://mylocal.com/hooks');
      expectValidUrl('https://[2606:4700:4700::1111]/hooks');
      expectValidUrl('https://hooks.example.com./buzzkit');
      expectValidUrl('https://100.63.255.255/hooks');
      expectValidUrl('https://100.128.0.1/hooks');
      expectValidUrl('https://100.0.0.1/hooks');
      expectValidUrl('https://1.100.64.1/hooks');
    });

    it('refuses a trailing-dot spelling of a private host', () => {
      expectInvalidUrl('https://localhost./hooks');
      expectInvalidUrl('https://hooks.internal./hooks');
      expectInvalidUrl('https://127.0.0.1./hooks');
    });

    it('refuses IPv4-mapped IPv6 literals', () => {
      expectInvalidUrl('https://[::ffff:127.0.0.1]/hooks');
      expectInvalidUrl('https://[::ffff:7f00:1]/hooks');
      expectInvalidUrl('https://[::ffff:10.0.0.1]/hooks');
      expectInvalidUrl('https://[::ffff:a00:1]/hooks');
      expectInvalidUrl('https://[::FFFF:8.8.8.8]/hooks');
      expectInvalidUrl('https://[0:0:0:0:0:ffff:c0a8:1]/hooks');
    });

    it('refuses the carrier-grade NAT range', () => {
      expectInvalidUrl('https://100.64.0.1/hooks');
      expectInvalidUrl('https://100.64.0.0/hooks');
      expectInvalidUrl('https://100.100.100.100/hooks');
      expectInvalidUrl('https://100.127.255.255/hooks');
    });

    it('refuses alternative spellings of loopback that the URL parser normalises', () => {
      expectInvalidUrl('https://127.1/hooks');
      expectInvalidUrl('https://2130706433/hooks');
      expectInvalidUrl('https://0x7f000001/hooks');
      expectInvalidUrl('https://0177.0.0.1/hooks');
      expectInvalidUrl('https://[0:0:0:0:0:0:0:1]/hooks');
    });

    it('refuses http', () => {
      expectInvalidUrl('http://hooks.example.com/buzzkit');
      expectInvalidUrl('http://8.8.8.8/hooks');
    });

    it('still refuses other schemes and credentials', () => {
      expectInvalidUrl('ftp://hooks.example.com/buzzkit');
      expectInvalidUrl('https://user:secret@hooks.example.com/buzzkit');
      expectInvalidUrl('garbage');
    });

    it('refuses loopback hosts', () => {
      expectInvalidUrl('https://localhost/hooks');
      expectInvalidUrl('https://LOCALHOST/hooks');
      expectInvalidUrl('https://localhost:8080/hooks');
      expectInvalidUrl('https://127.0.0.1/hooks');
      expectInvalidUrl('https://127.5.5.5/hooks');
      expectInvalidUrl('https://0.0.0.0/hooks');
      expectInvalidUrl('https://[::1]/hooks');
      expectInvalidUrl('https://[::1]:8080/hooks');
    });

    it('refuses private and link-local ranges', () => {
      expectInvalidUrl('https://10.0.0.1/hooks');
      expectInvalidUrl('https://10.255.255.255/hooks');
      expectInvalidUrl('https://192.168.0.1/hooks');
      expectInvalidUrl('https://192.168.255.255/hooks');
      expectInvalidUrl('https://172.16.0.1/hooks');
      expectInvalidUrl('https://172.19.0.1/hooks');
      expectInvalidUrl('https://172.20.0.1/hooks');
      expectInvalidUrl('https://172.29.0.1/hooks');
      expectInvalidUrl('https://172.30.0.1/hooks');
      expectInvalidUrl('https://172.31.255.255/hooks');
      expectInvalidUrl('https://169.254.169.254/hooks');
      expectInvalidUrl('https://[fc00::1]/hooks');
      expectInvalidUrl('https://[fd12:3456::1]/hooks');
      expectInvalidUrl('https://[fe80::1]/hooks');
    });

    it('refuses internal hostnames', () => {
      expectInvalidUrl('https://hooks.local/hooks');
      expectInvalidUrl('https://hooks.internal/hooks');
      expectInvalidUrl('https://api.hooks.internal/hooks');
      expectInvalidUrl('https://hooks.localhost/hooks');
      expectInvalidUrl('https://HOOKS.LOCAL/hooks');
    });
  });
});

describe('serializeWebhookEvent', () => {
  const event: WebhookEvent = {
    id: 9,
    workspaceId: 7,
    tenantId: 5,
    subscriberId: 3,
    source: 'stream',
    sourceId: 'evt_1',
    type: '$app.opened',
    payload: { id: encodeId('webhookEvent', 9), type: '$app.opened' },
    createdAt: at,
  };

  it('exposes the event with prefixed ids', () => {
    expect(serializeWebhookEvent(event)).toEqual({
      id: encodeId('webhookEvent', 9),
      type: '$app.opened',
      source: 'stream',
      tenantId: encodeId('tenant', 5),
      payload: { id: encodeId('webhookEvent', 9), type: '$app.opened' },
      createdAt: at,
    });
    expect(serializeWebhookEvent(event).id).toMatch(/^whe_/);
  });

  it('keeps a workspace-level event tenantless', () => {
    expect(serializeWebhookEvent({ ...event, tenantId: null, source: 'audit' })).toMatchObject({
      tenantId: null,
      source: 'audit',
    });
  });

  it('never leaks internal columns', () => {
    const serialized = serializeWebhookEvent(event);
    for (const key of ['workspaceId', 'subscriberId', 'sourceId'])
      expect(serialized, key).not.toHaveProperty(key);
  });
});

describe('serializeWebhookDelivery', () => {
  const delivery: WebhookDelivery = {
    id: 12,
    workspaceId: 7,
    endpointId: 41,
    eventId: 9,
    status: 'failed',
    attempts: 3,
    nextAttemptAt: future,
    lastStatus: 503,
    lastError: 'HTTP 503',
    lastAttemptAt: at,
    createdAt: at,
    updatedAt: at,
  };

  it('exposes the delivery with prefixed ids', () => {
    expect(serializeWebhookDelivery(delivery)).toEqual({
      id: encodeId('webhookDelivery', 12),
      endpointId: encodeId('webhook', 41),
      eventId: encodeId('webhookEvent', 9),
      eventType: null,
      status: 'failed',
      attempts: 3,
      nextAttemptAt: future,
      lastStatus: 503,
      lastError: 'HTTP 503',
      lastAttemptAt: at,
      createdAt: at,
      updatedAt: at,
    });
    const serialized = serializeWebhookDelivery(delivery);
    expect(serialized.id).toMatch(/^whd_/);
    expect(serialized.endpointId).toMatch(/^whk_/);
    expect(serialized.eventId).toMatch(/^whe_/);
    expect(serialized).not.toHaveProperty('workspaceId');
  });

  it('carries the joined event type when the query provides one', () => {
    expect(serializeWebhookDelivery({ ...delivery, eventType: 'tenant.created' }).eventType).toBe(
      'tenant.created'
    );
    expect(serializeWebhookDelivery(delivery).eventType).toBeNull();
  });

  it('passes a fresh delivery through', () => {
    expect(
      serializeWebhookDelivery({
        ...delivery,
        status: 'pending',
        attempts: 0,
        nextAttemptAt: null,
        lastStatus: null,
        lastError: null,
        lastAttemptAt: null,
      })
    ).toMatchObject({
      status: 'pending',
      attempts: 0,
      nextAttemptAt: null,
      lastStatus: null,
      lastError: null,
      lastAttemptAt: null,
    });
  });
});

describe('serializeWebhookAttempt', () => {
  const attempt: WebhookAttempt = {
    id: 77,
    deliveryId: 12,
    attempt: 2,
    status: 500,
    error: 'HTTP 500',
    durationMs: 812,
    responseBody: '{"ok":false}',
    createdAt: at,
  };

  it('exposes the attempt with a prefixed id and without the delivery id', () => {
    expect(serializeWebhookAttempt(attempt)).toEqual({
      id: encodeId('webhookAttempt', 77),
      attempt: 2,
      status: 500,
      error: 'HTTP 500',
      durationMs: 812,
      responseBody: '{"ok":false}',
      createdAt: at,
    });
    expect(serializeWebhookAttempt(attempt).id).toMatch(/^wha_/);
    expect(serializeWebhookAttempt(attempt)).not.toHaveProperty('deliveryId');
  });

  it('passes a network failure through', () => {
    expect(
      serializeWebhookAttempt({ ...attempt, status: null, error: 'timeout', responseBody: null })
    ).toMatchObject({
      status: null,
      error: 'timeout',
      responseBody: null,
    });
  });
});

describe('schemas', () => {
  it('bounds the subscription list', () => {
    const check = TypeCompiler.Compile(WebhookEventsSchema);
    expect(check.Check([])).toBe(true);
    expect(check.Check(['*'])).toBe(true);
    expect(check.Check(['tenant.created', 'order.*'])).toBe(true);
    expect(check.Check(Array.from({ length: 100 }, (_, index) => `event.${index}`))).toBe(true);
    expect(check.Check(Array.from({ length: 101 }, (_, index) => `event.${index}`))).toBe(false);
    expect(check.Check([''])).toBe(false);
    expect(check.Check(['a'.repeat(120)])).toBe(true);
    expect(check.Check(['a'.repeat(121)])).toBe(false);
    expect(check.Check([1])).toBe(false);
    expect(check.Check('tenant.created')).toBe(false);
  });

  it('accepts only the delivery statuses', () => {
    const check = TypeCompiler.Compile(WebhookDeliveryStatusSchema);
    for (const status of ['pending', 'success', 'failed', 'exhausted'])
      expect(check.Check(status), status).toBe(true);
    expect(check.Check('sent')).toBe(false);
    expect(check.Check('')).toBe(false);
  });
});
