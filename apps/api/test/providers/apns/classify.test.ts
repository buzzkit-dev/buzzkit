import { classify } from '@buzzkit/api/providers/apns/index';
import { describe, expect, it } from 'vitest';

describe('classify', () => {
  it('treats 410 as a dead token no matter the reason', () => {
    expect(classify(410, 'Unregistered')).toBe('invalid_endpoint');
    expect(classify(410, null)).toBe('invalid_endpoint');
  });

  it('maps every documented APNs reason to its delivery code', () => {
    expect(classify(400, 'BadDeviceToken')).toBe('invalid_endpoint');
    expect(classify(400, 'ExpiredToken')).toBe('invalid_endpoint');
    expect(classify(400, 'DeviceTokenNotForTopic')).toBe('invalid_endpoint');
    expect(classify(403, 'InvalidProviderToken')).toBe('invalid_credential');
    expect(classify(403, 'MissingProviderToken')).toBe('invalid_credential');
    expect(classify(403, 'ExpiredProviderToken')).toBe('invalid_credential');
    expect(classify(400, 'BadEnvironmentKeyInToken')).toBe('invalid_credential');
    expect(classify(403, 'BadCertificate')).toBe('invalid_credential');
    expect(classify(403, 'BadCertificateEnvironment')).toBe('invalid_credential');
    expect(classify(400, 'TopicDisallowed')).toBe('invalid_credential');
    expect(classify(413, 'PayloadTooLarge')).toBe('payload_too_large');
    expect(classify(400, 'PayloadEmpty')).toBe('payload_invalid');
    expect(classify(400, 'BadCollapseId')).toBe('payload_invalid');
    expect(classify(400, 'BadExpirationDate')).toBe('payload_invalid');
    expect(classify(400, 'BadMessageId')).toBe('payload_invalid');
    expect(classify(400, 'BadPriority')).toBe('payload_invalid');
    expect(classify(400, 'BadTopic')).toBe('payload_invalid');
    expect(classify(400, 'MissingTopic')).toBe('payload_invalid');
    expect(classify(400, 'InvalidPushType')).toBe('payload_invalid');
    expect(classify(429, 'TooManyRequests')).toBe('rate_limited');
    expect(classify(429, 'TooManyProviderTokenUpdates')).toBe('rate_limited');
    expect(classify(500, 'InternalServerError')).toBe('provider_unavailable');
    expect(classify(503, 'ServiceUnavailable')).toBe('provider_unavailable');
    expect(classify(503, 'Shutdown')).toBe('provider_unavailable');
  });

  it('falls back to the shared status classification for unknown reasons', () => {
    expect(classify(429, null)).toBe('rate_limited');
    expect(classify(500, null)).toBe('provider_unavailable');
    expect(classify(400, 'SomethingNew')).toBe('unknown');
  });
});
