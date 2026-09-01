import { nextRetryDelaySeconds, type RetryPolicy } from '@buzzkit/api/libs/retry';
import { describe, expect, it } from 'vitest';

const policy: RetryPolicy = { scheduleSeconds: [10, 60, 600], jitterRatio: 0.2, maxDelaySeconds: 300 };

const exact: RetryPolicy = { scheduleSeconds: [10, 60, 600], jitterRatio: 0, maxDelaySeconds: 3600 };

describe('nextRetryDelaySeconds', () => {
  it('walks the schedule one-based and returns null past the end', () => {
    expect(nextRetryDelaySeconds(exact, 1)).toBe(10);
    expect(nextRetryDelaySeconds(exact, 2)).toBe(60);
    expect(nextRetryDelaySeconds(exact, 3)).toBe(600);
    expect(nextRetryDelaySeconds(exact, 4)).toBeNull();
    expect(nextRetryDelaySeconds(exact, 0)).toBeNull();
    expect(nextRetryDelaySeconds(exact, -1)).toBeNull();
  });

  it('applies jitter within the ratio and never below one second', () => {
    for (let round = 0; round < 100; round++) {
      const delay = nextRetryDelaySeconds(policy, 1)!;
      expect(delay).toBeGreaterThanOrEqual(8);
      expect(delay).toBeLessThanOrEqual(12);
    }
    const spread = new Set(Array.from({ length: 200 }, () => nextRetryDelaySeconds(policy, 2)));
    expect(spread.size).toBeGreaterThan(3);
  });

  it('lets the floor and Retry-After raise the base, capped at maxDelaySeconds', () => {
    expect(nextRetryDelaySeconds(exact, 1, { floorSeconds: 45 })).toBe(45);
    expect(nextRetryDelaySeconds(exact, 1, { retryAfterSeconds: 120 })).toBe(120);
    expect(nextRetryDelaySeconds(exact, 1, { floorSeconds: 45, retryAfterSeconds: 30 })).toBe(45);
    expect(nextRetryDelaySeconds(policy, 3, { retryAfterSeconds: 10_000 })).toBe(300);
  });
});
