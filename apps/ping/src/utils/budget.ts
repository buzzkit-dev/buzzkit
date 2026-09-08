export type Budget = {
  tokens: number;
  refilledAt: number;
};

export type RateLimit = {
  tokens: number;
  perSeconds: number;
  burst: number;
};

export type BudgetSpend = {
  budget: Budget;
  allowed: boolean;
  retryAfterSeconds: number;
};

export function spendBudget(current: Budget | null, now: number, limit: RateLimit): BudgetSpend {
  const ratePerMs = limit.tokens / (limit.perSeconds * 1000);
  const previous = current ?? { tokens: limit.burst, refilledAt: now };
  const elapsed = Math.max(0, now - previous.refilledAt);
  const refilled = Math.min(limit.burst, previous.tokens + elapsed * ratePerMs);

  if (refilled < 1) {
    return {
      budget: { tokens: refilled, refilledAt: now },
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((1 - refilled) / ratePerMs / 1000)),
    };
  }

  return {
    budget: { tokens: refilled - 1, refilledAt: now },
    allowed: true,
    retryAfterSeconds: 0,
  };
}
