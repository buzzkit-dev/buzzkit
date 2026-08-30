import { DURATION_PATTERN, DURATION_UNIT_SECONDS, type Duration } from 'buzzkit/expressions';

export function isDuration(value: unknown): value is Duration {
  return typeof value === 'string' && DURATION_PATTERN.test(value);
}

export function durationSeconds(duration: Duration): number {
  const match = DURATION_PATTERN.exec(duration);
  if (!match) throw new RangeError(`Not a duration: ${duration}`);
  const amount = Number(match[1]);
  const unit = match[2] as keyof typeof DURATION_UNIT_SECONDS;
  return amount * DURATION_UNIT_SECONDS[unit];
}

export function describeDuration(duration: Duration): string {
  const match = DURATION_PATTERN.exec(duration);
  if (!match) return duration;
  const amount = Number(match[1]);
  const noun = { m: 'minute', h: 'hour', d: 'day' }[match[2] as 'm' | 'h' | 'd'];
  return `${amount} ${noun}${amount === 1 ? '' : 's'}`;
}
