import type { DeliveryErrorCode } from '@buzzkit/api/providers/index';

export const RETRY_SCHEDULE_SECONDS = [5, 30, 120, 600, 1800, 3600, 7200] as const;
export const MAX_DELIVERY_ATTEMPTS = RETRY_SCHEDULE_SECONDS.length + 1;
export const RETRY_JITTER_RATIO = 0.2;
export const OVERLOAD_PENALTY_SECONDS = 60;
export const MAX_BACKOFF_SECONDS = 24 * 60 * 60;
export const STALE_PENDING_MINUTES = 10;
export const STALLED_FANOUT_MINUTES = 10;
export const UNFINALIZED_GRACE_MINUTES = 5;
export const RETRY_GRACE_SECONDS = 60;

type ErrorPolicy = { retryable: boolean; invalidatesSubscription: boolean; overload: boolean };

export const ERROR_POLICY: Record<DeliveryErrorCode, ErrorPolicy> = {
  invalid_endpoint: { retryable: false, invalidatesSubscription: true, overload: false },
  invalid_credential: { retryable: false, invalidatesSubscription: false, overload: false },
  payload_invalid: { retryable: false, invalidatesSubscription: false, overload: false },
  payload_too_large: { retryable: false, invalidatesSubscription: false, overload: false },
  rate_limited: { retryable: true, invalidatesSubscription: false, overload: true },
  provider_unavailable: { retryable: true, invalidatesSubscription: false, overload: false },
  transport: { retryable: true, invalidatesSubscription: false, overload: false },
  timeout: { retryable: true, invalidatesSubscription: false, overload: true },
  expired: { retryable: false, invalidatesSubscription: false, overload: false },
  no_credential: { retryable: false, invalidatesSubscription: false, overload: false },
  unsupported: { retryable: false, invalidatesSubscription: false, overload: false },
  unknown: { retryable: false, invalidatesSubscription: false, overload: false },
};

export function backoffSeconds(attempt: number, code: DeliveryErrorCode, retryAfterSeconds?: number): number {
  const index = Math.min(Math.max(attempt, 1), RETRY_SCHEDULE_SECONDS.length) - 1;
  const scheduled = RETRY_SCHEDULE_SECONDS[index] ?? RETRY_SCHEDULE_SECONDS[0];
  const floor = ERROR_POLICY[code].overload ? OVERLOAD_PENALTY_SECONDS : 0;
  const base = Math.max(scheduled, floor, retryAfterSeconds ?? 0);
  const jitter = base * RETRY_JITTER_RATIO * (Math.random() * 2 - 1);
  return Math.min(MAX_BACKOFF_SECONDS, Math.max(1, Math.round(base + jitter)));
}
