export type RetryPolicy = {
  scheduleSeconds: readonly number[];
  jitterRatio: number;
  maxDelaySeconds: number;
};

export function nextRetryDelaySeconds(
  policy: RetryPolicy,
  attemptsMade: number,
  options: { floorSeconds?: number; retryAfterSeconds?: number } = {}
): number | null {
  const scheduled = policy.scheduleSeconds[attemptsMade - 1];
  if (scheduled === undefined) return null;
  const base = Math.max(scheduled, options.floorSeconds ?? 0, options.retryAfterSeconds ?? 0);
  const jitter = base * policy.jitterRatio * (Math.random() * 2 - 1);

  return Math.min(policy.maxDelaySeconds, Math.max(1, Math.round(base + jitter)));
}
