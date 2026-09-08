import { PAIR_RATE_LIMIT } from '@buzzkit/ping/api/pair/index';
import { PING_RATE_LIMIT } from '@buzzkit/ping/api/ping/index';
import type { RateLimit } from '@buzzkit/ping/utils/budget';
import { spendBudget } from '@buzzkit/ping/utils/budget';
import { describe, expect, it } from 'vitest';
import { NOW } from './session';

const PER_MINUTE: RateLimit = { tokens: 60, perSeconds: 60, burst: 10 };

function drain(limit: RateLimit, now: number) {
  let budget = spendBudget(null, now, limit).budget;
  for (let attempt = 1; attempt < limit.burst; attempt += 1) {
    budget = spendBudget(budget, now, limit).budget;
  }
  return budget;
}

describe('spendBudget', () => {
  it('starts full and spends one token', () => {
    const spend = spendBudget(null, NOW, PER_MINUTE);

    expect(spend.allowed).toBe(true);
    expect(spend.budget.tokens).toBe(9);
  });

  it('refuses once the burst is exhausted', () => {
    const spend = spendBudget(drain(PER_MINUTE, NOW), NOW, PER_MINUTE);

    expect(spend.allowed).toBe(false);
    expect(spend.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('refills over time at the configured rate', () => {
    const spend = spendBudget({ tokens: 0, refilledAt: NOW }, NOW + 2_000, PER_MINUTE);

    expect(spend.allowed).toBe(true);
  });

  it('never refills beyond the burst ceiling', () => {
    const spend = spendBudget({ tokens: 10, refilledAt: NOW - 3_600_000 }, NOW, PER_MINUTE);

    expect(spend.budget.tokens).toBe(9);
  });

  it('ignores a clock that went backwards instead of draining the bucket', () => {
    const spend = spendBudget({ tokens: 5, refilledAt: NOW + 60_000 }, NOW, PER_MINUTE);

    expect(spend.allowed).toBe(true);
    expect(spend.budget.tokens).toBe(4);
  });

  it('reads the rate in the unit the limit declares, not per minute', () => {
    const hourly: RateLimit = { tokens: 5, perSeconds: 3_600, burst: 1 };
    const spent = spendBudget(null, NOW, hourly);

    expect(spent.allowed).toBe(true);
    expect(spendBudget(spent.budget, NOW + 60_000, hourly).allowed).toBe(false);
    expect(spendBudget(spent.budget, NOW + 12 * 60_000, hourly).allowed).toBe(true);
  });

  it('limits pairing per hour and pinging per minute', () => {
    expect(PAIR_RATE_LIMIT.perSeconds).toBe(3_600);
    expect(PING_RATE_LIMIT.perSeconds).toBe(60);
  });
});
