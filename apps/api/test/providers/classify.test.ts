import { buildApnsPayload, classify as classifyApns } from '@buzzkit/api/providers/apns/index';
import { classify as classifyFcm } from '@buzzkit/api/providers/fcm/index';
import { classify as classifyResend } from '@buzzkit/api/providers/resend/index';
import { classifyHttpStatus, retryAfterSeconds } from '@buzzkit/api/providers/shared/http';
import { describe, expect, it } from 'vitest';

describe('provider classification', () => {
  it('APNs: 410 always means a dead token, known reasons map, everything else falls back by status', () => {
    expect(classifyApns(410, 'Unregistered')).toBe('invalid_endpoint');
    expect(classifyApns(410, null)).toBe('invalid_endpoint');
    expect(classifyApns(400, 'BadDeviceToken')).toBe('invalid_endpoint');
    expect(classifyApns(403, 'InvalidProviderToken')).toBe('invalid_credential');
    expect(classifyApns(403, 'ExpiredProviderToken')).toBe('invalid_credential');
    expect(classifyApns(413, 'PayloadTooLarge')).toBe('payload_too_large');
    expect(classifyApns(400, 'BadCollapseId')).toBe('payload_invalid');
    expect(classifyApns(429, 'TooManyRequests')).toBe('rate_limited');
    expect(classifyApns(503, 'ServiceUnavailable')).toBe('provider_unavailable');
    expect(classifyApns(429, null)).toBe('rate_limited');
    expect(classifyApns(500, null)).toBe('provider_unavailable');
    expect(classifyApns(400, 'SomethingNew')).toBe('unknown');
  });

  it('FCM: error codes win over status; 404 is a dead token; auth statuses are credential failures', () => {
    expect(classifyFcm(404, 'UNREGISTERED')).toBe('invalid_endpoint');
    expect(classifyFcm(400, 'INVALID_ARGUMENT')).toBe('payload_invalid');
    expect(classifyFcm(429, 'QUOTA_EXCEEDED')).toBe('rate_limited');
    expect(classifyFcm(503, 'UNAVAILABLE')).toBe('provider_unavailable');
    expect(classifyFcm(404, null)).toBe('invalid_endpoint');
    expect(classifyFcm(401, null)).toBe('invalid_credential');
    expect(classifyFcm(403, null)).toBe('invalid_credential');
    expect(classifyFcm(429, null)).toBe('rate_limited');
    expect(classifyFcm(502, null)).toBe('provider_unavailable');
    expect(classifyFcm(400, null)).toBe('unknown');
  });

  it('Resend and the shared fallback agree on 429 and 5xx', () => {
    expect(classifyResend(401)).toBe('invalid_credential');
    expect(classifyResend(403)).toBe('invalid_credential');
    expect(classifyResend(429)).toBe('rate_limited');
    expect(classifyResend(500)).toBe('provider_unavailable');
    expect(classifyResend(422)).toBe('unknown');
    expect(classifyHttpStatus(429)).toBe('rate_limited');
    expect(classifyHttpStatus(599)).toBe('provider_unavailable');
    expect(classifyHttpStatus(418)).toBe('unknown');
  });

  it('Retry-After accepts seconds (floored to at least 1) and HTTP dates, ignores garbage', () => {
    const response = (value: string | null) =>
      new Response(null, { headers: value ? { 'retry-after': value } : {} });
    expect(retryAfterSeconds(response('30'))).toBe(30);
    expect(retryAfterSeconds(response('0.4'))).toBe(1);
    expect(retryAfterSeconds(response(new Date(Date.now() + 90_000).toUTCString()))).toBeGreaterThanOrEqual(
      88
    );
    expect(retryAfterSeconds(response(new Date(Date.now() - 90_000).toUTCString()))).toBe(1);
    expect(retryAfterSeconds(response('soon'))).toBeUndefined();
    expect(retryAfterSeconds(response(null))).toBeUndefined();
  });

  it('APNs payload maps the cross-platform fields and lets apns.payload override', () => {
    const payload = buildApnsPayload({
      title: 'T',
      subtitle: 'S',
      body: 'B',
      badge: 3,
      sound: 'ping',
      imageUrl: 'https://x/y.png',
      data: { deepLink: 'app://x' },
      apns: { payload: { extra: 'raw' } },
    });
    const aps = payload.aps as Record<string, unknown>;
    expect(aps.alert).toEqual({ title: 'T', subtitle: 'S', body: 'B' });
    expect(aps.badge).toBe(3);
    expect(aps.sound).toBe('ping');
    expect(aps['mutable-content']).toBe(1);
    expect(payload.deepLink).toBe('app://x');
    expect(payload.extra).toBe('raw');

    const overridden = buildApnsPayload({ title: 'T', apns: { payload: { aps: { alert: 'custom' } } } });
    expect(overridden.aps).toEqual({ alert: 'custom' });
  });
});
