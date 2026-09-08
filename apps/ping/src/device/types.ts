import { PingError, RateLimitedError } from '@buzzkit/ping/libs/error';

export type DeviceFailure = {
  ok: false;
  status: number;
  code: string;
  message: string;
  retryAfterSeconds?: number;
};

export type DeviceOutcome<T> = { ok: true; value: T } | DeviceFailure;

export function unwrap<T>(outcome: DeviceOutcome<T>): T {
  if (outcome.ok) return outcome.value;
  if (outcome.retryAfterSeconds !== undefined) throw new RateLimitedError(outcome.retryAfterSeconds);

  throw new PingError(outcome.status, outcome.message, { code: outcome.code });
}
