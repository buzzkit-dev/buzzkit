import { localInstant, localTime } from '@buzzkit/api/libs/timezone';
import { type CronFields, type Schedule, scheduleFields } from '@buzzkit/schema/workflows';

const MAX_LOOKAHEAD_DAYS = 366 * 5;

function weekdayOf(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function dayMatches(fields: CronFields, year: number, month: number, day: number): boolean {
  if (!fields.months.includes(month)) return false;
  const byDay = fields.days.includes(day);
  const byWeekday = fields.weekdays.includes(weekdayOf(year, month, day));
  if (fields.anyDay && fields.anyWeekday) return true;
  if (fields.anyDay) return byWeekday;
  if (fields.anyWeekday) return byDay;
  return byDay || byWeekday;
}

export function nextScheduleInstant(schedule: Schedule, after: Date, timezone: string): Date | null {
  const fields = scheduleFields(schedule);
  const start = localTime(after, timezone);
  let cursor = Date.UTC(start.year, start.month - 1, start.day);
  for (let offset = 0; offset < MAX_LOOKAHEAD_DAYS; offset += 1) {
    const date = new Date(cursor);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const day = date.getUTCDate();
    if (dayMatches(fields, year, month, day)) {
      for (const hour of fields.hours) {
        for (const minute of fields.minutes) {
          const instant = localInstant({ year, month, day, hour, minute }, timezone);
          if (instant.getTime() > after.getTime()) return instant;
        }
      }
    }
    cursor += 86_400_000;
  }
  return null;
}

export function dueInstants(
  schedule: Schedule,
  timezone: string,
  now: Date,
  lookbackMs: number,
  limit: number
): Date[] {
  const fires: Date[] = [];
  let after = new Date(now.getTime() - lookbackMs);
  while (fires.length < limit) {
    const next = nextScheduleInstant(schedule, after, timezone);
    if (!next || next.getTime() > now.getTime()) break;
    fires.push(next);
    after = next;
  }
  return fires;
}
