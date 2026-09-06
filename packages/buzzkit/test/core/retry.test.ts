import { describe, expect, it, vi } from 'vitest';
import { isRetryableStatus, nextRetryDelayMs, parseRetryAfter, RETRY_POLICY } from '../../src/core/retry';

const policy = { ...RETRY_POLICY, maxRetries: 2 };

describe('isRetryableStatus', () => {
  it('retries the transient statuses', () => {
    for (const status of [408, 429, 500, 502, 503, 504]) {
      expect(isRetryableStatus(status), String(status)).toBe(true);
    }
  });

  it('never retries a client mistake', () => {
    for (const status of [200, 201, 400, 401, 403, 404, 409, 410, 422]) {
      expect(isRetryableStatus(status), String(status)).toBe(false);
    }
  });
});

describe('parseRetryAfter', () => {
  it('reads a delay in seconds', () => {
    expect(parseRetryAfter('12')).toBe(12);
    expect(parseRetryAfter('0')).toBe(0);
  });

  it('reads an HTTP date as seconds from now', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    expect(parseRetryAfter(new Date('2026-01-01T00:00:30.000Z').toUTCString())).toBe(30);

    vi.useRealTimers();
  });

  it('never returns a negative delay for a date in the past', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:01:00.000Z'));

    expect(parseRetryAfter(new Date('2026-01-01T00:00:00.000Z').toUTCString())).toBe(0);

    vi.useRealTimers();
  });

  it('ignores a missing or unparseable header', () => {
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter('soon')).toBeUndefined();
    expect(parseRetryAfter('-5')).toBeUndefined();
  });
});

describe('nextRetryDelayMs', () => {
  it('honors Retry-After over the backoff curve', () => {
    expect(nextRetryDelayMs(policy, 0, 3)).toBe(3000);
  });

  it('never shortens Retry-After to the backoff ceiling', () => {
    expect(nextRetryDelayMs(policy, 0, 30)).toBeGreaterThan(policy.maxDelayMs);
  });

  it('grows exponentially and stays inside the jitter band', () => {
    for (const attempt of [0, 1, 2, 3]) {
      const expected = Math.min(policy.initialDelayMs * 2 ** attempt, policy.maxDelayMs);
      const delay = nextRetryDelayMs(policy, attempt);

      expect(delay, `attempt ${attempt}`).toBeGreaterThanOrEqual(Math.round(expected * 0.5));
      expect(delay, `attempt ${attempt}`).toBeLessThanOrEqual(expected);
    }
  });

  it('never exceeds the ceiling however many attempts have been made', () => {
    expect(nextRetryDelayMs(policy, 40)).toBeLessThanOrEqual(policy.maxDelayMs);
  });

  it('applies jitter rather than a fixed delay', () => {
    const delays = new Set(Array.from({ length: 50 }, () => nextRetryDelayMs(policy, 3)));
    expect(delays.size).toBeGreaterThan(1);
  });

  it('waits exactly as long as the server asked, not the backoff ceiling', () => {
    expect(nextRetryDelayMs(policy, 1, 30)).toBe(30_000);
    expect(nextRetryDelayMs(policy, 1, 60)).toBe(60_000);
  });

  it('refuses to retry when the server asks for longer than a request should wait', () => {
    expect(nextRetryDelayMs(policy, 1, 61)).toBeNull();
    expect(nextRetryDelayMs(policy, 1, 3_600)).toBeNull();
  });
});
