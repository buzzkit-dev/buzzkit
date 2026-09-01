import { classifyHttpStatus } from '../shared/http';
import type { DeliveryErrorCode } from '../types';

const REASON_CODES: Record<string, DeliveryErrorCode> = {
  BadDeviceToken: 'invalid_endpoint',
  Unregistered: 'invalid_endpoint',
  ExpiredToken: 'invalid_endpoint',
  DeviceTokenNotForTopic: 'invalid_endpoint',
  InvalidProviderToken: 'invalid_credential',
  MissingProviderToken: 'invalid_credential',
  ExpiredProviderToken: 'invalid_credential',
  BadEnvironmentKeyInToken: 'invalid_credential',
  BadCertificate: 'invalid_credential',
  BadCertificateEnvironment: 'invalid_credential',
  TopicDisallowed: 'invalid_credential',
  PayloadTooLarge: 'payload_too_large',
  PayloadEmpty: 'payload_invalid',
  BadCollapseId: 'payload_invalid',
  BadExpirationDate: 'payload_invalid',
  BadMessageId: 'payload_invalid',
  BadPriority: 'payload_invalid',
  BadTopic: 'payload_invalid',
  MissingTopic: 'payload_invalid',
  InvalidPushType: 'payload_invalid',
  TooManyRequests: 'rate_limited',
  TooManyProviderTokenUpdates: 'rate_limited',
  InternalServerError: 'provider_unavailable',
  ServiceUnavailable: 'provider_unavailable',
  Shutdown: 'provider_unavailable',
};

export function classify(status: number, reason: string | null): DeliveryErrorCode {
  if (status === 410) return 'invalid_endpoint';
  if (reason && REASON_CODES[reason]) return REASON_CODES[reason]!;
  return classifyHttpStatus(status);
}
