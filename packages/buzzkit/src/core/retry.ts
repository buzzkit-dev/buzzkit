export type RetryPolicy = {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
};

export const RETRY_POLICY: Omit<RetryPolicy, 'maxRetries'> = {
  initialDelayMs: 500,
  maxDelayMs: 8_000,
};

const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

export function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUSES.has(status);
}

export function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;

  const trimmed = header.trim();
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const seconds = Number(trimmed);
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
  }

  const at = Date.parse(trimmed);
  if (Number.isNaN(at)) return undefined;

  return Math.max(0, Math.ceil((at - Date.now()) / 1000));
}

export function nextRetryDelayMs(
  policy: RetryPolicy,
  attemptsMade: number,
  retryAfterSeconds?: number
): number {
  if (retryAfterSeconds !== undefined) {
    return Math.min(retryAfterSeconds * 1000, policy.maxDelayMs);
  }

  const exponential = policy.initialDelayMs * 2 ** attemptsMade;
  const capped = Math.min(exponential, policy.maxDelayMs);

  return Math.round(capped * (0.5 + Math.random() * 0.5));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
