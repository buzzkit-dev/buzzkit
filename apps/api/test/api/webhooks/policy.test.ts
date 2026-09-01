import { env } from 'cloudflare:workers';
import {
  DELIVERY_TIMEOUT_MS,
  DISABLE_AFTER_FAILING_MS,
  isRetryableStatus,
  isSuccessStatus,
  MAX_ENDPOINTS_PER_WORKSPACE,
  MAX_WEBHOOK_ATTEMPTS,
  RECONCILE_LOOKBACK_MS,
  resolveRetryAfterSeconds,
  retryDelaySeconds,
  SECRET_OVERLAP_MS,
  STALE_DELIVERY_GRACE_MS,
  WEBHOOK_RETRY_POLICY,
} from '@buzzkit/api/api/webhooks/policy';
import { afterEach, describe, expect, it } from 'vitest';

afterEach(() => {
  delete (env as unknown as Record<string, unknown>).ENVIRONMENT;
});

const schedule = WEBHOOK_RETRY_POLICY.scheduleSeconds;

const within = (value: number, base: number) => {
  const bounded = Math.min(base, WEBHOOK_RETRY_POLICY.maxDelaySeconds);
  expect(value).toBeGreaterThanOrEqual(Math.floor(bounded * (1 - WEBHOOK_RETRY_POLICY.jitterRatio)));
  expect(value).toBeLessThanOrEqual(Math.ceil(bounded * (1 + WEBHOOK_RETRY_POLICY.jitterRatio)));
};

describe('constants', () => {
  it('spaces retries out over roughly three days', () => {
    expect(schedule).toEqual([300, 1800, 7200, 18000, 36000, 43200, 43200, 43200, 43200]);
    for (let index = 1; index < schedule.length; index++) {
      expect(schedule[index]).toBeGreaterThanOrEqual(schedule[index - 1]!);
    }
  });

  it('allows one attempt more than there are retry delays', () => {
    expect(MAX_WEBHOOK_ATTEMPTS).toBe(schedule.length + 1);
    expect(MAX_WEBHOOK_ATTEMPTS).toBe(10);
  });

  it('pins the tunable policy numbers', () => {
    expect(DELIVERY_TIMEOUT_MS).toBe(30_000);
    expect(DISABLE_AFTER_FAILING_MS).toBe(3 * 24 * 60 * 60 * 1000);
    expect(SECRET_OVERLAP_MS).toBe(24 * 60 * 60 * 1000);
    expect(RECONCILE_LOOKBACK_MS).toBe(60 * 60 * 1000);
    expect(STALE_DELIVERY_GRACE_MS).toBe(15 * 60 * 1000);
    expect(MAX_ENDPOINTS_PER_WORKSPACE).toBe(50);
  });
});

describe('retryDelaySeconds', () => {
  it('follows the schedule per attempt with ±20% jitter, capped at 24h', () => {
    for (let attempt = 1; attempt <= schedule.length; attempt++) {
      for (let round = 0; round < 25; round++) {
        within(retryDelaySeconds(attempt)!, schedule[attempt - 1]!);
      }
    }
    const spread = new Set(Array.from({ length: 200 }, () => retryDelaySeconds(3)));
    expect(spread.size).toBeGreaterThan(5);
  });

  it('honors Retry-After above the scheduled delay', () => {
    for (let round = 0; round < 25; round++) {
      within(retryDelaySeconds(1, 600)!, 600);
      within(retryDelaySeconds(1, 10)!, 300);
    }
  });

  it('returns null once the schedule is exhausted', () => {
    expect(retryDelaySeconds(MAX_WEBHOOK_ATTEMPTS)).toBeNull();
    expect(retryDelaySeconds(10)).toBeNull();
    expect(retryDelaySeconds(11)).toBeNull();
    expect(retryDelaySeconds(100)).toBeNull();
  });

  it('returns null before any attempt was made', () => {
    expect(retryDelaySeconds(0)).toBeNull();
    expect(retryDelaySeconds(-1)).toBeNull();
  });

  it('collapses every delay to one second in the test environment', () => {
    Object.assign(env, { ENVIRONMENT: 'test' });
    for (let attempt = 1; attempt <= schedule.length; attempt++) {
      expect(retryDelaySeconds(attempt), `attempt ${attempt}`).toBe(1);
    }
    expect(retryDelaySeconds(10)).toBeNull();
    expect(retryDelaySeconds(0)).toBeNull();
  });

  it('reads the environment on every call', () => {
    Object.assign(env, { ENVIRONMENT: 'test' });
    expect(retryDelaySeconds(2)).toBe(1);
    delete (env as unknown as Record<string, unknown>).ENVIRONMENT;
    within(retryDelaySeconds(2)!, 1800);
  });
});

describe('isSuccessStatus', () => {
  it('accepts the 2xx range', () => {
    expect(isSuccessStatus(200)).toBe(true);
    expect(isSuccessStatus(201)).toBe(true);
    expect(isSuccessStatus(202)).toBe(true);
    expect(isSuccessStatus(204)).toBe(true);
    expect(isSuccessStatus(299)).toBe(true);
  });

  it('rejects everything outside it', () => {
    expect(isSuccessStatus(199)).toBe(false);
    expect(isSuccessStatus(300)).toBe(false);
    expect(isSuccessStatus(301)).toBe(false);
    expect(isSuccessStatus(302)).toBe(false);
    expect(isSuccessStatus(400)).toBe(false);
    expect(isSuccessStatus(404)).toBe(false);
    expect(isSuccessStatus(429)).toBe(false);
    expect(isSuccessStatus(500)).toBe(false);
    expect(isSuccessStatus(503)).toBe(false);
    expect(isSuccessStatus(100)).toBe(false);
    expect(isSuccessStatus(0)).toBe(false);
    expect(isSuccessStatus(-1)).toBe(false);
    expect(isSuccessStatus(Number.NaN)).toBe(false);
  });
});

describe('isRetryableStatus', () => {
  it('retries network failures and every non-2xx status except 410', () => {
    expect(isRetryableStatus(null)).toBe(true);
    expect(isRetryableStatus(400)).toBe(true);
    expect(isRetryableStatus(404)).toBe(true);
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(500)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
  });

  it('treats 2xx and 410 Gone as final', () => {
    expect(isRetryableStatus(200)).toBe(false);
    expect(isRetryableStatus(204)).toBe(false);
    expect(isRetryableStatus(410)).toBe(false);
  });
});

describe('resolveRetryAfterSeconds', () => {
  it('parses delta seconds', () => {
    expect(resolveRetryAfterSeconds('120')).toBe(120);
    expect(resolveRetryAfterSeconds('0')).toBeUndefined();
    expect(resolveRetryAfterSeconds('-5')).toBeUndefined();
  });

  it('parses an HTTP date in the future and ignores one in the past', () => {
    expect(resolveRetryAfterSeconds(new Date(Date.now() + 90_000).toUTCString())).toBeGreaterThan(80);
    expect(resolveRetryAfterSeconds(new Date(Date.now() - 90_000).toUTCString())).toBeUndefined();
  });

  it('ignores garbage and absence', () => {
    expect(resolveRetryAfterSeconds('soon')).toBeUndefined();
    expect(resolveRetryAfterSeconds(null)).toBeUndefined();
  });
});
