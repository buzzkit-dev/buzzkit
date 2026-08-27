import { env } from 'cloudflare:workers';
import {
  DELIVERY_TIMEOUT_MS,
  DISABLE_AFTER_FAILING_MS,
  isSuccessStatus,
  MAX_DELIVERY_ATTEMPTS,
  MAX_ENDPOINTS_PER_WORKSPACE,
  RECONCILE_LOOKBACK_MS,
  RESPONSE_EXCERPT_BYTES,
  RETRY_SCHEDULE_SECONDS,
  retryDelaySeconds,
  SECRET_OVERLAP_MS,
  STALE_DELIVERY_GRACE_MS,
} from '@buzzkit/api/api/webhooks/policy';
import { afterEach, describe, expect, it } from 'vitest';

afterEach(() => {
  delete (env as Record<string, unknown>).ENVIRONMENT;
});

describe('constants', () => {
  it('spaces retries out over roughly three days', () => {
    expect(RETRY_SCHEDULE_SECONDS).toEqual([300, 1800, 7200, 18000, 36000, 43200, 43200, 43200, 43200]);
    for (let index = 1; index < RETRY_SCHEDULE_SECONDS.length; index++) {
      expect(RETRY_SCHEDULE_SECONDS[index]).toBeGreaterThanOrEqual(RETRY_SCHEDULE_SECONDS[index - 1]!);
    }
  });

  it('allows one attempt more than there are retry delays', () => {
    expect(MAX_DELIVERY_ATTEMPTS).toBe(RETRY_SCHEDULE_SECONDS.length + 1);
    expect(MAX_DELIVERY_ATTEMPTS).toBe(10);
  });

  it('pins the tunable policy numbers', () => {
    expect(DELIVERY_TIMEOUT_MS).toBe(30_000);
    expect(DISABLE_AFTER_FAILING_MS).toBe(3 * 24 * 60 * 60 * 1000);
    expect(SECRET_OVERLAP_MS).toBe(24 * 60 * 60 * 1000);
    expect(RESPONSE_EXCERPT_BYTES).toBe(4096);
    expect(RECONCILE_LOOKBACK_MS).toBe(60 * 60 * 1000);
    expect(STALE_DELIVERY_GRACE_MS).toBe(15 * 60 * 1000);
    expect(MAX_ENDPOINTS_PER_WORKSPACE).toBe(50);
  });
});

describe('retryDelaySeconds', () => {
  it('returns the scheduled delay for each retryable attempt', () => {
    for (let attempt = 1; attempt <= RETRY_SCHEDULE_SECONDS.length; attempt++) {
      expect(retryDelaySeconds(attempt), `attempt ${attempt}`).toBe(RETRY_SCHEDULE_SECONDS[attempt - 1]);
    }
    expect(retryDelaySeconds(1)).toBe(300);
    expect(retryDelaySeconds(9)).toBe(43200);
  });

  it('returns null once the schedule is exhausted', () => {
    expect(retryDelaySeconds(MAX_DELIVERY_ATTEMPTS)).toBeNull();
    expect(retryDelaySeconds(10)).toBeNull();
    expect(retryDelaySeconds(11)).toBeNull();
    expect(retryDelaySeconds(100)).toBeNull();
  });

  it('returns null before any attempt was made', () => {
    expect(retryDelaySeconds(0)).toBeNull();
    expect(retryDelaySeconds(-1)).toBeNull();
  });

  it('uses the production schedule in production', () => {
    Object.assign(env, { ENVIRONMENT: 'production' });
    expect(retryDelaySeconds(1)).toBe(300);
    expect(retryDelaySeconds(9)).toBe(43200);
    expect(retryDelaySeconds(10)).toBeNull();
  });

  it('collapses every delay to one second in the test environment', () => {
    Object.assign(env, { ENVIRONMENT: 'test' });
    for (let attempt = 1; attempt <= RETRY_SCHEDULE_SECONDS.length; attempt++) {
      expect(retryDelaySeconds(attempt), `attempt ${attempt}`).toBe(1);
    }
    expect(retryDelaySeconds(10)).toBeNull();
    expect(retryDelaySeconds(0)).toBeNull();
  });

  it('reads the environment on every call', () => {
    Object.assign(env, { ENVIRONMENT: 'test' });
    expect(retryDelaySeconds(2)).toBe(1);
    delete (env as Record<string, unknown>).ENVIRONMENT;
    expect(retryDelaySeconds(2)).toBe(1800);
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
