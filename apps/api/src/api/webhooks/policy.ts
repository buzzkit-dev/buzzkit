import { env } from 'cloudflare:workers';

export const RETRY_SCHEDULE_SECONDS = [300, 1800, 7200, 18000, 36000, 43200, 43200, 43200, 43200] as const;

const TEST_RETRY_SCHEDULE_SECONDS = [1, 1, 1, 1, 1, 1, 1, 1, 1] as const;

export const MAX_DELIVERY_ATTEMPTS = RETRY_SCHEDULE_SECONDS.length + 1;

export const DELIVERY_TIMEOUT_MS = 30_000;

export const DISABLE_AFTER_FAILING_MS = 3 * 24 * 60 * 60 * 1000;

export const SECRET_OVERLAP_MS = 24 * 60 * 60 * 1000;

export const RESPONSE_EXCERPT_BYTES = 4096;

export const RECONCILE_LOOKBACK_MS = 60 * 60 * 1000;

export const HORIZON_CLOCK_SKEW_MS = 5_000;

export const STALE_DELIVERY_GRACE_MS = 15 * 60 * 1000;

export const MAX_ENDPOINTS_PER_WORKSPACE = 50;

export const REENABLE_RETRY_LIMIT = 500;

export function retryDelaySeconds(attemptsMade: number): number | null {
  const schedule =
    (env.ENVIRONMENT as string) === 'test' ? TEST_RETRY_SCHEDULE_SECONDS : RETRY_SCHEDULE_SECONDS;
  return schedule[attemptsMade - 1] ?? null;
}

export function isSuccessStatus(status: number): boolean {
  return status >= 200 && status < 300;
}
