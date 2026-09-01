import { classifyHttpStatus } from '../shared/http';
import type { DeliveryErrorCode } from '../types';

const ERROR_CODES: Record<string, DeliveryErrorCode> = {
  UNREGISTERED: 'invalid_endpoint',
  INVALID_ARGUMENT: 'payload_invalid',
  SENDER_ID_MISMATCH: 'invalid_credential',
  THIRD_PARTY_AUTH_ERROR: 'invalid_credential',
  PERMISSION_DENIED: 'invalid_credential',
  UNAUTHENTICATED: 'invalid_credential',
  QUOTA_EXCEEDED: 'rate_limited',
  RESOURCE_EXHAUSTED: 'rate_limited',
  UNAVAILABLE: 'provider_unavailable',
  INTERNAL: 'provider_unavailable',
};

export function classify(status: number, errorCode: string | null): DeliveryErrorCode {
  if (errorCode && ERROR_CODES[errorCode]) return ERROR_CODES[errorCode]!;
  if (status === 404) return 'invalid_endpoint';
  if (status === 401 || status === 403) return 'invalid_credential';
  return classifyHttpStatus(status);
}
