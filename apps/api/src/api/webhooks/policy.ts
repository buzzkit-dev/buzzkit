import { env } from 'cloudflare:workers';
import { nextRetryDelaySeconds, type RetryPolicy } from '@buzzkit/api/libs/retry';
import { DAY_MS } from '@buzzkit/api/libs/timezone';

export const WEBHOOK_RETRY_POLICY: RetryPolicy = {
  scheduleSeconds: [300, 1800, 7200, 18000, 36000, 43200, 43200, 43200, 43200],
  jitterRatio: 0.2,
  maxDelaySeconds: 24 * 60 * 60,
};

const TEST_RETRY_POLICY: RetryPolicy = {
  scheduleSeconds: [1, 1, 1, 1, 1, 1, 1, 1, 1],
  jitterRatio: 0,
  maxDelaySeconds: 1,
};

export const MAX_WEBHOOK_ATTEMPTS = WEBHOOK_RETRY_POLICY.scheduleSeconds.length + 1;

export const DELIVERY_TIMEOUT_MS = 30_000;

export const DISABLE_AFTER_FAILING_MS = 3 * DAY_MS;

export const SECRET_OVERLAP_MS = DAY_MS;

export const RECONCILE_LOOKBACK_MS = 60 * 60 * 1000;

export const STALE_DELIVERY_GRACE_MS = 15 * 60 * 1000;

export const MAX_ENDPOINTS_PER_WORKSPACE = 50;

export const REENABLE_RETRY_LIMIT = 500;

export function retryDelaySeconds(attemptsMade: number, retryAfterSeconds?: number): number | null {
  const policy = (env.ENVIRONMENT as string) === 'test' ? TEST_RETRY_POLICY : WEBHOOK_RETRY_POLICY;
  return nextRetryDelaySeconds(policy, attemptsMade, { retryAfterSeconds });
}

export function isSuccessStatus(status: number): boolean {
  return status >= 200 && status < 300;
}

export function isRetryableStatus(status: number | null): boolean {
  if (status === null) return true;
  return !isSuccessStatus(status) && status !== 410;
}

export function resolveRetryAfterSeconds(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds);
  const at = Date.parse(header);
  if (Number.isNaN(at)) return undefined;
  const delta = Math.ceil((at - Date.now()) / 1000);

  return delta > 0 ? delta : undefined;
}
