import { classify } from '@buzzkit/api/providers/fcm/index';
import { describe, expect, it } from 'vitest';

describe('classify', () => {
  it('maps every documented FCM error code to its delivery code', () => {
    expect(classify(404, 'UNREGISTERED')).toBe('invalid_endpoint');
    expect(classify(400, 'INVALID_ARGUMENT')).toBe('payload_invalid');
    expect(classify(403, 'SENDER_ID_MISMATCH')).toBe('invalid_credential');
    expect(classify(401, 'THIRD_PARTY_AUTH_ERROR')).toBe('invalid_credential');
    expect(classify(403, 'PERMISSION_DENIED')).toBe('invalid_credential');
    expect(classify(401, 'UNAUTHENTICATED')).toBe('invalid_credential');
    expect(classify(429, 'QUOTA_EXCEEDED')).toBe('rate_limited');
    expect(classify(429, 'RESOURCE_EXHAUSTED')).toBe('rate_limited');
    expect(classify(503, 'UNAVAILABLE')).toBe('provider_unavailable');
    expect(classify(500, 'INTERNAL')).toBe('provider_unavailable');
  });

  it('falls back by status when no error code is present', () => {
    expect(classify(404, null)).toBe('invalid_endpoint');
    expect(classify(401, null)).toBe('invalid_credential');
    expect(classify(403, null)).toBe('invalid_credential');
    expect(classify(429, null)).toBe('rate_limited');
    expect(classify(502, null)).toBe('provider_unavailable');
    expect(classify(400, null)).toBe('unknown');
  });
});
