import {
  ATTEMPT_LEASE_SECONDS,
  backoffSeconds,
  decide,
  ERROR_POLICY,
  MAX_BACKOFF_SECONDS,
  MAX_DELIVERY_ATTEMPTS,
  OVERLOAD_PENALTY_SECONDS,
  RETRY_JITTER_RATIO,
  RETRY_SCHEDULE_SECONDS,
} from '@buzzkit/api/api/deliveries/policy';
import type { DeliveryErrorCode, ProviderSendResult } from '@buzzkit/api/providers/index';
import { describe, expect, it } from 'vitest';

const failure = (code: DeliveryErrorCode, retryAfterSeconds?: number): ProviderSendResult => ({
  ok: false,
  code,
  reason: code,
  request: null,
  response: null,
  latencyMs: 1,
  ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
});

const success: ProviderSendResult = {
  ok: true,
  providerMessageId: 'apns-id',
  request: null,
  response: null,
  latencyMs: 1,
};

const within = (value: number, base: number) => {
  expect(value).toBeGreaterThanOrEqual(Math.floor(base * (1 - RETRY_JITTER_RATIO)));
  expect(value).toBeLessThanOrEqual(Math.ceil(base * (1 + RETRY_JITTER_RATIO)));
};

describe('retry schedule', () => {
  it('is explicit, bounded, and lives inside the default 24h ttl', () => {
    expect(RETRY_SCHEDULE_SECONDS).toEqual([5, 30, 120, 600, 1800, 3600, 7200]);
    expect(MAX_DELIVERY_ATTEMPTS).toBe(8);
    expect(RETRY_SCHEDULE_SECONDS.reduce((sum, s) => sum + s, 0)).toBeLessThan(24 * 60 * 60);
    expect(ATTEMPT_LEASE_SECONDS).toBeGreaterThanOrEqual(30);
  });

  it('follows the schedule per attempt with ±20% jitter', () => {
    for (let attempt = 1; attempt <= RETRY_SCHEDULE_SECONDS.length; attempt++) {
      for (let i = 0; i < 50; i++) {
        within(backoffSeconds(attempt, 'transport'), RETRY_SCHEDULE_SECONDS[attempt - 1]!);
      }
    }
    const spread = new Set(Array.from({ length: 200 }, () => backoffSeconds(3, 'transport')));
    expect(spread.size).toBeGreaterThan(5);
  });

  it('never goes below the overload floor after a 429 or timeout, and honours Retry-After', () => {
    for (let i = 0; i < 50; i++) {
      expect(backoffSeconds(1, 'rate_limited')).toBeGreaterThanOrEqual(OVERLOAD_PENALTY_SECONDS * 0.8);
      expect(backoffSeconds(1, 'timeout')).toBeGreaterThanOrEqual(OVERLOAD_PENALTY_SECONDS * 0.8);
      within(backoffSeconds(1, 'provider_unavailable'), 5);
      within(backoffSeconds(1, 'rate_limited', 600), 600);
      within(backoffSeconds(7, 'transport', 10), 7200);
    }
  });

  it('caps at 24h (Cloudflare delaySeconds max) and clamps past the schedule end', () => {
    expect(backoffSeconds(1, 'rate_limited', 10 * 24 * 60 * 60)).toBe(MAX_BACKOFF_SECONDS);
    within(backoffSeconds(50, 'transport'), RETRY_SCHEDULE_SECONDS[RETRY_SCHEDULE_SECONDS.length - 1]!);
    within(backoffSeconds(0, 'transport'), RETRY_SCHEDULE_SECONDS[0]!);
  });
});

describe('decision matrix', () => {
  const now = new Date('2026-01-01T00:00:00Z');

  it('accepts a provider success as terminal sent', () => {
    expect(decide(1, success, now)).toEqual({
      status: 'sent',
      outcome: 'sent',
      terminal: true,
      counterDelta: 'sent',
      invalidatesSubscription: false,
      nextAttemptAt: null,
    });
  });

  it('invalidates the subscription only on invalid_endpoint, regardless of attempt number', () => {
    for (const attempt of [1, 4, 8, 20]) {
      const decision = decide(attempt, failure('invalid_endpoint'), now);
      expect(decision).toMatchObject({
        status: 'invalid',
        outcome: 'invalid',
        terminal: true,
        counterDelta: 'invalid',
        invalidatesSubscription: true,
        nextAttemptAt: null,
      });
    }
    const invalidators = Object.entries(ERROR_POLICY)
      .filter(([, p]) => p.invalidatesSubscription)
      .map(([c]) => c);
    expect(invalidators).toEqual(['invalid_endpoint']);
  });

  it('retries transient errors until the attempt cap, then fails terminally', () => {
    const transient: DeliveryErrorCode[] = ['rate_limited', 'provider_unavailable', 'transport', 'timeout'];
    for (const code of transient) {
      expect(ERROR_POLICY[code].retryable).toBe(true);
      for (let attempt = 1; attempt < MAX_DELIVERY_ATTEMPTS; attempt++) {
        const decision = decide(attempt, failure(code), now);
        expect(decision).toMatchObject({
          status: 'retrying',
          outcome: 'retry',
          terminal: false,
          counterDelta: null,
          invalidatesSubscription: false,
        });
        expect(decision.nextAttemptAt!.getTime()).toBeGreaterThan(now.getTime());
      }
      expect(decide(MAX_DELIVERY_ATTEMPTS, failure(code), now)).toMatchObject({
        status: 'failed',
        outcome: 'failed',
        terminal: true,
        counterDelta: 'failed',
        nextAttemptAt: null,
      });
    }
  });

  it('fails terminal errors on the first attempt without retry', () => {
    const terminal: DeliveryErrorCode[] = [
      'invalid_credential',
      'payload_invalid',
      'payload_too_large',
      'expired',
      'no_credential',
      'unsubscribed',
      'unsupported',
      'unknown',
    ];
    for (const code of terminal) {
      expect(ERROR_POLICY[code].retryable).toBe(false);
      expect(decide(1, failure(code), now)).toMatchObject({
        status: 'failed',
        outcome: 'failed',
        terminal: true,
        counterDelta: 'failed',
        invalidatesSubscription: false,
        nextAttemptAt: null,
      });
    }
  });

  it('covers every error code in the taxonomy exactly once', () => {
    const codes = Object.keys(ERROR_POLICY).sort();
    expect(codes).toEqual([
      'expired',
      'invalid_credential',
      'invalid_endpoint',
      'no_credential',
      'payload_invalid',
      'payload_too_large',
      'provider_unavailable',
      'rate_limited',
      'timeout',
      'transport',
      'unknown',
      'unsubscribed',
      'unsupported',
    ]);
  });
});
