import { BadRequestError } from '@buzzkit/api/libs/error';
import { DAY_MS } from '@buzzkit/api/libs/timezone';
import { type Column, type SQL, sql } from '@buzzkit/database';
import { FAILED_STATUSES, MAX_RANGE_DAYS, PENDING_STATUSES, SENT_STATUSES } from './constants';
import type { StatsInterval, StatsRange } from './types';

export function resolveStatsRange(query: { from?: string; to?: string }, now = new Date()): StatsRange {
  const to = query.to ? new Date(query.to) : now;
  const from = query.from ? new Date(query.from) : new Date(to.getTime() - 7 * DAY_MS);
  if (from > to) {
    throw new BadRequestError('`from` must be before `to`', { param: 'from' });
  }
  if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * DAY_MS) {
    throw new BadRequestError(`Ranges longer than ${MAX_RANGE_DAYS} days are not supported`, {
      param: 'from',
    });
  }

  return { from, to };
}

export function resolveStatsInterval(range: StatsRange, requested?: StatsInterval): StatsInterval {
  if (requested) return requested;

  const days = (range.to.getTime() - range.from.getTime()) / DAY_MS;
  if (days <= 2) return 'hour';
  if (days <= 120) return 'day';
  if (days <= 200) return 'week';

  return 'month';
}

export function truncate(date: Date, interval: StatsInterval): Date {
  const at = new Date(date);
  at.setUTCMinutes(0, 0, 0);
  if (interval === 'hour') return at;

  at.setUTCHours(0);
  if (interval === 'week') at.setUTCDate(at.getUTCDate() - ((at.getUTCDay() + 6) % 7));
  if (interval === 'month') at.setUTCDate(1);

  return at;
}

export function advance(date: Date, interval: StatsInterval): Date {
  const next = new Date(date);
  if (interval === 'hour') next.setUTCHours(next.getUTCHours() + 1);
  else if (interval === 'day') next.setUTCDate(next.getUTCDate() + 1);
  else if (interval === 'week') next.setUTCDate(next.getUTCDate() + 7);
  else next.setUTCMonth(next.getUTCMonth() + 1);

  return next;
}

export function bucketKey(date: Date): string {
  return date.toISOString().replace('.000Z', 'Z');
}

export function bucketOf(column: SQL | Column, interval: StatsInterval) {
  return sql<string>`to_char(date_trunc(${sql.raw(`'${interval}'`)}, ${column} at time zone 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;
}

export function bucket(
  status: string,
  capped: boolean
): 'sent' | 'failed' | 'capped' | 'invalid' | 'pending' {
  if (SENT_STATUSES.includes(status)) return 'sent';
  if (FAILED_STATUSES.includes(status)) return capped ? 'capped' : 'failed';
  if (PENDING_STATUSES.includes(status)) return 'pending';

  return 'invalid';
}
