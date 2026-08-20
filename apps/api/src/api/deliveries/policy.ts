import type { DeliveryErrorCode } from '@buzzkit/api/providers/index';

export const MAX_DELIVERY_ATTEMPTS = 8;
export const BASE_BACKOFF_SECONDS = 30;
export const MAX_BACKOFF_SECONDS = 60 * 60;
export const STALE_PENDING_MINUTES = 10;
export const STALLED_FANOUT_MINUTES = 10;
export const RETRY_GRACE_SECONDS = 60;

type ErrorPolicy = { retryable: boolean; invalidatesSubscription: boolean };

export const ERROR_POLICY: Record<DeliveryErrorCode, ErrorPolicy> = {
  invalid_endpoint: { retryable: false, invalidatesSubscription: true },
  invalid_credential: { retryable: false, invalidatesSubscription: false },
  payload_invalid: { retryable: false, invalidatesSubscription: false },
  payload_too_large: { retryable: false, invalidatesSubscription: false },
  rate_limited: { retryable: true, invalidatesSubscription: false },
  provider_unavailable: { retryable: true, invalidatesSubscription: false },
  transport: { retryable: true, invalidatesSubscription: false },
  timeout: { retryable: true, invalidatesSubscription: false },
  expired: { retryable: false, invalidatesSubscription: false },
  no_credential: { retryable: false, invalidatesSubscription: false },
  unsupported: { retryable: false, invalidatesSubscription: false },
  unknown: { retryable: false, invalidatesSubscription: false },
};

export function backoffSeconds(attempt: number, retryAfterSeconds?: number): number {
  if (retryAfterSeconds !== undefined) {
    return Math.min(MAX_BACKOFF_SECONDS, Math.max(1, retryAfterSeconds));
  }
  const exponential = Math.min(MAX_BACKOFF_SECONDS, BASE_BACKOFF_SECONDS * 2 ** Math.max(0, attempt - 1));
  const half = exponential / 2;
  return Math.round(half + Math.random() * half);
}
