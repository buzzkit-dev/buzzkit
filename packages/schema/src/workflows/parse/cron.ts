import { WALL_TIME_PATTERN } from '../constants';
import type { Schedule } from '../types';

export type CronFields = {
  minutes: number[];
  hours: number[];
  days: number[];
  months: number[];
  weekdays: number[];
  anyDay: boolean;
  anyWeekday: boolean;
};

type Field = { name: string; min: number; max: number; names?: readonly string[] };

const FIELDS: readonly Field[] = [
  { name: 'minute', min: 0, max: 59 },
  { name: 'hour', min: 0, max: 23 },
  { name: 'day of month', min: 1, max: 31 },
  {
    name: 'month',
    min: 1,
    max: 12,
    names: ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'],
  },
  { name: 'day of week', min: 0, max: 7, names: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] },
];

export class CronError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CronError';
  }
}

function parseNumber(raw: string, field: Field): number {
  const named = field.names?.indexOf(raw.toLowerCase()) ?? -1;
  if (named >= 0) return named + field.min;
  if (!/^\d+$/.test(raw)) {
    throw new CronError(`"${raw}" is not a ${field.name}.`);
  }
  const value = Number(raw);
  if (value < field.min || value > field.max) {
    throw new CronError(`The ${field.name} runs from ${field.min} to ${field.max}, got ${value}.`);
  }
  return value;
}

function parseField(raw: string, field: Field): { values: number[]; any: boolean } {
  const values = new Set<number>();
  let any = false;
  for (const part of raw.split(',')) {
    const [range, stepRaw, ...rest] = part.split('/');
    if (range === undefined || range === '' || rest.length > 0 || stepRaw === '') {
      throw new CronError(`"${part}" is not a ${field.name} range.`);
    }
    const step = stepRaw === undefined ? 1 : Number(stepRaw);
    if (!Number.isInteger(step) || step < 1) {
      throw new CronError(`A step in the ${field.name} is a whole number from 1, got "${stepRaw}".`);
    }
    let start: number;
    let end: number;
    if (range === '*') {
      start = field.min;
      end = field.max;
      if (stepRaw === undefined) any = true;
    } else if (range.includes('-')) {
      const [from, to, ...more] = range.split('-');
      if (!from || !to || more.length > 0) throw new CronError(`"${range}" is not a ${field.name} range.`);
      start = parseNumber(from, field);
      end = parseNumber(to, field);
      if (start > end) {
        throw new CronError(`A ${field.name} range runs upward, got "${range}".`);
      }
    } else {
      start = parseNumber(range, field);
      end = stepRaw === undefined ? start : field.max;
    }
    for (let value = start; value <= end; value += step) values.add(value);
  }
  return { values: [...values].sort((left, right) => left - right), any };
}

export function parseCron(expression: string): CronFields {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new CronError(
      `A cron expression has five fields (minute, hour, day of month, month, day of week), got ${parts.length}.`
    );
  }
  const [minutes, hours, days, months, weekdays] = parts.map((part, index) =>
    parseField(part, FIELDS[index] as Field)
  ) as [ReturnType<typeof parseField>, ...ReturnType<typeof parseField>[]];
  const weekdayValues = [...new Set((weekdays?.values ?? []).map((day) => day % 7))].sort(
    (left, right) => left - right
  );
  return {
    minutes: minutes.values,
    hours: hours?.values ?? [],
    days: days?.values ?? [],
    months: months?.values ?? [],
    weekdays: weekdayValues,
    anyDay: days?.any ?? true,
    anyWeekday: weekdays?.any ?? true,
  };
}

export function cronProblem(expression: unknown): string | null {
  if (typeof expression !== 'string') return 'A cron expression is a string such as "0 10 * * MON".';
  try {
    parseCron(expression);
    return null;
  } catch (caught) {
    if (caught instanceof CronError) return caught.message;
    throw caught;
  }
}

export function scheduleFields(schedule: Schedule): CronFields {
  if ('cron' in schedule) return parseCron(schedule.cron);
  if (!WALL_TIME_PATTERN.test(schedule.daily)) {
    throw new CronError(`A daily time looks like "19:00", got "${schedule.daily}".`);
  }
  const [hour, minute] = schedule.daily.split(':').map(Number) as [number, number];
  return parseCron(`${minute} ${hour} * * *`);
}
